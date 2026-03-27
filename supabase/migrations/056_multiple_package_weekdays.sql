-- Migration: Support Multiple Weekdays for Packages
-- Adiciona suporte a múltiplos dias da semana para agendamento automático de pacotes.

-- 1. Adicionar coluna preferred_weekdays (array de inteiros)
ALTER TABLE public.customer_packages
  ADD COLUMN IF NOT EXISTS preferred_weekdays INTEGER[];

-- 2. Migrar dados existentes de preferred_weekday para preferred_weekdays
UPDATE public.customer_packages
SET preferred_weekdays = ARRAY[preferred_weekday]
WHERE preferred_weekday IS NOT NULL AND preferred_weekdays IS NULL;

-- 3. Atualizar a função generate_package_slots para usar preferred_weekdays
CREATE OR REPLACE FUNCTION public.generate_package_slots(
  p_customer_package_id UUID,
  p_period_start DATE DEFAULT NULL
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
  v_weekday INTEGER;
  v_time TEXT;
  v_current_date DATE;
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
    -- Sem validade definida, usar próximo mês por padrão ou validade do pacote
    v_period_start := p_period_start;
    IF v_cp.expires_at IS NOT NULL THEN
      v_period_end := v_cp.expires_at::DATE;
    ELSE
      v_period_end := (p_period_start + INTERVAL '1 month')::DATE;
    END IF;
    v_period_label := TO_CHAR(v_period_start, 'DD/MM/YY');
  END IF;

  -- Para cada item do pacote, criar os slots distribuídos no período
  FOR v_item IN (
    SELECT pi.service_id, pi.quantity
    FROM public.package_items pi
    WHERE pi.package_id = v_cp.package_id
  ) LOOP
    -- Se tem dias da semana preferidos e agendamento automático
    IF v_cp.is_auto_schedule = true AND (v_cp.preferred_weekdays IS NOT NULL AND array_length(v_cp.preferred_weekdays, 1) > 0) THEN
      v_time := COALESCE(v_cp.preferred_time, '09:00');
      v_slots_per_item := v_item.quantity;
      v_current_date := v_period_start;

      -- Percorrer cada dia do período em ordem cronológica
      WHILE v_current_date <= v_period_end AND v_slots_per_item > 0 LOOP
        -- Se o dia atual está nos dias preferidos
        IF EXTRACT(DOW FROM v_current_date)::INTEGER = ANY(v_cp.preferred_weekdays) THEN
          -- Verificar se já existe slot para este período/data/serviço
          IF NOT EXISTS (
            SELECT 1 FROM public.package_schedule_slots
            WHERE customer_package_id = p_customer_package_id
              AND service_id = v_item.service_id
              AND slot_date = v_current_date
          ) THEN
            INSERT INTO public.package_schedule_slots (
              customer_package_id, service_id, slot_date, slot_time,
              status, period_label
            ) VALUES (
              p_customer_package_id, v_item.service_id, v_current_date, v_time,
              'pending', v_period_label
            );
            v_slots_created := v_slots_created + 1;
            v_slots_per_item := v_slots_per_item - 1;
          END IF;
        END IF;
        v_current_date := v_current_date + 1;
      END LOOP;
    ELSE
      -- Sem dia preferido: criar slots "floating" com data = início do período
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
