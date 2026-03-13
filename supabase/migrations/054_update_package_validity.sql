-- =====================================================
-- MIGRATION 054: Update Package Validity
-- Converte pacotes mensais para semanais de 5 semanas.
-- Ajusta a lógica de auto-agendamento para partir sempre da
-- data de contratação, sem arredondar pro início da semana/mês.
-- =====================================================

-- 1. Atualiza os pacotes existentes
UPDATE public.service_packages
SET validity_type = 'weekly',
    validity_days = 35
WHERE validity_type = 'monthly';

-- 2. Reescreve a função de autogeração para não voltar datas
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
  v_offset INTEGER;
  v_weekday INTEGER;
  v_time TEXT;
  v_category_id UUID;
  v_credit_id UUID;
  v_appointment_id UUID;
  v_scheduled_at TIMESTAMPTZ;
BEGIN
  -- Buscar dados do customer_package
  SELECT cp.*, sp.validity_type, sp.name as package_name, sp.validity_days
  INTO v_cp
  FROM public.customer_packages cp
  JOIN public.service_packages sp ON sp.id = cp.package_id
  WHERE cp.id = p_customer_package_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Definir período: Parte sempre do dia da contratação
  IF p_period_start IS NULL THEN
    v_period_start := CURRENT_DATE;
  ELSE
    v_period_start := p_period_start;
  END IF;

  v_period_label := 'Sem ' || TO_CHAR(v_period_start, 'DD/MM');

  -- Verifica se tem dia e horário preferido configurado para agendamento automático
  IF v_cp.preferred_weekday IS NOT NULL AND v_cp.is_auto_schedule = true THEN
    v_weekday := v_cp.preferred_weekday;
    v_time := COALESCE(v_cp.preferred_time, '09:00');
    
    -- Avançar até o primeiro dia da semana preferido no futuro ou hoje
    v_offset := (v_weekday - EXTRACT(DOW FROM v_period_start)::INTEGER + 7) % 7;
    v_slot_date := v_period_start + v_offset;
    
    -- Expandimos cada item de acordo com a quantidade
    FOR v_item IN (
      SELECT pi.service_id
      FROM public.package_items pi
      CROSS JOIN generate_series(1, pi.quantity) AS seq
      WHERE pi.package_id = v_cp.package_id
      ORDER BY seq, pi.service_id
    ) LOOP
      
      -- Buscar a categoria
      SELECT category_id INTO v_category_id
      FROM public.services
      WHERE id = v_item.service_id;
      
      -- Buscar crédito vinculado
      SELECT id INTO v_credit_id
      FROM public.package_credits
      WHERE customer_package_id = p_customer_package_id
        AND service_id = v_item.service_id
      LIMIT 1;

      -- Apenas insere se ainda não existe um slot para aquele dia/pacote
      IF NOT EXISTS (
        SELECT 1 FROM public.package_schedule_slots
        WHERE customer_package_id = p_customer_package_id
          AND service_id = v_item.service_id
          AND slot_date = v_slot_date
      ) THEN
        v_scheduled_at := (v_slot_date::text || 'T' || v_time || ':00-03:00')::TIMESTAMPTZ;
        
        INSERT INTO public.appointments (
          org_id, pet_id, service_id, service_category_id, customer_id,
          scheduled_at, status, package_credit_id, calculated_price, final_price, payment_status, discount_percent
        ) VALUES (
          v_cp.org_id, v_cp.pet_id, v_item.service_id, v_category_id, v_cp.customer_id,
          v_scheduled_at, 'pending', v_credit_id, 0, 0, 'paid', 100
        ) RETURNING id INTO v_appointment_id;

        INSERT INTO public.package_schedule_slots (
          customer_package_id, service_id, slot_date, slot_time,
          status, period_label, appointment_id
        ) VALUES (
          p_customer_package_id, v_item.service_id, v_slot_date, v_time,
          'scheduled', v_period_label, v_appointment_id
        );
        
        v_slots_created := v_slots_created + 1;
      END IF;
      
      -- Avança para a próxima semana para agendar o próximo slot
      v_slot_date := v_slot_date + 7;
      
    END LOOP;
  ELSE
    -- Sem agendamento automático: vira tudo pending na data start
    FOR v_item IN (
      SELECT pi.service_id, pi.quantity
      FROM public.package_items pi
      WHERE pi.package_id = v_cp.package_id
    ) LOOP
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
    END LOOP;
  END IF;

  RETURN v_slots_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
