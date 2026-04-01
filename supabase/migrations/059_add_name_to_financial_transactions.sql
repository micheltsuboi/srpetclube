-- =====================================================
-- MIGRATION: 059_add_name_to_financial_transactions.sql
-- Adiciona campo 'name' para identificação rápida de transações
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'financial_transactions'
        AND column_name = 'name'
    ) THEN
        ALTER TABLE public.financial_transactions ADD COLUMN name TEXT;
    END IF;
END $$;
