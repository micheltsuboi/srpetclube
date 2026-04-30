-- Migration: Fix Used Quantity Logic
-- Separa a contagem de agendamento da contagem de realização.
-- - remaining_quantity: Saldo livre para agendar (abate no agendamento).
-- - used_quantity: Saldo de sessões concluídas (incrementa apenas no checkout).

-- 1. Modificar use_package_credit_for_pet para NÃO incrementar used_quantity no agendamento
CREATE OR REPLACE FUNCTION public.use_package_credit_for_pet(
  p_pet_id UUID,
  p_service_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_credit_id UUID;
  v_customer_package_id UUID;
  v_customer_id UUID;
BEGIN
  SELECT customer_id INTO v_customer_id
  FROM public.pets
  WHERE id = p_pet_id;
  
  SELECT pc.id, pc.customer_package_id INTO v_credit_id, v_customer_package_id
  FROM public.package_credits pc
  JOIN public.customer_packages cp ON cp.id = pc.customer_package_id
  WHERE (cp.pet_id = p_pet_id OR (cp.pet_id IS NULL AND cp.customer_id = v_customer_id))
    AND pc.service_id = p_service_id
    AND pc.remaining_quantity > 0
    AND cp.is_active = true
    AND (cp.expires_at IS NULL OR cp.expires_at > now())
  ORDER BY 
    CASE WHEN cp.pet_id = p_pet_id THEN 0 ELSE 1 END,
    cp.expires_at ASC NULLS LAST
  LIMIT 1;
  
  IF v_credit_id IS NOT NULL THEN
    UPDATE public.package_credits 
    SET 
      -- used_quantity não é alterado aqui!
      remaining_quantity = remaining_quantity - 1,
      updated_at = now()
    WHERE id = v_credit_id;
    
    RETURN v_credit_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger para atualizar used_quantity no check-out
CREATE OR REPLACE FUNCTION public.update_package_used_qty_on_checkout()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Se mudou para 'done'
    IF NEW.status = 'done' AND OLD.status != 'done' AND NEW.package_credit_id IS NOT NULL THEN
      UPDATE public.package_credits
      SET used_quantity = used_quantity + 1,
          updated_at = now()
      WHERE id = NEW.package_credit_id;
    END IF;
    
    -- Se desfez o 'done'
    IF OLD.status = 'done' AND NEW.status != 'done' AND OLD.package_credit_id IS NOT NULL THEN
      UPDATE public.package_credits
      SET used_quantity = GREATEST(0, used_quantity - 1),
          updated_at = now()
      WHERE id = OLD.package_credit_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_package_used_qty ON public.appointments;
CREATE TRIGGER trigger_update_package_used_qty
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_package_used_qty_on_checkout();

-- 3. Atualizar generate_package_slots para NÃO incrementar used_quantity
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
  SELECT cp.*, sp.validity_type, sp.name as package_name INTO v_cp
  FROM public.customer_packages cp
  JOIN public.service_packages sp ON sp.id = cp.package_id
  WHERE cp.id = p_customer_package_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  IF p_period_start IS NULL THEN v_slot_date := CURRENT_DATE; ELSE v_slot_date := p_period_start; END IF;
  v_period_label := TO_CHAR(v_slot_date, 'DD/MM/YY');

  FOR v_item IN (SELECT pi.service_id, pi.quantity FROM public.package_items pi WHERE pi.package_id = v_cp.package_id) LOOP
    SELECT category_id INTO v_category_id FROM public.services WHERE id = v_item.service_id;
    SELECT id INTO v_credit_id FROM public.package_credits WHERE customer_package_id = p_customer_package_id AND service_id = v_item.service_id LIMIT 1;

    IF v_cp.is_auto_schedule = true AND (v_cp.preferred_weekdays IS NOT NULL AND array_length(v_cp.preferred_weekdays, 1) > 0) THEN
      v_time := COALESCE(v_cp.preferred_time, '09:00');
      v_slots_per_item := v_item.quantity;
      v_slot_date := CASE WHEN p_period_start IS NULL THEN CURRENT_DATE ELSE p_period_start END;
      v_safety_count := 0;

      WHILE v_slots_per_item > 0 AND v_safety_count < 1000 LOOP
        IF EXTRACT(DOW FROM v_slot_date)::INTEGER = ANY(v_cp.preferred_weekdays) THEN
          IF NOT EXISTS (SELECT 1 FROM public.package_schedule_slots WHERE customer_package_id = p_customer_package_id AND service_id = v_item.service_id AND slot_date = v_slot_date) THEN
            v_scheduled_at := (v_slot_date::text || 'T' || v_time || ':00-03:00')::TIMESTAMPTZ;

            INSERT INTO public.appointments (org_id, pet_id, service_id, service_category_id, customer_id, scheduled_at, status, package_credit_id, calculated_price, final_price, payment_status, discount_percent) 
            VALUES (v_cp.org_id, v_cp.pet_id, v_item.service_id, v_category_id, v_cp.customer_id, v_scheduled_at, 'pending', v_credit_id, 0, 0, 'paid', 100) 
            RETURNING id INTO v_appointment_id;

            IF v_credit_id IS NOT NULL THEN
              UPDATE public.package_credits
              SET remaining_quantity = GREATEST(0, remaining_quantity - 1),
                  updated_at = now()
              WHERE id = v_credit_id;
            END IF;

            INSERT INTO public.package_schedule_slots (customer_package_id, service_id, slot_date, slot_time, status, period_label, appointment_id) 
            VALUES (p_customer_package_id, v_item.service_id, v_slot_date, v_time, 'scheduled', v_period_label, v_appointment_id);

            v_slots_created := v_slots_created + 1;
            v_slots_per_item := v_slots_per_item - 1;
          END IF;
        END IF;
        v_slot_date := v_slot_date + 1;
        v_safety_count := v_safety_count + 1;
      END LOOP;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.package_schedule_slots WHERE customer_package_id = p_customer_package_id AND service_id = v_item.service_id) THEN
        FOR i IN 1..v_item.quantity LOOP
          INSERT INTO public.package_schedule_slots (customer_package_id, service_id, slot_date, slot_time, status, period_label) 
          VALUES (p_customer_package_id, v_item.service_id, CASE WHEN p_period_start IS NULL THEN CURRENT_DATE ELSE p_period_start END, NULL, 'pending', v_period_label);
          v_slots_created := v_slots_created + 1;
        END LOOP;
      END IF;
    END IF;
  END LOOP;
  RETURN v_slots_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Corrigir os registros passados para refletir a nova lógica
UPDATE public.package_credits pc
SET used_quantity = (
  SELECT count(*)
  FROM public.appointments a
  WHERE a.package_credit_id = pc.id
    AND a.status = 'done'
);
