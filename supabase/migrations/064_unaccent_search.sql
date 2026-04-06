-- =====================================================
-- MIGRATION 064: Accent Insensitive Search
-- =====================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Criar função imutável para busca eficiente (necessário para índices e RPCs)
CREATE OR REPLACE FUNCTION f_unaccent(text)
  RETURNS text AS
$func$
SELECT public.unaccent('public.unaccent', $1)
$func$ LANGUAGE sql IMMUTABLE;
