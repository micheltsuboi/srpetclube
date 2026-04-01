-- =====================================================
-- MIGRATION: 060_recurring_expenses.sql
-- Adiciona tabela para despesas fixas (recorrentes)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    payment_method TEXT,
    start_date TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Adicionar coluna de referência em financial_transactions
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS recurring_id UUID REFERENCES public.recurring_expenses(id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_recurring_org ON public.recurring_expenses(org_id);
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON public.financial_transactions(recurring_id);

-- RLS
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage recurring expenses" ON public.recurring_expenses
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin'))
  );

CREATE POLICY "Admin view recurring expenses" ON public.recurring_expenses
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin'))
  );
