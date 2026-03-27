-- Migration: Fix Package Scheduling Loop
-- Garante que o agendamento automático preencha todos os créditos do pacote,
-- mesmo que ultrapasse o limite do período inicial (semana/mês).

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
  v_time TEXT;
  v_current_date DATE;
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
    v_current_date := CURRENT_DATE;
  ELSE
    v_current_date := p_period_start;
  END IF;

  -- Definir rótulo do período para os slots
  v_period_label := TO_CHAR(v_current_date, 'DD/MM/YY');

  -- Para cada item do pacote, criar os slots distribuídos
  FOR v_item IN (
    SELECT pi.service_id, pi.quantity
    FROM public.package_items pi
    WHERE pi.package_id = v_cp.package_id
  ) LOOP
    -- Se tem dias da semana preferidos e agendamento automático
    IF v_cp.is_auto_schedule = true AND (v_cp.preferred_weekdays IS NOT NULL AND array_length(v_cp.preferred_weekdays, 1) > 0) THEN
      v_time := COALESCE(v_cp.preferred_time, '09:00');
      v_slots_per_item := v_item.quantity;
      v_slot_date := v_current_date;
      v_safety_count := 0;

      -- Percorrer dias até preencher todos os créditos do item
      -- Limite de segurança de 1000 dias para evitar loops infinitos
      WHILE v_slots_per_item > 0 AND v_safety_count < 1000 LOOP
        -- Se o dia atual está nos dias preferidos
        IF EXTRACT(DOW FROM v_slot_date)::INTEGER = ANY(v_cp.preferred_weekdays) THEN
          -- Verificar se já existe slot para este pet/data/serviço no contexto deste pacote
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
        END IF;
        
        v_slot_date := v_slot_date + 1;
        v_safety_count := v_safety_count + 1;
      END LOOP;
    ELSE
      -- Agendamento manual: criar slots "floating" com data = início
      -- Apenas se for a primeira vez gerando para este pacote (ou se solicitado)
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
            p_customer_package_id, v_item.service_id, v_current_date, NULL,
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
