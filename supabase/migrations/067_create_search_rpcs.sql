-- =====================================================
-- MIGRATION 067: Create Search RPCs for Pets and Tutors
-- =====================================================

-- Remover funções existentes se houver mudança no tipo de retorno
DROP FUNCTION IF EXISTS public.search_pets_rpc(TEXT, UUID, INT);
DROP FUNCTION IF EXISTS public.search_tutors_rpc(TEXT, UUID, INT);

-- 1. RPC para busca de PETS (suporta unaccent e retorna objeto tutor aninhado)
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

-- 2. RPC para busca de TUTORES (suporta unaccent e retorna lista de pets aninhada)
CREATE OR REPLACE FUNCTION public.search_tutors_rpc(
  search_term TEXT,
  organization_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  phone_1 TEXT,
  city TEXT,
  pets_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id, 
    c.name, 
    c.email, 
    c.phone_1, 
    c.city,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'species', p.species))
       FROM public.pets p 
       WHERE p.customer_id = c.id),
      '[]'::jsonb
    ) as pets_data
  FROM public.customers c
  WHERE c.org_id = organization_id
    AND (
      public.f_unaccent(c.name) ILIKE public.f_unaccent('%' || search_term || '%')
      OR public.f_unaccent(c.email) ILIKE public.f_unaccent('%' || search_term || '%')
      OR c.phone_1 ILIKE '%' || search_term || '%'
    )
  ORDER BY c.name ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
