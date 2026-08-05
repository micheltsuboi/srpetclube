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
  -- Busca customer_id do pet
  SELECT customer_id INTO v_customer_id
  FROM public.pets
  WHERE id = p_pet_id;
  
  -- Busca crédito disponível
  -- Prioridade: 1) Pacote específico do pet, 2) Pacote geral do cliente
  SELECT pc.id, pc.customer_package_id INTO v_credit_id, v_customer_package_id
  FROM public.package_credits pc
  JOIN public.customer_packages cp ON cp.id = pc.customer_package_id
  WHERE (cp.pet_id = p_pet_id OR (cp.pet_id IS NULL AND cp.customer_id = v_customer_id))
    AND pc.service_id = p_service_id
    AND pc.remaining_quantity > 0
    AND cp.is_active = true
  LIMIT 1;

  IF v_credit_id IS NOT NULL THEN
    -- Reduz 1 crédito
    UPDATE public.package_credits
    SET remaining_quantity = remaining_quantity - 1,
        updated_at = now()
    WHERE id = v_credit_id;
    
    RETURN v_credit_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
