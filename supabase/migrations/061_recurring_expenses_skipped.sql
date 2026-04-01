-- =====================================================
-- MIGRATION: 061_recurring_expenses_skipped.sql
-- Adiciona suporte para meses pulados em despesas fixas
-- =====================================================

ALTER TABLE public.recurring_expenses ADD COLUMN IF NOT EXISTS skipped_months TEXT[] DEFAULT '{}';

-- Comentário explicativo
COMMENT ON COLUMN public.recurring_expenses.skipped_months IS 'Lista de meses (YYYY-MM) que foram excluídos manualmente e não devem ser recriados.';
