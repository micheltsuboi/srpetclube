-- Migration: Restore Appointment Creation in Package Slots
-- Atualiza a função generate_package_slots para que, ao criar um slot automático,
-- também insira o agendamento correspondente na tabela 'appointments'.

CREATE OR REPLACE FUNCTION public.generate_package_slots(
  p_customer_package_id UUID,
  p_period_start DATE DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_cp RECORD;
  v_pkg RECORD;
  v_period_start DATE;
  v_period_label TEXT;
  v_slot_date DATE;
  v_slots_created INTEGER := 0;
  v_item RECORD;
  v_slots_per_item INTEGER;
  v_time TEXT;
  v_category_id UUID;
  v_credit_id UUID;
  v_appointment_id UUID;
  v_scheduled_at TIMESTAMPTZ;
  v_safety_count INTEGER := 0;
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

  -- Definir início
  IF p_period_start IS NULL THEN
    v_slot_date := CURRENT_DATE;
  ELSE
    v_slot_date := p_period_start;
  END IF;

  -- Definir rótulo do período
  v_period_label := TO_CHAR(v_slot_date, 'DD/MM/YY');

  -- Para cada item do pacote
  FOR v_item IN (
    SELECT pi.service_id, pi.quantity
    FROM public.package_items pi
    WHERE pi.package_id = v_cp.package_id
  ) LOOP
  
    -- Buscar categoria do serviço
    SELECT category_id INTO v_category_id
    FROM public.services
    WHERE id = v_item.service_id;
    
    -- Buscar crédito correspondente
    SELECT id INTO v_credit_id
    FROM public.package_credits
    WHERE customer_package_id = p_customer_package_id
      AND service_id = v_item.service_id
    LIMIT 1;

    -- Agendamento AUTOMÁTICO
    IF v_cp.is_auto_schedule = true AND (v_cp.preferred_weekdays IS NOT NULL AND array_length(v_cp.preferred_weekdays, 1) > 0) THEN
      v_time := COALESCE(v_cp.preferred_time, '09:00');
      v_slots_per_item := v_item.quantity;
      v_slot_date := CASE WHEN p_period_start IS NULL THEN CURRENT_DATE ELSE p_period_start END;
      v_safety_count := 0;

      WHILE v_slots_per_item > 0 AND v_safety_count < 1000 LOOP
        IF EXTRACT(DOW FROM v_slot_date)::INTEGER = ANY(v_cp.preferred_weekdays) THEN
          -- Verificar se já existe slot
          IF NOT EXISTS (
            SELECT 1 FROM public.package_schedule_slots
            WHERE customer_package_id = p_customer_package_id
              AND service_id = v_item.service_id
              AND slot_date = v_slot_date
          ) THEN
            
            -- Construir timestamp do agendamento (Horário de Brasília -03:00)
            v_scheduled_at := (v_slot_date::text || 'T' || v_time || ':00-03:00')::TIMESTAMPTZ;

            -- 1. Inserir na agenda geral (appointments)
            INSERT INTO public.appointments (
              org_id, pet_id, service_id, service_category_id, customer_id,
              scheduled_at, status, package_credit_id, calculated_price, final_price, 
              payment_status, discount_percent
            ) VALUES (
              v_cp.org_id, v_cp.pet_id, v_item.service_id, v_category_id, v_cp.customer_id,
              v_scheduled_at, 'pending', v_credit_id, 0, 0, 
              'paid', 100
            ) RETURNING id INTO v_appointment_id;

            -- 2. Inserir no slot do pacote vinculado ao appointment
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
        END IF;
        
        v_slot_date := v_slot_date + 1;
        v_safety_count := v_safety_count + 1;
      END LOOP;
      
    ELSE
      -- Agendamento MANUAL: Criar slots "floating"
      IF NOT EXISTS (
        SELECT 1 FROM public.package_schedule_slots
        WHERE customer_package_id = p_customer_package_id
          AND service_id = v_item.service_id
      ) THEN
        FOR i IN 1..v_item.quantity LOOP
          INSERT INTO public.package_schedule_slots (
            customer_package_id, service_id, slot_date, slot_time,
            status, period_label
          ) VALUES (
            p_customer_package_id, v_item.service_id, 
            CASE WHEN p_period_start IS NULL THEN CURRENT_DATE ELSE p_period_start END, 
            NULL, 'pending', v_period_label
          );
          v_slots_created := v_slots_created + 1;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  RETURN v_slots_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
