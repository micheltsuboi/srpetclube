
-- Migration: Fix package session generation and indexing (v2)
-- - Adiciona package_usage_index na criação de agendamentos automáticos
-- - Garante que agendamentos manuais (floating slots) sejam criados corretamente
-- - Corrige o used_quantity para refletir apenas sessões realizadas

CREATE OR REPLACE FUNCTION public.generate_package_slots(
  p_customer_package_id UUID,
  p_period_start DATE DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_cp RECORD;
  v_period_start DATE;
  v_period_label TEXT;
  v_slot_date DATE;
  v_slots_created INTEGER := 0;
  v_existing_slots INTEGER := 0;
  v_item RECORD;
  v_slots_per_item INTEGER;
  v_time TEXT;
  v_category_id UUID;
  v_credit_id UUID;
  v_appointment_id UUID;
  v_scheduled_at TIMESTAMPTZ;
  v_safety_count INTEGER := 0;
  v_usage_index INTEGER;
BEGIN
  -- 1. Buscar dados do contrato (customer_package)
  SELECT cp.*, sp.validity_type, sp.name as package_name INTO v_cp
  FROM public.customer_packages cp
  JOIN public.service_packages sp ON sp.id = cp.package_id
  WHERE cp.id = p_customer_package_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  -- 2. Definir data de início e label
  IF p_period_start IS NULL THEN 
    v_slot_date := CURRENT_DATE; 
  ELSE 
    v_slot_date := p_period_start; 
  END IF;
  
  v_period_label := TO_CHAR(v_slot_date, 'DD/MM/YY');

  -- 3. Percorrer itens do pacote template
  FOR v_item IN (
    SELECT pi.service_id, pi.quantity 
    FROM public.package_items pi 
    WHERE pi.package_id = v_cp.package_id
  ) LOOP
    
    -- Buscar categoria do serviço (pode ser NULL)
    SELECT category_id INTO v_category_id 
    FROM public.services 
    WHERE id = v_item.service_id;
    
    -- Buscar ID do crédito para vínculo
    SELECT id INTO v_credit_id 
    FROM public.package_credits 
    WHERE customer_package_id = p_customer_package_id 
      AND service_id = v_item.service_id 
    LIMIT 1;

    -- CASO A: Agendamento Automático (com dias definidos)
    IF v_cp.is_auto_schedule = true AND (v_cp.preferred_weekdays IS NOT NULL AND array_length(v_cp.preferred_weekdays, 1) > 0) THEN
      v_time := COALESCE(v_cp.preferred_time, '09:00');
      v_slots_per_item := v_item.quantity;
      -- Resetar v_slot_date para o início para cada item
      v_slot_date := CASE WHEN p_period_start IS NULL THEN CURRENT_DATE ELSE p_period_start END;
      v_safety_count := 0;

      -- Contar quantos slots já existem para este item (em caso de re-geração)
      SELECT count(*) INTO v_existing_slots
      FROM public.package_schedule_slots
      WHERE customer_package_id = p_customer_package_id
        AND service_id = v_item.service_id;
        
      v_slots_per_item := v_item.quantity - v_existing_slots;

      WHILE v_slots_per_item > 0 AND v_safety_count < 1000 LOOP
        IF EXTRACT(DOW FROM v_slot_date)::INTEGER = ANY(v_cp.preferred_weekdays) THEN
          -- Verificar se já existe slot específico para esta data
          IF NOT EXISTS (
            SELECT 1 FROM public.package_schedule_slots 
            WHERE customer_package_id = p_customer_package_id 
              AND service_id = v_item.service_id 
              AND slot_date = v_slot_date
          ) THEN
            
            -- Calcular índice (X de N)
            v_usage_index := v_item.quantity - v_slots_per_item + 1;
            
            -- Construir timestamp
            v_scheduled_at := (v_slot_date::text || 'T' || v_time || ':00-03:00')::TIMESTAMPTZ;

            -- Inserir agendamento
            INSERT INTO public.appointments (
              org_id, pet_id, service_id, service_category_id, customer_id, 
              scheduled_at, status, package_credit_id, calculated_price, final_price, 
              payment_status, discount_percent, package_usage_index
            ) VALUES (
              v_cp.org_id, v_cp.pet_id, v_item.service_id, v_category_id, v_cp.customer_id, 
              v_scheduled_at, 'pending', v_credit_id, 0, 0, 
              'paid', 100, v_usage_index
            ) RETURNING id INTO v_appointment_id;

            -- Abater do saldo de agendamento (remaining_quantity)
            IF v_credit_id IS NOT NULL THEN
              UPDATE public.package_credits
              SET remaining_quantity = GREATEST(0, remaining_quantity - 1),
                  updated_at = now()
              WHERE id = v_credit_id;
            END IF;

            -- Inserir slot vinculado
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

    -- CASO B: Agendamento Manual ou Sem Dias Definidos
    ELSE
      -- Contar quantos slots já existem
      SELECT count(*) INTO v_existing_slots
      FROM public.package_schedule_slots
      WHERE customer_package_id = p_customer_package_id
        AND service_id = v_item.service_id;
      
      FOR i IN (v_existing_slots + 1)..v_item.quantity LOOP
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
  END LOOP;

  RETURN v_slots_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
