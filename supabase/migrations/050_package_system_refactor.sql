-- =====================================================
-- MIGRATION 050: Package System Refactor
-- Adiciona validade semanal/mensal, slots de sessão,
-- agendamento automático e rastreio de realização.
-- =====================================================

-- 1. Adicionar validity_type em service_packages
ALTER TABLE public.service_packages
  ADD COLUMN IF NOT EXISTS validity_type TEXT 
  CHECK (validity_type IN ('weekly', 'monthly', 'none')) 
  DEFAULT 'none';

-- Migrar dados existentes: se validity_days <= 7 -> weekly, <= 31 -> monthly, else none
UPDATE public.service_packages SET
  validity_type = CASE
    WHEN validity_days IS NULL THEN 'none'
    WHEN validity_days <= 7 THEN 'weekly'
    WHEN validity_days <= 31 THEN 'monthly'
    ELSE 'none'
  END;

-- 2. Adicionar campos de agendamento automático em customer_packages
ALTER TABLE public.customer_packages
  ADD COLUMN IF NOT EXISTS preferred_weekday INTEGER 
  CHECK (preferred_weekday BETWEEN 0 AND 6); -- 0=Dom, 1=Seg, ..., 6=Sáb

ALTER TABLE public.customer_packages
  ADD COLUMN IF NOT EXISTS preferred_time TEXT; -- ex: '13:00'

ALTER TABLE public.customer_packages
  ADD COLUMN IF NOT EXISTS is_auto_schedule BOOLEAN DEFAULT false;

ALTER TABLE public.customer_packages
  ADD COLUMN IF NOT EXISTS period_label TEXT; -- ex: 'Março 2026' ou 'Semana 11/03'

-- 3. Criar tabela package_schedule_slots
-- Cada linha representa uma sessão/uso do pacote em um período
CREATE TABLE IF NOT EXISTS public.package_schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_package_id UUID NOT NULL REFERENCES public.customer_packages(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  slot_date DATE NOT NULL,
  slot_time TEXT, -- '13:00'
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'scheduled', 'done', 'skipped', 'rescheduled')),
  period_label TEXT, -- 'Março 2026' ou 'Sem 11/03'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Adicionar package_slot_id em appointments para rastrear sessão
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS package_slot_id UUID REFERENCES public.package_schedule_slots(id) ON DELETE SET NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_package_slots_customer_package ON public.package_schedule_slots(customer_package_id);
CREATE INDEX IF NOT EXISTS idx_package_slots_status ON public.package_schedule_slots(status);
CREATE INDEX IF NOT EXISTS idx_package_slots_appointment ON public.package_schedule_slots(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointments_package_slot ON public.appointments(package_slot_id);

-- 5. RLS para package_schedule_slots
ALTER TABLE public.package_schedule_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org package slots" ON public.package_schedule_slots
  FOR SELECT USING (
    customer_package_id IN (
      SELECT id FROM public.customer_packages
      WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Staff can manage package slots" ON public.package_schedule_slots
  FOR ALL USING (
    customer_package_id IN (
      SELECT id FROM public.customer_packages
      WHERE org_id IN (
        SELECT org_id FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
      )
    )
  );

-- 6. Trigger para updated_at em package_schedule_slots
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.package_schedule_slots
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7. Função: gera os slots de um período para um customer_package
-- Retorna o número de slots criados
CREATE OR REPLACE FUNCTION public.generate_package_slots(
  p_customer_package_id UUID,
  p_period_start DATE DEFAULT NULL -- NULL = início do período atual
)
RETURNS INTEGER AS $$
DECLARE
  v_cp RECORD;
  v_pkg RECORD;
  v_period_start DATE;
  v_period_end DATE;
  v_period_label TEXT;
  v_slot_date DATE;
  v_slots_created INTEGER := 0;
  v_item RECORD;
  v_slots_per_item INTEGER;
  v_offset INTEGER;
  v_weekday INTEGER;
  v_time TEXT;
BEGIN
  -- Buscar dados do customer_package
  SELECT cp.*, sp.validity_type, sp.name as package_name
  INTO v_cp
  FROM public.customer_packages cp
  JOIN public.service_packages sp ON sp.id = cp.package_id
  WHERE cp.id = p_customer_package_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Definir período
  IF p_period_start IS NULL THEN
    p_period_start := CURRENT_DATE;
  END IF;

  IF v_cp.validity_type = 'monthly' THEN
    v_period_start := DATE_TRUNC('month', p_period_start)::DATE;
    v_period_end := (DATE_TRUNC('month', p_period_start) + INTERVAL '1 month - 1 day')::DATE;
    v_period_label := TO_CHAR(v_period_start, 'Mon YYYY');
  ELSIF v_cp.validity_type = 'weekly' THEN
    v_period_start := DATE_TRUNC('week', p_period_start)::DATE + INTERVAL '1 day'; -- Segunda
    v_period_end := v_period_start + INTERVAL '6 days';
    v_period_label := 'Sem ' || TO_CHAR(v_period_start, 'DD/MM');
  ELSE
    -- Sem validade definida, usar mês atual por padrão
    v_period_start := DATE_TRUNC('month', p_period_start)::DATE;
    v_period_end := (DATE_TRUNC('month', p_period_start) + INTERVAL '1 month - 1 day')::DATE;
    v_period_label := TO_CHAR(v_period_start, 'Mon YYYY');
  END IF;

  -- Para cada item do pacote, criar os slots distribuídos no período
  FOR v_item IN (
    SELECT pi.service_id, pi.quantity
    FROM public.package_items pi
    WHERE pi.package_id = v_cp.package_id
  ) LOOP
    -- Se tem dia da semana preferido, distribuir pelas semanas do período
    IF v_cp.preferred_weekday IS NOT NULL AND v_cp.is_auto_schedule = true THEN
      v_weekday := v_cp.preferred_weekday;
      v_time := COALESCE(v_cp.preferred_time, '09:00');
      v_slots_per_item := v_item.quantity;
      v_slot_date := v_period_start;

      -- Avançar até o primeiro dia da semana preferido
      -- DOW: 0=Dom, 1=Seg, ..., 6=Sex
      v_offset := (v_weekday - EXTRACT(DOW FROM v_period_start)::INTEGER + 7) % 7;
      v_slot_date := v_period_start + v_offset;

      -- Criar slots para cada ocorrência do dia no período
      WHILE v_slot_date <= v_period_end AND v_slots_per_item > 0 LOOP
        -- Verificar se já existe slot para este período/data/serviço
        IF NOT EXISTS (
          SELECT 1 FROM public.package_schedule_slots
          WHERE customer_package_id = p_customer_package_id
            AND service_id = v_item.service_id
            AND slot_date = v_slot_date
        ) THEN
          INSERT INTO public.package_schedule_slots (
            customer_package_id, service_id, slot_date, slot_time,
            status, period_label
          ) VALUES (
            p_customer_package_id, v_item.service_id, v_slot_date, v_time,
            'pending', v_period_label
          );
          v_slots_created := v_slots_created + 1;
          v_slots_per_item := v_slots_per_item - 1;
        END IF;
        v_slot_date := v_slot_date + 7; -- Próxima semana
      END LOOP;
    ELSE
      -- Sem dia preferido: criar slots "floating" com data = início do período
      -- Serão agendados manualmente
      IF NOT EXISTS (
        SELECT 1 FROM public.package_schedule_slots
        WHERE customer_package_id = p_customer_package_id
          AND service_id = v_item.service_id
          AND period_label = v_period_label
      ) THEN
        FOR i IN 1..v_item.quantity LOOP
          INSERT INTO public.package_schedule_slots (
            customer_package_id, service_id, slot_date, slot_time,
            status, period_label
          ) VALUES (
            p_customer_package_id, v_item.service_id, v_period_start, NULL,
            'pending', v_period_label
          );
          v_slots_created := v_slots_created + 1;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  RETURN v_slots_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Função: marcar slot como realizado quando appointment recebe checkout
CREATE OR REPLACE FUNCTION public.complete_package_slot(
  p_appointment_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.package_schedule_slots
  SET status = 'done', updated_at = now()
  WHERE appointment_id = p_appointment_id
    AND status IN ('scheduled', 'pending');

  -- Também atualizar package_credits (used_quantity) se não foi feito ainda
  -- Isso é feito via package_credit_id no appointment original

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================
