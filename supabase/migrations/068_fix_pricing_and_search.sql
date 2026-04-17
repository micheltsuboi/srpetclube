-- =====================================================
-- MIGRATION 068: Fix Pricing Logic and Pet Search RPC
-- =====================================================

-- 1. Atualizar RPC de busca de pets para retornar peso e porte
DROP FUNCTION IF EXISTS public.search_pets_rpc(TEXT, UUID, INT);

CREATE OR REPLACE FUNCTION public.search_pets_rpc(
  search_term TEXT,
  organization_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  species TEXT,
  breed TEXT,
  size TEXT,
  weight_kg DECIMAL,
  is_adapted BOOLEAN,
  customers JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id, 
    p.name, 
    p.species, 
    p.breed, 
    p.size,
    p.weight_kg,
    p.is_adapted,
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'phone_1', c.phone_1
    ) as customers
  FROM public.pets p
  JOIN public.customers c ON p.customer_id = c.id
  WHERE c.org_id = organization_id
    AND (
      public.f_unaccent(p.name) ILIKE public.f_unaccent('%' || search_term || '%')
      OR public.f_unaccent(c.name) ILIKE public.f_unaccent('%' || search_term || '%')
    )
  ORDER BY p.name ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualizar função de cálculo de preço dinâmico
CREATE OR REPLACE FUNCTION public.get_price(
  p_pet_id UUID,
  p_service_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_weight DECIMAL(10,2);
  v_size TEXT;
  v_day_of_week INTEGER;
  v_price DECIMAL(10,2);
BEGIN
  -- 1. Determina o dia da semana (0=Dom, 6=Sáb)
  v_day_of_week := EXTRACT(DOW FROM p_date);

  -- 2. Busca peso e porte do pet
  SELECT weight_kg, size INTO v_weight, v_size 
  FROM public.pets WHERE id = p_pet_id;

  -- 3. Busca preço na matriz
  -- Prioridade: 
  -- 1. Dia específico + (Peso ou Porte)
  -- 2. Peso (mais específico que porte)
  -- 3. Porte
  -- 4. Somente Dia
  -- 5. Preço Base do Serviço
  
  SELECT fixed_price INTO v_price
  FROM public.pricing_matrix
  WHERE service_id = p_service_id
    AND is_active = true
    -- Se v_weight for nulo e a regra exigir peso, não bate (correto)
    AND (weight_min IS NULL OR (v_weight IS NOT NULL AND v_weight >= weight_min))
    AND (weight_max IS NULL OR (v_weight IS NOT NULL AND v_weight <= weight_max))
    -- Se porte for nulo na regra, ignora porte. Se v_size for nulo e regra exigir porte, não bate.
    AND (size IS NULL OR (v_size IS NOT NULL AND size = v_size))
    -- Dia da semana
    AND (day_of_week IS NULL OR day_of_week = v_day_of_week)
  ORDER BY 
    (day_of_week IS NOT NULL)::INT DESC,  -- Dia específico ganha
    (weight_min IS NOT NULL)::INT DESC,   -- Peso específico ganha de porte
    (size IS NOT NULL)::INT DESC,         -- Porte ganha de regra genérica
    fixed_price DESC                      -- Em caso de empate, maior preço ou critério adicional
  LIMIT 1;

  -- 4. Fallback para o preço base do serviço se não houver regra na matriz
  IF v_price IS NULL THEN
    SELECT base_price INTO v_price 
    FROM public.services 
    WHERE id = p_service_id;
  END IF;

  RETURN COALESCE(v_price, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
