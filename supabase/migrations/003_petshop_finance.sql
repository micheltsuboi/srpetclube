-- =====================================================
-- MIGRATION: 003_petshop_finance.sql
-- Adiciona tabelas para Produtos e Transações Financeiras
-- =====================================================

-- =====================================================
-- TABELA: products (Produtos do Petshop)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                    -- Ex: 'Rações', 'Brinquedos', 'Farmácia'
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(10,2),         -- Para cálculo de margem
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_alert INTEGER DEFAULT 5, -- Alerta de estoque baixo
  image_url TEXT,
  bar_code TEXT,                    -- Código de barras
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: financial_transactions (Financeiro)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('income', 'expense')) NOT NULL, -- Receita ou Despesa
  category TEXT NOT NULL,           -- Ex: 'Venda Produto', 'Serviço', 'Reposição Estoque', 'Conta de Luz'
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  payment_method TEXT,              -- 'credit', 'debit', 'pix', 'cash'
  date TIMESTAMPTZ DEFAULT now(),   -- Data da transação (pode ser retroativa)
  created_by UUID REFERENCES public.profiles(id),
  reference_id UUID,                -- ID opcional de referência (ex: id da venda ou do agendamento)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_products_org ON public.products(org_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(org_id, category);
CREATE INDEX IF NOT EXISTS idx_transactions_org_date ON public.financial_transactions(org_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.financial_transactions(org_id, type);

-- Triggers de Update
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

-- Products Policies
CREATE POLICY "Users can view org products" ON public.products
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can manage products" ON public.products
  FOR ALL USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')));

-- Transactions Policies
CREATE POLICY "Admin can view org transactions" ON public.financial_transactions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin'))
  );

CREATE POLICY "Admin can manage transactions" ON public.financial_transactions
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin'))
  );
