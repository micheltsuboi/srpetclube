-- =====================================================
-- MIGRATION 081: Add birth_date to profiles
-- Adiciona data de nascimento para usuários/funcionários
-- =====================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date DATE;
