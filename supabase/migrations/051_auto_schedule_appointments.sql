-- =====================================================
-- MIGRATION 051: Auto Schedule Appointments
-- Corrige a função generate_package_slots para também
-- inserir os agendamentos na tabela 'appointments'
-- para que apareçam na agenda geral.
-- =====================================================

CREATE OR REPLACE FUNCTION public.generate_package_slots(
  p_customer_package_id UUID,
  p_period_start DATE DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_cp RECORD;
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
  v_category_id UUID;
  v_credit_id UUID;
  v_appointment_id UUID;
  v_scheduled_at TIMESTAMPTZ;
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
  
    -- Buscar categoria do serviço para o appointment
    SELECT category_id INTO v_category_id
    FROM public.services
    WHERE id = v_item.service_id;
    
    -- Buscar crédito do pacote para vincular
    SELECT id INTO v_credit_id
    FROM public.package_credits
    WHERE customer_package_id = p_customer_package_id
      AND service_id = v_item.service_id
    LIMIT 1;

    -- Se tem dia da semana preferido, distribuir pelas semanas do período
    IF v_cp.preferred_weekday IS NOT NULL AND v_cp.is_auto_schedule = true THEN
      v_weekday := v_cp.preferred_weekday;
      v_time := COALESCE(v_cp.preferred_time, '09:00');
      v_slots_per_item := v_item.quantity;
      
      -- Avançar até o primeiro dia da semana preferido
      -- DOW: 0=Dom, 1=Seg, ..., 6=Sáb
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
        
          v_scheduled_at := (v_slot_date::text || 'T' || v_time || ':00-03:00')::TIMESTAMPTZ;
          
          -- Inserir agendamento na agenda geral
          INSERT INTO public.appointments (
            org_id, pet_id, service_id, service_category_id, customer_id,
            scheduled_at, status, package_credit_id, calculated_price, final_price, payment_status, discount_percent
          ) VALUES (
            v_cp.org_id, v_cp.pet_id, v_item.service_id, v_category_id, v_cp.customer_id,
            v_scheduled_at, 'pending', v_credit_id, 0, 0, 'paid', 100
          ) RETURNING id INTO v_appointment_id;

          -- Inserir o slot do pacote vinculado ao agendamento
          INSERT INTO public.package_schedule_slots (
            customer_package_id, service_id, slot_date, slot_time,
            status, period_label, appointment_id
          ) VALUES (
            p_customer_package_id, v_item.service_id, v_slot_date, v_time,
            'scheduled', v_period_label, v_appointment_id
          );
          v_slots_created := v_slots_created + 1;
          v_slots_per_item := v_slots_per_item - 1;
        END IF;
        v_slot_date := v_slot_date + 7; -- Próxima semana
      END LOOP;
    ELSE
      -- Sem dia preferido: criar slots "floating" com data = início do período
      -- Serão agendados manualmente (sem appointment)
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
