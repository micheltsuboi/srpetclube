-- MIGRATION: Fix get_price logic for weight precedence over size divergence and include weight/size in pet search

-- 1. Atualizar RPC get_price para priorizar peso estritamente e respeitar dia da semana
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

  -- 3. Busca preço na matriz de preços
  SELECT fixed_price INTO v_price
  FROM public.pricing_matrix
  WHERE service_id = p_service_id
    AND is_active = true
    AND (day_of_week IS NULL OR day_of_week = v_day_of_week)
    AND (
      -- Caso 1: Regra com faixa de peso e pet com peso informado (peso prevalece sobre porte)
      (
        (weight_min IS NOT NULL OR weight_max IS NOT NULL)
        AND v_weight IS NOT NULL
        AND (weight_min IS NULL OR v_weight >= weight_min)
        AND (weight_max IS NULL OR v_weight <= weight_max)
      )
      OR
      -- Caso 2: Regra sem peso (apenas porte) e pet com porte correspondente
      (
        weight_min IS NULL AND weight_max IS NULL
        AND (size IS NULL OR (v_size IS NOT NULL AND size = v_size))
      )
      OR
      -- Caso 3: Pet sem peso cadastrado, tenta casar com porte da regra
      (
        v_weight IS NULL
        AND size IS NOT NULL
        AND v_size IS NOT NULL
        AND size = v_size
      )
    )
  ORDER BY 
    (day_of_week IS NOT NULL AND (weight_min IS NOT NULL OR weight_max IS NOT NULL))::INT DESC, -- Dia específico + peso (prioridade máxima)
    (day_of_week IS NOT NULL AND size IS NOT NULL)::INT DESC,                                  -- Dia específico + porte
    (day_of_week IS NOT NULL)::INT DESC,                                                       -- Dia específico geral
    (weight_min IS NOT NULL OR weight_max IS NOT NULL)::INT DESC,                               -- Peso geral (qualquer dia)
    (size IS NOT NULL)::INT DESC,                                                              -- Porte geral
    fixed_price DESC
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

-- 2. Atualizar porte de pets que estão no peso de porte gigante conforme convenção da pet shop
UPDATE public.pets
SET size = 'giant', updated_at = NOW()
WHERE weight_kg >= 30.1 AND size != 'giant';
