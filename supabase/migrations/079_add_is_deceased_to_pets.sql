-- =========================================================================
-- MIGRATION 079: Add is_deceased to pets table for Memorial
-- Permite marcar pets como falecidos para transferi-los para a aba Memorial,
-- mantendo todo o histórico de agendamentos, pacotes e saúde preservado.
-- =========================================================================

-- 1. Adicionar coluna is_deceased na tabela pets
ALTER TABLE public.pets 
ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN DEFAULT false;

-- 2. Criar índice para performance ao filtrar pets ativos vs memorial
CREATE INDEX IF NOT EXISTS idx_pets_is_deceased ON public.pets(is_deceased);

-- 3. Atualizar search_pets_rpc para não sugerir pets falecidos em novos agendamentos
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
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'phone_1', c.phone_1
    ) as customers
  FROM public.pets p
  JOIN public.customers c ON p.customer_id = c.id
  WHERE c.org_id = organization_id
    AND COALESCE(p.is_deceased, false) = false
    AND (
      public.f_unaccent(p.name) ILIKE public.f_unaccent('%' || search_term || '%')
      OR public.f_unaccent(c.name) ILIKE public.f_unaccent('%' || search_term || '%')
    )
  ORDER BY p.name ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
