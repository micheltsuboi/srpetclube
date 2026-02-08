-- =====================================================
-- MIGRATION: 002_vaccines.sql
-- Adiciona tabelas para gestão de vacinas e lotes
-- =====================================================

-- =====================================================
-- TABELA: vaccines (Catálogo de Vacinas)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.vaccines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  description TEXT,
  target_animals TEXT[] DEFAULT '{Cão}', -- Array de strings: ['Cão', 'Gato']
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: vaccine_batches (Lotes de Vacinas)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.vaccine_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vaccine_id UUID NOT NULL REFERENCES public.vaccines(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  cost_price DECIMAL(10,2) DEFAULT 0,
  selling_price DECIMAL(10,2) DEFAULT 0,
  expiration_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_vaccines_org ON public.vaccines(org_id);
CREATE INDEX IF NOT EXISTS idx_vaccine_batches_vaccine ON public.vaccine_batches(vaccine_id);
CREATE INDEX IF NOT EXISTS idx_vaccine_batches_expiration ON public.vaccine_batches(expiration_date);

-- =====================================================
-- TRIGGER: Atualizar updated_at (reutilizando função existente)
-- =====================================================
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vaccines
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- HABILITAR RLS
-- =====================================================
ALTER TABLE public.vaccines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaccine_batches ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLÍTICAS RLS: vaccines
-- =====================================================

-- Todos da organização podem ver as vacinas disponíveis
CREATE POLICY "Users can view org vaccines" ON public.vaccines
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- Apenas Staff/Admin podem gerenciar vacinas
CREATE POLICY "Staff can manage vaccines" ON public.vaccines
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );

-- =====================================================
-- POLÍTICAS RLS: vaccine_batches
-- =====================================================

-- Todos da organização podem ver os lotes (para conferir estoque/validade)
CREATE POLICY "Users can view org vaccine batches" ON public.vaccine_batches
  FOR SELECT USING (
    vaccine_id IN (
      SELECT id FROM public.vaccines 
      WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Apenas Staff/Admin podem gerenciar lotes (entrada/saída/cadastro)
CREATE POLICY "Staff can manage vaccine batches" ON public.vaccine_batches
  FOR ALL USING (
    vaccine_id IN (
      SELECT id FROM public.vaccines 
      WHERE org_id IN (
        SELECT org_id FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
      )
    )
  );
