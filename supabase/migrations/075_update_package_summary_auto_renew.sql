-- Atualizar RPC get_pet_package_summary para retornar auto_renew
DROP FUNCTION IF EXISTS public.get_pet_package_summary(UUID);

CREATE OR REPLACE FUNCTION public.get_pet_package_summary(
  p_pet_id UUID
)
RETURNS TABLE (
  customer_package_id UUID,
  package_name TEXT,
  purchased_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  service_name TEXT,
  service_id UUID,
  total_qty INTEGER,
  used_qty INTEGER,
  remaining_qty INTEGER,
  is_expired BOOLEAN,
  calculated_price NUMERIC,
  total_paid NUMERIC,
  discount_percent NUMERIC,
  payment_status TEXT,
  payment_method TEXT,
  has_taxi BOOLEAN,
  taxi_fee NUMERIC,
  auto_renew BOOLEAN
) AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  -- Busca customer_id do pet
  SELECT customer_id INTO v_customer_id
  FROM public.pets
  WHERE id = p_pet_id;
  
  -- Retorna pacotes do pet específico + pacotes gerais do cliente
  RETURN QUERY
  SELECT 
    cp.id as customer_package_id,
    sp.name as package_name,
    cp.purchased_at,
    cp.expires_at,
    s.name as service_name,
    s.id as service_id,
    pc.total_quantity as total_qty,
    pc.used_quantity as used_qty,
    pc.remaining_quantity as remaining_qty,
    CASE 
      WHEN cp.expires_at IS NOT NULL AND cp.expires_at < CURRENT_TIMESTAMP THEN true 
      ELSE false 
    END as is_expired,
    cp.calculated_price,
    cp.total_paid,
    cp.discount_percent,
    cp.payment_status::TEXT,
    cp.payment_method::TEXT,
    cp.has_taxi,
    cp.taxi_fee,
    cp.auto_renew
  FROM public.customer_packages cp
  JOIN public.service_packages sp ON sp.id = cp.package_id
  JOIN public.package_credits pc ON pc.customer_package_id = cp.id
  JOIN public.services s ON s.id = pc.service_id
  WHERE (cp.pet_id = p_pet_id OR (cp.pet_id IS NULL AND cp.customer_id = v_customer_id))
  ORDER BY cp.purchased_at DESC, s.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
