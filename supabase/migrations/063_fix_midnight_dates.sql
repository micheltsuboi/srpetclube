-- =====================================================
-- MIGRATION: 063_fix_midnight_dates.sql
-- Corrige transações que foram registradas exatamente à meia-noite (UTC)
-- Isso as move para o meio-dia (UTC), garantindo que fusos horários como
-- Brasília (UTC-3) não as joguem para o dia anterior.
-- =====================================================

UPDATE public.financial_transactions
SET date = (date::date + interval '12 hours')::timestamptz
WHERE date::time = '00:00:00'::time;

-- Aplicar o mesmo para appointments se necessário (paid_at)
UPDATE public.appointments
SET paid_at = (paid_at::date + interval '12 hours')::timestamptz
WHERE paid_at IS NOT NULL AND paid_at::time = '00:00:00'::time;

COMMENT ON TABLE public.financial_transactions IS 'Tabela de transações financeiras (Datas corrigidas para Meio-dia para evitar deslocamentos de fuso horário).';
