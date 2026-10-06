-- =========================================================================
-- MIGRATION 080: Add inactive pets support and fix search_pets_rpc
-- Garante colunas is_active e is_deceased tratadas, cria índices
-- e atualiza a função de busca para não incluir pets inativos ou do memorial.
-- =========================================================================

-- 1. Garantir coluna is_active com default true
ALTER TABLE public.pets 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Normalizar dados existentes nulos
UPDATE public.pets 
SET is_active = true 
WHERE is_active IS NULL;

UPDATE public.pets 
SET is_deceased = false 
WHERE is_deceased IS NULL;

-- 3. Índices de performance para filtragem de status
CREATE INDEX IF NOT EXISTS idx_pets_is_active ON public.pets(is_active);
CREATE INDEX IF NOT EXISTS idx_pets_is_deceased ON public.pets(is_deceased);

-- 4. Atualizar search_pets_rpc para não sugerir pets falecidos nem inativos na agenda
DROP FUNCTION IF EXISTS public.search_pets_rpc(TEXT, UUID, INTEGER);
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
  is_adapted BOOLEAN,
  is_deceased BOOLEAN,
  is_active BOOLEAN,
  customers JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id, 
    p.name, 
    p.species, 
    p.breed, 
    p.is_adapted,
    COALESCE(p.is_deceased, false) as is_deceased,
    COALESCE(p.is_active, true) as is_active,
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'phone_1', c.phone_1
    ) as customers
  FROM public.pets p
  JOIN public.customers c ON p.customer_id = c.id
  WHERE c.org_id = organization_id
    AND COALESCE(p.is_deceased, false) = false
    AND COALESCE(p.is_active, true) = true
    AND (
      public.f_unaccent(p.name) ILIKE public.f_unaccent('%' || search_term || '%')
      OR public.f_unaccent(c.name) ILIKE public.f_unaccent('%' || search_term || '%')
    )
  ORDER BY p.name ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
