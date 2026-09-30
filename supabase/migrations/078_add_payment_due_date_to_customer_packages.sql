-- =========================================================================
-- MIGRATION 078: Add payment_due_date to customer_packages
-- Permite registrar a data prevista de pagamento / vencimento do pacote,
-- alinhando a competência financeira (previsão vs realizado) com o mês/data real.
-- =========================================================================

-- 1. Adicionar coluna payment_due_date em customer_packages
ALTER TABLE public.customer_packages 
ADD COLUMN IF NOT EXISTS payment_due_date DATE;

-- 2. Criar índice para performance em buscas financeiras
CREATE INDEX IF NOT EXISTS idx_customer_packages_due_date 
ON public.customer_packages(payment_due_date);

-- 3. Atualizar retroativamente pacotes existentes
-- Se tiver slots gerados, usa a menor data de slot (primeiro banho/serviço)
UPDATE public.customer_packages cp
SET payment_due_date = sub.first_slot
FROM (
  SELECT customer_package_id, MIN(slot_date) as first_slot
  FROM public.package_schedule_slots
  GROUP BY customer_package_id
) sub
WHERE cp.id = sub.customer_package_id 
  AND cp.payment_due_date IS NULL;

-- Para os que ainda não tiverem payment_due_date, usa a data de compra (purchased_at)
UPDATE public.customer_packages
SET payment_due_date = DATE(purchased_at)
WHERE payment_due_date IS NULL;

-- 4. Atualizar a RPC get_pet_package_summary para incluir payment_due_date
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
  auto_renew BOOLEAN,
  paid_at TIMESTAMPTZ,
  payment_due_date DATE
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
    cp.auto_renew,
    cp.paid_at,
    cp.payment_due_date
  FROM public.customer_packages cp
  JOIN public.service_packages sp ON sp.id = cp.package_id
  JOIN public.package_credits pc ON pc.customer_package_id = cp.id
  JOIN public.services s ON s.id = pc.service_id
  WHERE (cp.pet_id = p_pet_id OR (cp.pet_id IS NULL AND cp.customer_id = v_customer_id))
  ORDER BY cp.purchased_at DESC, s.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
