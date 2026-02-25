-- =====================================================
-- SR PET CLUBE - Schema Completo
-- =====================================================
-- Este script cria todas as tabelas, políticas RLS e funções
-- para o sistema SaaS de Pet Shop
-- =====================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABELA: organizations (Multi-tenancy)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{
    "business_hours": {
      "open": "08:00",
      "close": "18:00"
    },
    "working_days": [1, 2, 3, 4, 5, 6]
  }'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: profiles (Usuários e Roles)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id),
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT CHECK (role IN ('superadmin', 'admin', 'staff', 'customer')) DEFAULT 'customer',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: time_entries (Controle de Ponto)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  justification TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: customers (Tutores/Clientes)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  cpf TEXT,
  phone_1 TEXT,
  phone_2 TEXT,
  email TEXT,
  address TEXT,
  neighborhood TEXT,
  city TEXT,
  instagram TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: pets (Fichas Técnicas dos Pets)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT CHECK (species IN ('dog', 'cat', 'other')) DEFAULT 'dog',
  breed TEXT,
  color TEXT,
  size TEXT CHECK (size IN ('small', 'medium', 'large', 'giant')),
  birth_date DATE,
  weight_kg DECIMAL(5,2),
  is_neutered BOOLEAN DEFAULT false,
  gender TEXT CHECK (gender IN ('male', 'female')),
  medical_notes TEXT,
  allergies TEXT,
  temperament TEXT,
  perfume_allowed BOOLEAN DEFAULT true,
  accessories_allowed BOOLEAN DEFAULT true,
  special_care TEXT,
  photo_url TEXT,
  vaccination_card_url TEXT,
  last_vaccination_date DATE,
  next_vaccination_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: services (Catálogo de Serviços)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_price DECIMAL(10,2) NOT NULL,
  category TEXT CHECK (category IN ('banho', 'tosa', 'banho_tosa', 'hotel', 'creche', 'combo', 'veterinario', 'outro')) NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: pricing_matrix (Precificação Dinâmica)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pricing_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  weight_min DECIMAL(5,2),
  weight_max DECIMAL(5,2),
  size TEXT CHECK (size IN ('small', 'medium', 'large', 'giant')),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  fixed_price DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pricing_matrix_service ON public.pricing_matrix(service_id);
CREATE INDEX IF NOT EXISTS idx_pricing_matrix_lookup ON public.pricing_matrix(service_id, weight_min, weight_max, day_of_week);

-- =====================================================
-- TABELA: service_credits (Pacotes/Créditos)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.service_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  total_quantity INTEGER NOT NULL,
  remaining_quantity INTEGER NOT NULL DEFAULT 0,
  unit_price DECIMAL(10,2),
  total_paid DECIMAL(10,2),
  purchased_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: appointments (Agendamentos)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.profiles(id),
  customer_id UUID REFERENCES public.customers(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('pending', 'confirmed', 'in_progress', 'done', 'canceled', 'no_show')) DEFAULT 'pending',
  calculated_price DECIMAL(10,2),
  final_price DECIMAL(10,2),
  discount DECIMAL(10,2) DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash', 'credit', 'debit', 'pix', 'credit_package')),
  notes TEXT,
  used_credit BOOLEAN DEFAULT false,
  credit_id UUID REFERENCES public.service_credits(id),
  checklist JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_appointments_org ON public.appointments(org_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(org_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(org_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_pet ON public.appointments(pet_id);

-- =====================================================
-- TABELA: daily_reports (Timeline do Tutor)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id),
  pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.profiles(id),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  photo_url TEXT,
  video_url TEXT,
  observation TEXT,
  report_type TEXT CHECK (report_type IN ('photo', 'feeding', 'activity', 'health', 'bath_start', 'bath_end', 'general')) DEFAULT 'general',
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_daily_reports_pet ON public.daily_reports(pet_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON public.daily_reports(pet_id, created_at DESC);

-- =====================================================
-- HABILITAR ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLÍTICAS RLS: Organizations
-- =====================================================
-- Superadmin pode ver todas as organizações
CREATE POLICY "Superadmin can view all organizations" ON public.organizations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Superadmin pode gerenciar organizações
CREATE POLICY "Superadmin can manage organizations" ON public.organizations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Usuários podem ver sua própria organização
CREATE POLICY "Users can view own organization" ON public.organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- =====================================================
-- POLÍTICAS RLS: Profiles
-- =====================================================
-- Superadmin pode ver todos os profiles
CREATE POLICY "Superadmin can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Usuários podem ver profiles da mesma organização
CREATE POLICY "Users can view org profiles" ON public.profiles
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- Usuários podem atualizar próprio perfil
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- =====================================================
-- POLÍTICAS RLS: Time Entries
-- =====================================================
-- Staff pode criar próprias entradas
CREATE POLICY "Staff can create own time entries" ON public.time_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Staff pode ver próprias entradas
CREATE POLICY "Staff can view own time entries" ON public.time_entries
  FOR SELECT USING (user_id = auth.uid());

-- Admin pode ver todas entradas da org
CREATE POLICY "Admin can view org time entries" ON public.time_entries
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- POLÍTICAS RLS: Customers
-- =====================================================
CREATE POLICY "Users can view org customers" ON public.customers
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Staff can manage org customers" ON public.customers
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );

-- =====================================================
-- POLÍTICAS RLS: Pets
-- =====================================================
CREATE POLICY "Users can view org pets" ON public.pets
  FOR SELECT USING (
    customer_id IN (
      SELECT id FROM public.customers 
      WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Staff can manage org pets" ON public.pets
  FOR ALL USING (
    customer_id IN (
      SELECT id FROM public.customers 
      WHERE org_id IN (
        SELECT org_id FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
      )
    )
  );

-- =====================================================
-- POLÍTICAS RLS: Services
-- =====================================================
CREATE POLICY "Anyone can view org services" ON public.services
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    OR is_active = true
  );

CREATE POLICY "Admin can manage services" ON public.services
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- POLÍTICAS RLS: Pricing Matrix
-- =====================================================
CREATE POLICY "Anyone can view pricing" ON public.pricing_matrix
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage pricing" ON public.pricing_matrix
  FOR ALL USING (
    service_id IN (
      SELECT id FROM public.services 
      WHERE org_id IN (
        SELECT org_id FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
      )
    )
  );

-- =====================================================
-- POLÍTICAS RLS: Service Credits
-- =====================================================
CREATE POLICY "Users can view org credits" ON public.service_credits
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Staff can manage credits" ON public.service_credits
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );

-- =====================================================
-- POLÍTICAS RLS: Appointments
-- =====================================================
CREATE POLICY "Users can view org appointments" ON public.appointments
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Staff can manage appointments" ON public.appointments
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );

-- =====================================================
-- POLÍTICAS RLS: Daily Reports
-- =====================================================
CREATE POLICY "Users can view org reports" ON public.daily_reports
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    OR is_public = true
  );

CREATE POLICY "Staff can create reports" ON public.daily_reports
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );

-- =====================================================
-- FUNÇÃO: get_price (Cálculo de Checkout)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_price(
  p_pet_id UUID,
  p_service_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL AS $$
DECLARE
  v_weight DECIMAL;
  v_size TEXT;
  v_day_of_week INTEGER;
  v_price DECIMAL;
  v_base_price DECIMAL;
BEGIN
  -- Busca peso e porte do pet
  SELECT weight_kg, size INTO v_weight, v_size 
  FROM public.pets WHERE id = p_pet_id;
  
  -- Dia da semana (0=domingo, 6=sábado)
  v_day_of_week := EXTRACT(DOW FROM p_date);
  
  -- Busca preço na matriz (prioridade: dia específico > porte > peso > base)
  SELECT fixed_price INTO v_price
  FROM public.pricing_matrix
  WHERE service_id = p_service_id
    AND is_active = true
    AND (weight_min IS NULL OR v_weight >= weight_min)
    AND (weight_max IS NULL OR v_weight <= weight_max)
    AND (size IS NULL OR size = v_size)
    AND (day_of_week IS NULL OR day_of_week = v_day_of_week)
  ORDER BY 
    CASE WHEN day_of_week IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN size IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN weight_min IS NOT NULL THEN 0 ELSE 1 END
  LIMIT 1;
  
  -- Fallback para preço base do serviço
  IF v_price IS NULL THEN
    SELECT base_price INTO v_price FROM public.services WHERE id = p_service_id;
  END IF;
  
  RETURN COALESCE(v_price, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- FUNÇÃO: use_credit (Usar crédito do pacote)
-- =====================================================
CREATE OR REPLACE FUNCTION public.use_credit(
  p_credit_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  -- Verifica e decrementa crédito
  UPDATE public.service_credits 
  SET remaining_quantity = remaining_quantity - 1
  WHERE id = p_credit_id 
    AND remaining_quantity > 0
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING remaining_quantity INTO v_remaining;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- FUNÇÃO: get_low_credit_alerts (Alertas de renovação)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_low_credit_alerts(
  p_org_id UUID,
  p_threshold INTEGER DEFAULT 1
)
RETURNS TABLE (
  credit_id UUID,
  pet_id UUID,
  pet_name TEXT,
  customer_name TEXT,
  service_type TEXT,
  remaining INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.id as credit_id,
    sc.pet_id,
    p.name as pet_name,
    c.name as customer_name,
    sc.service_type,
    sc.remaining_quantity as remaining
  FROM public.service_credits sc
  JOIN public.pets p ON p.id = sc.pet_id
  JOIN public.customers c ON c.id = p.customer_id
  WHERE sc.org_id = p_org_id
    AND sc.remaining_quantity <= p_threshold
    AND (sc.expires_at IS NULL OR sc.expires_at > now())
  ORDER BY sc.remaining_quantity ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGER: Atualizar updated_at automaticamente
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger nas tabelas com updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- TRIGGER: Criar perfil automaticamente no registro
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar perfil quando usuário é criado
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- HABILITAR REALTIME para timeline do tutor
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;

-- =====================================================
-- FIM DO SCHEMA
-- =====================================================
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
-- =====================================================
-- SEED DATA: Sr Pet Clube (Criação de Org e Dono)
-- =====================================================

-- Habilitar pgcrypto para hash de senha (se não estiver habilitado)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_email TEXT := 'contato@srpetclube.com.br';
  v_password TEXT := '123456'; -- Senha inicial simples
  v_name TEXT := 'Alessandra Rigon';
  v_subdomain TEXT := 'srpetclube';
BEGIN
  -- 1. Criar Organização (ou recuperar se já existir pelo subdomínio)
  INSERT INTO public.organizations (name, subdomain)
  VALUES ('Sr Pet Clube', v_subdomain)
  ON CONFLICT (subdomain) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_org_id;
  
  RAISE NOTICE 'Organization ID: %', v_org_id;

  -- 2. Verifica se usuário já existe no Auth
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    -- Criar Usuário no Auth
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', v_name),
      now(),
      now(),
      '',
      '',
      '',
      ''
    )
    RETURNING id INTO v_user_id;
    
    RAISE NOTICE 'User created with ID: %', v_user_id;
  ELSE
    RAISE NOTICE 'User already exists with ID: %', v_user_id;
  END IF;

  -- 3. Atualizar/Inserir Profile
  -- O trigger 'on_auth_user_created' deve ter criado o profile automaticamente.
  -- Aqui garantimos que ele estÃ¡ vinculado Ã  organizaÃ§Ã£o correta e tem a role de 'superadmin'.
  
  UPDATE public.profiles
  SET 
    org_id = v_org_id,
    role = 'superadmin',
    full_name = v_name
  WHERE id = v_user_id;
  
  -- Fallback: Se o profile nÃ£o existir (ex: trigger falhou), criamos manualmente
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, org_id, email, full_name, role)
    VALUES (v_user_id, v_org_id, v_email, v_name, 'superadmin');
  END IF;

  RAISE NOTICE 'Setup Concluded!';
  RAISE NOTICE '---------------------------------------------------';
  RAISE NOTICE 'Organization: Sr Pet Clube';
  RAISE NOTICE 'User Email: %', v_email;
  RAISE NOTICE 'Password: %', v_password;
  RAISE NOTICE '---------------------------------------------------';

END $$;
-- =====================================================
-- FIX: RLS Policy for Login
-- =====================================================

-- O login estava falhando para buscar o 'role' do usuário porque
-- a política RLS anterior exigia que o usuário já tivesse acesso à organização,
-- criando uma dependência circular.

-- Esta política permite explicitamente que qualquer usuário autenticado
-- leia seus PRÓPRIOS dados de perfil.

CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (
    id = auth.uid()
);
-- =====================================================
-- CORREÇÃO DE LOOP INFINITO (ERRO 500)
-- =====================================================

-- O Erro 500 ocorre porque a política "Users can view org profiles"
-- tenta ler a tabela 'profiles' para checar permissão de leitura na própria tabela 'profiles',
-- criando um ciclo infinito.

-- 1. Remover a política problemática
DROP POLICY IF EXISTS "Users can view org profiles" ON public.profiles;

-- 2. Criar uma função de segurança (Bypassing RLS) para buscar o ID da Organização
-- Esta função roda com permissões elevadas apenas para buscar o org_id do usuÃ¡rio,
-- quebrando o ciclo de verificação.
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 3. Recriar a política usando a função segura
CREATE POLICY "Users can view org profiles" ON public.profiles
FOR SELECT USING (
  -- O usuário pode ver perfis que tenham o mesmo org_id que ele
  org_id = public.get_auth_org_id()
);

-- 4. Garantir acesso ao próprio perfil (Login)
-- Se a política do script 005 já existir, vamos recriá-la para garantir
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (
  id = auth.uid()
);
-- =====================================================
-- FIX: RECURSÃO INFINITA EM TODAS AS PERMISSÕES (ERRO 500)
-- =====================================================

-- O Erro 500 (Internal Server Error) no Supabase geralmente é
-- "infinite recursion in policy".
-- Isso acontece porque as policies de 'profiles' checam 'role' ou 'org_id'
-- na própria tabela 'profiles', criando um loop eterno.

-- Solução: Usar funções SECURITY DEFINER para checar dados
-- sem acionar as políticas RLS novamente.

-- 1. Função Segura para verificar se é Superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'superadmin'
  );
$$;

-- 2. Função Segura para pegar ID da Organização
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 3. Remover TODAS as políticas de leitura problemáticas
DROP POLICY IF EXISTS "Superadmin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view org profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- 4. Recriar Políticas usando as Funções Seguras

-- Política A: Usuário vê seu próprio perfil (Sem recursão, id vem do JWT)
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (
  id = auth.uid()
);

-- Política B: Usuário vê perfis da mesma organização
CREATE POLICY "Users can view org profiles" ON public.profiles
FOR SELECT USING (
  org_id = public.get_auth_org_id()
);

-- Política C: Superadmin vê tudo
CREATE POLICY "Superadmin can view all profiles" ON public.profiles
FOR SELECT USING (
  public.is_superadmin()
);
-- Adicionar data de nascimento na tabela customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birth_date DATE;
-- Seeding basic services for Sr Pet Clube organization
DO $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Get the organization ID created in 004
  SELECT id INTO v_org_id FROM public.organizations WHERE subdomain = 'srpetclube';

  IF v_org_id IS NOT NULL THEN
    
    INSERT INTO public.services (org_id, name, description, base_price, category, duration_minutes)
    SELECT v_org_id, 'Banho', 'Banho completo com produtos premium', 45.00, 'banho', 60
    WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE org_id = v_org_id AND name = 'Banho');

    INSERT INTO public.services (org_id, name, description, base_price, category, duration_minutes)
    SELECT v_org_id, 'Tosa Higiênica', 'Corte nas áreas íntimas e patas', 30.00, 'tosa', 30
    WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE org_id = v_org_id AND name = 'Tosa Higiênica');

    INSERT INTO public.services (org_id, name, description, base_price, category, duration_minutes)
    SELECT v_org_id, 'Banho e Tosa', 'Banho + Tosa completa', 80.00, 'banho_tosa', 90
    WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE org_id = v_org_id AND name = 'Banho e Tosa');

    INSERT INTO public.services (org_id, name, description, base_price, category, duration_minutes)
    SELECT v_org_id, 'Hidratação', 'Tratamento profundo para os pelos', 25.00, 'outro', 30
    WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE org_id = v_org_id AND name = 'Hidratação');

  END IF;
END $$;
-- Migration to add health fields to pets table
ALTER TABLE public.pets 
ADD COLUMN IF NOT EXISTS existing_conditions TEXT,
ADD COLUMN IF NOT EXISTS vaccination_up_to_date BOOLEAN DEFAULT false;
-- Ensure Admins can delete services
-- First drop existing policy to avoid conflict if names match, though 'create or replace' isn't supported for policies directly in all versions comfortably without drop.

DROP POLICY IF EXISTS "Admin can manage services" ON public.services;
DROP POLICY IF EXISTS "Services are viewable by everyone in org" ON public.services;

-- Re-create comprehensive policy
CREATE POLICY "Admin can manage services" ON public.services
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Services are viewable by everyone in org" ON public.services
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid()
    )
  );
-- =====================================================
-- MIGRATION: Service Packages System
-- Implementa sistema completo de pacotes de serviços
-- =====================================================

-- =====================================================
-- TABELA: service_packages (Templates de Pacotes)
-- Define os pacotes oferecidos pelo pet shop
-- =====================================================
CREATE TABLE IF NOT EXISTS public.service_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Ex: "Pacote Mensal Premium"
  description TEXT,
  total_price DECIMAL(10,2) NOT NULL, -- Preço único do pacote
  validity_days INTEGER, -- NULL = sem expiração, ou número de dias
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: package_items (Composição dos Pacotes)
-- Define quais serviços e quantidades compõem cada pacote
-- =====================================================
CREATE TABLE IF NOT EXISTS public.package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1, -- Quantidade deste serviço no pacote
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: customer_packages (Pacotes Comprados)
-- Registra quando um cliente compra um pacote
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customer_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.service_packages(id),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, -- NULL = sem expiração
  total_paid DECIMAL(10,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'credit', 'debit', 'pix', 'other')),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABELA: package_credits (Saldo de Serviços do Pacote)
-- Rastreia quantos créditos de cada serviço o cliente tem
-- =====================================================
CREATE TABLE IF NOT EXISTS public.package_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_package_id UUID NOT NULL REFERENCES public.customer_packages(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  total_quantity INTEGER NOT NULL, -- Quantidade original
  used_quantity INTEGER DEFAULT 0, -- Quantidade já utilizada
  remaining_quantity INTEGER NOT NULL, -- Quantidade restante (computed)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_service_packages_org ON public.service_packages(org_id);
CREATE INDEX IF NOT EXISTS idx_package_items_package ON public.package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_customer_packages_customer ON public.customer_packages(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_packages_org ON public.customer_packages(org_id);
CREATE INDEX IF NOT EXISTS idx_package_credits_package ON public.package_credits(customer_package_id);

-- =====================================================
-- MODIFICAR TABELA: appointments
-- Adicionar referência a créditos de pacotes
-- =====================================================
-- Renomear a coluna antiga credit_id para evitar conflito
ALTER TABLE public.appointments 
  DROP COLUMN IF EXISTS credit_id;

-- Adicionar nova coluna para pacotes
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS package_credit_id UUID REFERENCES public.package_credits(id);

-- =====================================================
-- HABILITAR ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_credits ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLÍTICAS RLS: Service Packages
-- =====================================================
CREATE POLICY "Users can view org packages" ON public.service_packages
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admin can manage packages" ON public.service_packages
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- POLÍTICAS RLS: Package Items
-- =====================================================
CREATE POLICY "Users can view package items" ON public.package_items
  FOR SELECT USING (
    package_id IN (
      SELECT id FROM public.service_packages 
      WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Admin can manage package items" ON public.package_items
  FOR ALL USING (
    package_id IN (
      SELECT id FROM public.service_packages 
      WHERE org_id IN (
        SELECT org_id FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
      )
    )
  );

-- =====================================================
-- POLÍTICAS RLS: Customer Packages
-- =====================================================
CREATE POLICY "Users can view org customer packages" ON public.customer_packages
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Staff can manage customer packages" ON public.customer_packages
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );

-- =====================================================
-- POLÍTICAS RLS: Package Credits
-- =====================================================
CREATE POLICY "Users can view package credits" ON public.package_credits
  FOR SELECT USING (
    customer_package_id IN (
      SELECT id FROM public.customer_packages 
      WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Staff can manage package credits" ON public.package_credits
  FOR ALL USING (
    customer_package_id IN (
      SELECT id FROM public.customer_packages 
      WHERE org_id IN (
        SELECT org_id FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
      )
    )
  );

-- =====================================================
-- FUNÇÃO: use_package_credit (Usar crédito do pacote)
-- =====================================================
CREATE OR REPLACE FUNCTION public.use_package_credit(
  p_customer_id UUID,
  p_service_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_credit_id UUID;
  v_customer_package_id UUID;
BEGIN
  -- Busca crédito disponível (não expirado, com saldo)
  SELECT pc.id, pc.customer_package_id INTO v_credit_id, v_customer_package_id
  FROM public.package_credits pc
  JOIN public.customer_packages cp ON cp.id = pc.customer_package_id
  WHERE cp.customer_id = p_customer_id
    AND pc.service_id = p_service_id
    AND pc.remaining_quantity > 0
    AND cp.is_active = true
    AND (cp.expires_at IS NULL OR cp.expires_at > now())
  ORDER BY cp.expires_at ASC NULLS LAST -- Usa primeiro os que expiram antes
  LIMIT 1;
  
  -- Se encontrou crédito, decrementa
  IF v_credit_id IS NOT NULL THEN
    UPDATE public.package_credits 
    SET 
      used_quantity = used_quantity + 1,
      remaining_quantity = remaining_quantity - 1,
      updated_at = now()
    WHERE id = v_credit_id;
    
    RETURN v_credit_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- FUNÇÃO: return_package_credit (Devolver crédito)
-- Usado quando um agendamento é cancelado
-- =====================================================
CREATE OR REPLACE FUNCTION public.return_package_credit(
  p_credit_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.package_credits 
  SET 
    used_quantity = used_quantity - 1,
    remaining_quantity = remaining_quantity + 1,
    updated_at = now()
  WHERE id = p_credit_id
    AND used_quantity > 0;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- FUNÇÃO: get_customer_package_summary
-- Retorna resumo dos pacotes de um cliente
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_customer_package_summary(
  p_customer_id UUID
)
RETURNS TABLE (
  package_name TEXT,
  purchased_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  service_name TEXT,
  total_qty INTEGER,
  used_qty INTEGER,
  remaining_qty INTEGER,
  is_expired BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.name as package_name,
    cp.purchased_at,
    cp.expires_at,
    s.name as service_name,
    pc.total_quantity as total_qty,
    pc.used_quantity as used_qty,
    pc.remaining_quantity as remaining_qty,
    (cp.expires_at IS NOT NULL AND cp.expires_at < now()) as is_expired
  FROM public.package_credits pc
  JOIN public.customer_packages cp ON cp.id = pc.customer_package_id
  JOIN public.service_packages sp ON sp.id = cp.package_id
  JOIN public.services s ON s.id = pc.service_id
  WHERE cp.customer_id = p_customer_id
    AND cp.is_active = true
  ORDER BY cp.purchased_at DESC, s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGER: Atualizar updated_at
-- =====================================================
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.service_packages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.package_credits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- VIEW: Resumo de pacotes ativos
-- =====================================================
CREATE OR REPLACE VIEW public.active_packages_summary AS
SELECT 
  cp.id as customer_package_id,
  cp.customer_id,
  c.name as customer_name,
  sp.name as package_name,
  cp.purchased_at,
  cp.expires_at,
  CASE 
    WHEN cp.expires_at IS NULL THEN 'Sem expiração'
    WHEN cp.expires_at < now() THEN 'Expirado'
    ELSE 'Ativo'
  END as status,
  COUNT(pc.id) as total_services,
  SUM(pc.remaining_quantity) as total_remaining_credits
FROM public.customer_packages cp
JOIN public.customers c ON c.id = cp.customer_id
JOIN public.service_packages sp ON sp.id = cp.package_id
LEFT JOIN public.package_credits pc ON pc.customer_package_id = cp.id
WHERE cp.is_active = true
GROUP BY cp.id, cp.customer_id, c.name, sp.name, cp.purchased_at, cp.expires_at;

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================
-- =====================================================
-- MIGRATION: Add Pet Relationship to Packages
-- Permite vincular pacotes a pets específicos
-- =====================================================

-- Adicionar coluna pet_id (opcional) em customer_packages
ALTER TABLE public.customer_packages 
  ADD COLUMN IF NOT EXISTS pet_id UUID REFERENCES public.pets(id) ON DELETE CASCADE;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_customer_packages_pet ON public.customer_packages(pet_id);

-- Modificar função use_package_credit para aceitar pet_id
CREATE OR REPLACE FUNCTION public.use_package_credit_for_pet(
  p_pet_id UUID,
  p_service_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_credit_id UUID;
  v_customer_package_id UUID;
  v_customer_id UUID;
BEGIN
  -- Busca customer_id do pet
  SELECT customer_id INTO v_customer_id
  FROM public.pets
  WHERE id = p_pet_id;
  
  -- Busca crédito disponível
  -- Prioridade: 1) Pacote específico do pet, 2) Pacote geral do cliente
  SELECT pc.id, pc.customer_package_id INTO v_credit_id, v_customer_package_id
  FROM public.package_credits pc
  JOIN public.customer_packages cp ON cp.id = pc.customer_package_id
  WHERE (cp.pet_id = p_pet_id OR (cp.pet_id IS NULL AND cp.customer_id = v_customer_id))
    AND pc.service_id = p_service_id
    AND pc.remaining_quantity > 0
    AND cp.is_active = true
    AND (cp.expires_at IS NULL OR cp.expires_at > now())
  ORDER BY 
    CASE WHEN cp.pet_id = p_pet_id THEN 0 ELSE 1 END, -- Prioriza pacotes do pet específico
    cp.expires_at ASC NULLS LAST -- Depois por expiração
  LIMIT 1;
  
  -- Se encontrou crédito, decrementa
  IF v_credit_id IS NOT NULL THEN
    UPDATE public.package_credits 
    SET 
      used_quantity = used_quantity + 1,
      remaining_quantity = remaining_quantity - 1,
      updated_at = now()
    WHERE id = v_credit_id;
    
    RETURN v_credit_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para obter resumo de pacotes de um pet específico
CREATE OR REPLACE FUNCTION public.get_pet_package_summary(
  p_pet_id UUID
)
RETURNS TABLE (
  customer_package_id UUID,
  package_name TEXT,
  purchased_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  service_name TEXT,
  service_id UUID,
  total_qty INTEGER,
  used_qty INTEGER,
  remaining_qty INTEGER,
  is_expired BOOLEAN
) AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  -- Busca customer_id do pet
  SELECT customer_id INTO v_customer_id
  FROM public.pets
  WHERE id = p_pet_id;
  
  -- Retorna pacotes do pet específico + pacotes gerais do cliente
  RETURN QUERY
  SELECT 
    cp.id as customer_package_id,
    sp.name as package_name,
    cp.purchased_at,
    cp.expires_at,
    s.name as service_name,
    s.id as service_id,
    pc.total_quantity as total_qty,
    pc.used_quantity as used_qty,
    pc.remaining_quantity as remaining_qty,
    (cp.expires_at IS NOT NULL AND cp.expires_at < now()) as is_expired
  FROM public.package_credits pc
  JOIN public.customer_packages cp ON cp.id = pc.customer_package_id
  JOIN public.service_packages sp ON sp.id = cp.package_id
  JOIN public.services s ON s.id = pc.service_id
  WHERE (cp.pet_id = p_pet_id OR (cp.pet_id IS NULL AND cp.customer_id = v_customer_id))
    AND cp.is_active = true
    AND pc.remaining_quantity > 0
  ORDER BY 
    CASE WHEN cp.pet_id = p_pet_id THEN 0 ELSE 1 END,
    cp.purchased_at DESC, 
    s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualizar view para incluir pet_id
DROP VIEW IF EXISTS public.active_packages_summary;
CREATE OR REPLACE VIEW public.active_packages_summary AS
SELECT 
  cp.id as customer_package_id,
  cp.customer_id,
  cp.pet_id,
  c.name as customer_name,
  p.name as pet_name,
  sp.name as package_name,
  cp.purchased_at,
  cp.expires_at,
  CASE 
    WHEN cp.expires_at IS NULL THEN 'Sem expiração'
    WHEN cp.expires_at < now() THEN 'Expirado'
    ELSE 'Ativo'
  END as status,
  COUNT(pc.id) as total_services,
  SUM(pc.remaining_quantity) as total_remaining_credits
FROM public.customer_packages cp
JOIN public.customers c ON c.id = cp.customer_id
LEFT JOIN public.pets p ON p.id = cp.pet_id
JOIN public.service_packages sp ON sp.id = cp.package_id
LEFT JOIN public.package_credits pc ON pc.customer_package_id = cp.id
WHERE cp.is_active = true
GROUP BY cp.id, cp.customer_id, cp.pet_id, c.name, p.name, sp.name, cp.purchased_at, cp.expires_at;

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================
-- =====================================================
-- MIGRATION: Schedule Blocks (Bloqueio de Agenda)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_org_date ON public.schedule_blocks(org_id, start_at);

-- RLS
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org blocks" ON public.schedule_blocks
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Staff can manage org blocks" ON public.schedule_blocks
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );
-- Service Categories Migration
-- Creates service_categories table and updates services table

-- Create service_categories table
CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) NOT NULL, -- hex color
    icon VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO service_categories (name, color, icon) VALUES
    ('Banho e Tosa', '#3B82F6', '🚿'),
    ('Creche', '#10B981', '🎾'),
    ('Hospedagem', '#F97316', '🏨');

-- Add category_id to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES service_categories(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);

-- Update existing services to default to "Banho e Tosa" category
-- (You can manually update these later based on actual service types)
UPDATE services 
SET category_id = (SELECT id FROM service_categories WHERE name = 'Banho e Tosa')
WHERE category_id IS NULL;
-- Pet Behavioral & Health Assessment Migration
-- Creates table for storing comprehensive pet assessment data required for Creche and Hospedagem services

CREATE TABLE IF NOT EXISTS pet_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id),
    
    -- Socialização
    sociable_with_humans BOOLEAN,
    sociable_with_dogs BOOLEAN,
    socialized_early BOOLEAN,
    desensitized BOOLEAN,
    is_reactive BOOLEAN,
    reactive_description TEXT,
    shows_escape_signs BOOLEAN,
    has_bitten_person BOOLEAN,
    has_been_bitten BOOLEAN,
    
    -- Rotina e comportamento
    has_routine BOOLEAN,
    regular_walks BOOLEAN,
    stays_alone_ok BOOLEAN,
    daily_routine_description TEXT,
    separation_anxiety BOOLEAN,
    has_phobias BOOLEAN,
    phobia_description TEXT,
    possessive_behavior BOOLEAN,
    humanization_traits BOOLEAN,
    obeys_basic_commands BOOLEAN,
    professionally_trained BOOLEAN,
    
    -- Saúde
    is_brachycephalic BOOLEAN,
    age_health_restrictions BOOLEAN,
    has_health_issues BOOLEAN,
    health_issues_description TEXT,
    food_restrictions BOOLEAN,
    food_restrictions_description TEXT,
    has_dermatitis BOOLEAN,
    activity_restrictions BOOLEAN,
    patellar_orthopedic_issues BOOLEAN,
    other_health_notes TEXT,
    
    -- Cuidados específicos
    water_reaction VARCHAR(100), -- "calmo", "nervoso", "adora", etc
    pool_authorized BOOLEAN,
    food_brand VARCHAR(200),
    
    -- Declaração
    owner_declaration_accepted BOOLEAN NOT NULL DEFAULT false,
    declaration_accepted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(pet_id) -- Um assessment por pet
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pet_assessments_pet ON pet_assessments(pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_assessments_org ON pet_assessments(org_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pet_assessment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pet_assessments_update_timestamp
    BEFORE UPDATE ON pet_assessments
    FOR EACH ROW
    EXECUTE FUNCTION update_pet_assessment_updated_at();
-- Appointments Category Enhancement Migration
-- Adds service category awareness and date range support for Hospedagem

-- Add category reference to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_category_id UUID REFERENCES service_categories(id);

-- Add date range fields for Hospedagem (boarding)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS check_in_date DATE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS check_out_date DATE;

-- Create index for category-based queries
CREATE INDEX IF NOT EXISTS idx_appointments_category ON appointments(service_category_id);

-- Update existing appointments to infer category from their service
UPDATE appointments a
SET service_category_id = s.category_id
FROM services s
WHERE a.service_id = s.id
  AND a.service_category_id IS NULL;

-- For single-day appointments (Banho e Tosa, Creche), set both dates to scheduled_at date
UPDATE appointments
SET check_in_date = DATE(scheduled_at),
    check_out_date = DATE(scheduled_at)
WHERE check_in_date IS NULL;
-- Update Banho e Tosa color to a more vibrant blue
UPDATE service_categories 
SET color = '#2563EB' 
WHERE name = 'Banho e Tosa';
-- Add status field to pet_assessments table
-- This field is required by the appointment validation logic

ALTER TABLE pet_assessments
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'approved';

-- Update any existing records to have approved status
UPDATE pet_assessments
SET status = 'approved'
WHERE status IS NULL;

-- Add comment for clarity
COMMENT ON COLUMN pet_assessments.status IS 'Assessment status: pending, approved, rejected';
-- Migration: Add daily reports and actual check-in/out tracking
-- Enables tracking actual arrival/departure times and daily activity reports with photos

-- Add actual check-in/out times to appointments
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS actual_check_in TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS actual_check_out TIMESTAMPTZ;

-- Daily reports table for tracking pet activities during Creche/Banho e Tosa
CREATE TABLE IF NOT EXISTS appointment_daily_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id),
    report_text TEXT,
    photos TEXT[], -- Array of Supabase Storage URLs
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(appointment_id) -- One report per appointment
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_daily_reports_appointment ON appointment_daily_reports(appointment_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_org ON appointment_daily_reports(org_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_daily_report_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_reports_update_timestamp
    BEFORE UPDATE ON appointment_daily_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_daily_report_updated_at();

-- Comments for documentation
COMMENT ON TABLE appointment_daily_reports IS 'Stores daily activity reports and photos for Creche and Banho e Tosa appointments';
COMMENT ON COLUMN appointments.actual_check_in IS 'Actual time pet arrived (vs scheduled_at)';
COMMENT ON COLUMN appointments.actual_check_out IS 'Actual time pet departed';
-- Add scheduling_rules to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS scheduling_rules JSONB DEFAULT '[]'::jsonb;
-- Create storage bucket for daily report photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-report-photos', 'daily-report-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload daily report photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'daily-report-photos' 
    AND (storage.foldername(name))[1] = 'daily-reports'
);

-- Allow authenticated users to view photos from their org
CREATE POLICY "Users can view daily report photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'daily-report-photos');

-- Allow authenticated users to delete their own photos
CREATE POLICY "Users can delete daily report photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'daily-report-photos');
-- Create Pricing Rules table for services based on weight/attributes
create table if not exists public.pricing_rules (
    id uuid not null default gen_random_uuid(),
    service_id uuid not null references public.services(id) on delete cascade,
    org_id uuid not null references public.profiles(id), -- Assuming org linked via profile or organizations table, wait services has org_id
    min_weight numeric(5,2) not null default 0,
    max_weight numeric(5,2) not null default 999.99,
    price numeric(10,2) not null,
    created_at timestamptz default now(),
    
    constraint pricing_rules_pkey primary key (id),
    constraint pricing_rules_weight_check check (min_weight <= max_weight)
);

-- Add RLS
alter table public.pricing_rules enable row level security;

create policy "Users can view pricing rules of their org"
    on public.pricing_rules for select
    using (
        exists (
            select 1 from public.services s
            where s.id = pricing_rules.service_id
            and s.org_id = (select org_id from public.profiles where id = auth.uid())
        )
    );

create policy "Users can manage pricing rules of their org"
    on public.pricing_rules for all
    using (
        exists (
            select 1 from public.services s
            where s.id = pricing_rules.service_id
            and s.org_id = (select org_id from public.profiles where id = auth.uid())
        )
    );


-- Add calculated_price to appointments to lock in the price at booking time
alter table public.appointments 
add column if not exists calculated_price numeric(10,2);
-- Migration to fix service categories
-- Corrects services that were wrongly assigned to 'Banho e Tosa' default category

-- Update services containing 'Hospedagem' or 'Hotel' in their name
-- to belong to the 'Hospedagem' category
UPDATE services 
SET category_id = (SELECT id FROM service_categories WHERE name = 'Hospedagem')
WHERE (name ILIKE '%hospedagem%' OR name ILIKE '%hotel%');

-- Optional: Update services containing 'Creche' to 'Creche' category just in case
UPDATE services 
SET category_id = (SELECT id FROM service_categories WHERE name = 'Creche')
WHERE (name ILIKE '%creche%' OR name ILIKE '%day care%');
-- Add checklist_template to services table
-- This allows defining a default checklist for each service (e.g., Banho e Tosa steps)

ALTER TABLE services 
ADD COLUMN IF NOT EXISTS checklist_template JSONB DEFAULT '[]'::jsonb;

-- Comment on column
COMMENT ON COLUMN services.checklist_template IS 'Default checklist items for this service (JSON array of strings)';
-- Add payment status, paid_at, and discount_percent to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'partial')) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0;

-- Update existing appointments: set final_price = calculated_price where not already set
UPDATE public.appointments
SET final_price = calculated_price
WHERE final_price IS NULL AND calculated_price IS NOT NULL;

-- Index for dashboard queries (filtering by payment_status)
CREATE INDEX IF NOT EXISTS idx_appointments_payment_status ON public.appointments(org_id, payment_status);
-- Create storage buckets for products, avatars, and pets
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('products', 'products', true),
  ('avatars', 'avatars', true),
  ('pets', 'pets', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for PRODUCTS bucket
-- Allow authenticated users to upload product images
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'products' 
    AND (
        (storage.foldername(name))[1] IS NULL 
        OR (storage.foldername(name))[1] != 'private'
    )
);

-- Allow public read access to product images
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'products');

-- Allow authenticated users to delete their uploaded product images
DROP POLICY IF EXISTS "Users can delete product images" ON storage.objects;
CREATE POLICY "Users can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'products');


-- Policies for AVATARS bucket
-- Allow authenticated users to upload avatars
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'avatars' 
);

-- Allow public read access to avatars (so anyone can see user profiles if needed, or change to auth only)
-- Let's make it public for simplicity in UI, but maybe restrict to auth?
-- Profiles are usually public or internal to org. Public is safer for simple implementation.
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow users to update/delete their own avatar
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');


-- Policies for PETS bucket
-- Allow authenticated users to upload pet photos
DROP POLICY IF EXISTS "Authenticated users can upload pet photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload pet photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'pets' 
);

-- Allow public read access to pet photos
DROP POLICY IF EXISTS "Public can view pet photos" ON storage.objects;
CREATE POLICY "Public can view pet photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'pets');

-- Allow users to delete pet photos
DROP POLICY IF EXISTS "Users can delete pet photos" ON storage.objects;
CREATE POLICY "Users can delete pet photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'pets');
-- Add min_stock_alert column to products table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'products'
        AND column_name = 'min_stock_alert'
    ) THEN
        ALTER TABLE public.products ADD COLUMN min_stock_alert INTEGER DEFAULT 5;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'products'
        AND column_name = 'expiration_date'
    ) THEN
        ALTER TABLE public.products ADD COLUMN expiration_date DATE;
    END IF;
END $$;
-- Repair products table schema to match application expectations and fix missing/conflicting columns
DO $$ 
BEGIN
    -- Handle selling_price vs price mismatch
    -- If selling_price exists, migrate data to price and drop it
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='selling_price') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='price') THEN
            -- Only selling_price exists, rename it to price
            ALTER TABLE public.products RENAME COLUMN selling_price TO price;
        ELSE
            -- Both exist, migrate and drop selling_price
            UPDATE public.products SET price = selling_price WHERE price = 0 OR price IS NULL;
            ALTER TABLE public.products DROP COLUMN selling_price;
        END IF;
    END IF;

    -- Ensure price column exists (the main cause of PGRST204 if missing)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='price') THEN
        ALTER TABLE public.products ADD COLUMN price DECIMAL(10,2) NOT NULL DEFAULT 0;
    ELSE
        -- Ensure it's NOT NULL and has a default
        ALTER TABLE public.products ALTER COLUMN price SET NOT NULL;
        ALTER TABLE public.products ALTER COLUMN price SET DEFAULT 0;
    END IF;

    -- Ensure cost_price exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='cost_price') THEN
        ALTER TABLE public.products ADD COLUMN cost_price DECIMAL(10,2) DEFAULT 0;
    END IF;

    -- Ensure image_url exists (standardizing on image_url instead of photo_url)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='image_url') THEN
        ALTER TABLE public.products ADD COLUMN image_url TEXT;
    END IF;

    -- If photo_url exists, migrate data and drop it
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='photo_url') THEN
        UPDATE public.products SET image_url = photo_url WHERE image_url IS NULL;
        ALTER TABLE public.products DROP COLUMN photo_url;
    END IF;

    -- Ensure bar_code exists (standardizing on bar_code with underscore)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='bar_code') THEN
        ALTER TABLE public.products ADD COLUMN bar_code TEXT;
    END IF;

    -- If barcode (no underscore) exists, migrate data and drop it
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='barcode') THEN
        UPDATE public.products SET bar_code = barcode WHERE bar_code IS NULL;
        ALTER TABLE public.products DROP COLUMN barcode;
    END IF;

    -- Ensure expiration_date exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='expiration_date') THEN
        ALTER TABLE public.products ADD COLUMN expiration_date TIMESTAMPTZ;
    END IF;

    -- Ensure min_stock_alert exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='min_stock_alert') THEN
        ALTER TABLE public.products ADD COLUMN min_stock_alert INTEGER DEFAULT 5;
    END IF;

    -- Safety: ensure price is not null
    ALTER TABLE public.products ALTER COLUMN price SET NOT NULL;

END $$;
-- Ensure financial_transactions table exists and is correctly configured
-- This migration re-runs the creation logic from 003 but with IF NOT EXISTS to be safe

DO $$
BEGIN
    -- 1. Create the table if it doesn't exist
    CREATE TABLE IF NOT EXISTS public.financial_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
        type TEXT CHECK (type IN ('income', 'expense')) NOT NULL,
        category TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        description TEXT,
        payment_method TEXT,
        date TIMESTAMPTZ DEFAULT now(),
        created_by UUID REFERENCES public.profiles(id),
        reference_id UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    -- 2. Create indices if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_org_date') THEN
        CREATE INDEX idx_transactions_org_date ON public.financial_transactions(org_id, date);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_type') THEN
        CREATE INDEX idx_transactions_type ON public.financial_transactions(org_id, type);
    END IF;

    -- 3. Ensure RLS is enabled
    ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

    -- 4. Re-create policies (dropping first to ensure they are correct)
    DROP POLICY IF EXISTS "Users can view org transactions" ON public.financial_transactions;
    DROP POLICY IF EXISTS "Admin can view org transactions" ON public.financial_transactions;
    DROP POLICY IF EXISTS "Admin can manage transactions" ON public.financial_transactions;

    CREATE POLICY "Admin can view org transactions" ON public.financial_transactions
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin'))
    );

    CREATE POLICY "Admin can manage transactions" ON public.financial_transactions
    FOR ALL USING (
        org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin'))
    );

END $$;
-- Adicionar colunas de horário de trabalho em profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS work_start_time TIME DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS lunch_start_time TIME DEFAULT '12:00',
ADD COLUMN IF NOT EXISTS lunch_end_time TIME DEFAULT '13:00',
ADD COLUMN IF NOT EXISTS work_end_time TIME DEFAULT '18:00';

-- Adicionar índice para melhorar performance de consultas por período no ponto
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON public.time_entries(clock_in);

-- Comentários para documentação
COMMENT ON COLUMN public.profiles.work_start_time IS 'Horário previsto de entrada';
COMMENT ON COLUMN public.profiles.lunch_start_time IS 'Início previsto do intervalo';
COMMENT ON COLUMN public.profiles.lunch_end_time IS 'Fim previsto do intervalo';
COMMENT ON COLUMN public.profiles.work_end_time IS 'Horário previsto de saída';
-- =====================================================
-- MIGRATION: Fix RLS Recursion (Comprehensive)
-- =====================================================

-- 1. Helper Function: Is Superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin() 
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'superadmin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Helper Function: Get Org ID
CREATE OR REPLACE FUNCTION public.get_my_org_id() 
RETURNS UUID AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3. Limpar políticas de PROFILES
DROP POLICY IF EXISTS "Superadmin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view org profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can view org profiles" ON public.profiles
  FOR SELECT USING (org_id = public.get_my_org_id());

CREATE POLICY "Superadmin can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_superadmin());

-- 4. Limpar políticas de ORGANIZATIONS
DROP POLICY IF EXISTS "Superadmin can view all organizations" ON public.organizations;
DROP POLICY IF EXISTS "Superadmin can manage organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can view own organization" ON public.organizations;

CREATE POLICY "Users can view own organization" ON public.organizations
  FOR SELECT USING (id = public.get_my_org_id());

CREATE POLICY "Superadmin can handle all organizations" ON public.organizations
  FOR ALL USING (public.is_superadmin());

-- 5. Limpar e recriar políticas de SCHEDULE_BLOCKS
DROP POLICY IF EXISTS "Users can view org blocks" ON public.schedule_blocks;
DROP POLICY IF EXISTS "Staff can manage org blocks" ON public.schedule_blocks;

CREATE POLICY "Users can view org blocks" ON public.schedule_blocks
  FOR SELECT USING (org_id = public.get_my_org_id());

CREATE POLICY "Staff can manage org blocks" ON public.schedule_blocks
  FOR ALL USING (
    org_id = public.get_my_org_id() 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );
-- =====================================================
-- MIGRATION: Fix Time Clock RLS
-- =====================================================

-- 1. Limpar políticas existentes para time_entries
DROP POLICY IF EXISTS "Staff can create own time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Staff can view own time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Admin can view org time entries" ON public.time_entries;

-- 2. Staff pode criar próprias entradas
CREATE POLICY "Staff can create own time entries" ON public.time_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 3. Staff pode ver próprias entradas
CREATE POLICY "Staff can view own time entries" ON public.time_entries
  FOR SELECT USING (user_id = auth.uid());

-- 4. Staff pode ATUALIZAR próprias entradas (para registrar saída)
-- Permite atualizar apenas clock_out e justification
CREATE POLICY "Staff can update own time entries" ON public.time_entries
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5. Admin/Superadmin pode ver todas entradas da org (Não recursivo)
CREATE POLICY "Admin can view org time entries" ON public.time_entries
  FOR SELECT USING (
    org_id = public.get_my_org_id() 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );
-- =====================================================
-- FIX: RLS Policies for Tutors (Customers)
-- =====================================================

-- 1. Profiles: Tutors can update their own phone and avatar
-- (Policy "Users can update own profile" already exists for ALL users)

-- 2. Customers: Tutors can view their own customer record
CREATE POLICY "Tutors can view own customer record" ON public.customers
FOR SELECT USING (
    user_id = auth.uid()
);

-- 3. Pets: Tutors can view only their own pets
CREATE POLICY "Tutors can view own pets" ON public.pets
FOR SELECT USING (
    customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
);

-- 4. Appointments: Tutors can view only their own appointments
CREATE POLICY "Tutors can view own appointments" ON public.appointments
FOR SELECT USING (
    pet_id IN (
      SELECT id FROM public.pets 
      WHERE customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      )
    )
);

-- 5. Daily Reports: Tutors can view reports for their own pets
CREATE POLICY "Tutors can view own pet reports" ON public.daily_reports
FOR SELECT USING (
    pet_id IN (
      SELECT id FROM public.pets 
      WHERE customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
      )
    )
);
-- Migration: Add target_species to services table
-- Enables filtering services by pet species (dog, cat, both)

ALTER TABLE public.services 
ADD COLUMN IF NOT EXISTS target_species TEXT CHECK (target_species IN ('dog', 'cat', 'both')) DEFAULT 'both';

-- Update existing services based on their category or name (heuristic)
-- This is a best-effort update for existing data
UPDATE public.services 
SET target_species = 'dog' 
WHERE 
  name ILIKE '%tosa%' OR 
  category = 'creche'; -- Usually daycare is for dogs primarily, but can be adjusted

-- You might want to manually review services after this migration
-- Migration: Allow tutors to insert appointments
-- Fixes the error where tutors cannot create bookings due to RLS

CREATE POLICY "Tutors can create own appointments" ON public.appointments
FOR INSERT WITH CHECK (
    -- The pet must belong to the user
    pet_id IN (
        SELECT id FROM public.pets 
        WHERE customer_id IN (
            SELECT id FROM public.customers WHERE user_id = auth.uid()
        )
    )
    -- AND the customer_id must match the user's customer record
    AND customer_id IN (
        SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
);
-- Migration: Add allowed_species to schedule_blocks
-- Enables blocking time slots for specific species (e.g., Cat Day)

ALTER TABLE public.schedule_blocks
ADD COLUMN IF NOT EXISTS allowed_species TEXT[] DEFAULT NULL;

-- Comment: If allowed_species is NULL/Empty, it blocks EVERYONE (default behavior).
-- If allowed_species has values (e.g. ['cat']), it allows CATS but blocks DOGS.
-- Fix: Restrict "View Org Data" policies to Staff/Admin only to prevent data leakage between customers

-- 1. Update Customers Policy
DROP POLICY IF EXISTS "Users can view org customers" ON public.customers;
CREATE POLICY "Staff can view org customers" ON public.customers
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );

-- 2. Update Pets Policy
DROP POLICY IF EXISTS "Users can view org pets" ON public.pets;
CREATE POLICY "Staff can view org pets" ON public.pets
  FOR SELECT USING (
    customer_id IN (
      SELECT id FROM public.customers 
      WHERE org_id IN (
        SELECT org_id FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
      )
    )
  );

-- 3. Update Appointments Policy
DROP POLICY IF EXISTS "Users can view org appointments" ON public.appointments;
CREATE POLICY "Staff can view org appointments" ON public.appointments
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );

-- 4. Update Daily Reports Policy
DROP POLICY IF EXISTS "Users can view org reports" ON public.daily_reports;
CREATE POLICY "Staff can view org reports" ON public.daily_reports
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );

-- 5. Update Service Credits Policy (Prevent leakage here too)
DROP POLICY IF EXISTS "Users can view org credits" ON public.service_credits;
CREATE POLICY "Staff can view org credits" ON public.service_credits
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );

-- Ensure Tutors can see their own Service Credits (Missing from previous migrations)
CREATE POLICY "Tutors can view own credits" ON public.service_credits
  FOR SELECT USING (
    pet_id IN (
        SELECT id FROM public.pets
        WHERE customer_id IN (
            SELECT id FROM public.customers WHERE user_id = auth.uid()
        )
    )
  );
-- Create pet_vaccines table
CREATE TABLE IF NOT EXISTS public.pet_vaccines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID REFERENCES public.pets(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    batch_number TEXT,
    application_date DATE,
    expiry_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create notifications table
CREATE TYPE notification_type AS ENUM ('vaccine_expiry', 'product_expiry');

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create notification_reads table
CREATE TABLE IF NOT EXISTS public.notification_reads (
    notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (notification_id, user_id)
);

-- Add RLS Policies

-- pet_vaccines
ALTER TABLE public.pet_vaccines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vaccines for their org's pets" ON public.pet_vaccines
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.pets
            WHERE pets.id = pet_vaccines.pet_id
            AND pets.customer_id IN (
                SELECT id FROM public.customers WHERE org_id IN (
                    SELECT org_id FROM public.profiles WHERE id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Tutors can view their own pets' vaccines" ON public.pet_vaccines
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.pets
            WHERE pets.id = pet_vaccines.pet_id
            AND pets.customer_id IN (
                SELECT id FROM public.customers WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Staff/Admins can manage vaccines" ON public.pet_vaccines
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('staff', 'admin', 'superadmin')
        )
    );

-- notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notifications for their org" ON public.notifications
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "System/Staff can insert notifications" ON public.notifications
    FOR INSERT WITH CHECK (
        org_id IN (
            SELECT org_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- notification_reads
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reads" ON public.notification_reads
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own reads" ON public.notification_reads
    FOR INSERT WITH CHECK (user_id = auth.uid());
-- migration 040_unique_notifications.sql

-- Drop duplicates first, keeping the oldest one
DELETE FROM notifications a USING notifications b
  WHERE a.id > b.id
  AND a.org_id = b.org_id
  AND a.type = b.type
  AND a.reference_id = b.reference_id;

-- Add unique constraint
ALTER TABLE notifications
  ADD CONSTRAINT unique_notification_per_reference UNIQUE (org_id, type, reference_id);
-- Migration 041: Add work_schedule column to profiles table

-- The work_schedule will store a JSON array where each item represents a day of the week (0 = Sunday, 1 = Monday, etc.)
-- Ex: [ { "day": 1, "isActive": true, "start": "08:00", "end": "18:00", "lunchStart": "12:00", "lunchEnd": "13:00" }, ... ]

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS work_schedule JSONB DEFAULT '[]'::jsonb;

-- Migrate existing work hours to JSON format for active employees
DO $$
DECLARE
    r RECORD;
    schedule_json JSONB;
BEGIN
    FOR r IN SELECT id, work_start_time, work_end_time, lunch_start_time, lunch_end_time FROM public.profiles WHERE role != 'customer'
    LOOP
        -- Default to Mon-Fri (1-5) if they had work times, otherwise empty
        IF r.work_start_time IS NOT NULL THEN
            schedule_json := jsonb_build_array(
                jsonb_build_object('day', 0, 'isActive', false, 'start', '', 'end', '', 'lunchStart', '', 'lunchEnd', ''),
                jsonb_build_object('day', 1, 'isActive', true, 'start', coalesce(r.work_start_time, '08:00'), 'end', coalesce(r.work_end_time, '18:00'), 'lunchStart', coalesce(r.lunch_start_time, '12:00'), 'lunchEnd', coalesce(r.lunch_end_time, '13:00')),
                jsonb_build_object('day', 2, 'isActive', true, 'start', coalesce(r.work_start_time, '08:00'), 'end', coalesce(r.work_end_time, '18:00'), 'lunchStart', coalesce(r.lunch_start_time, '12:00'), 'lunchEnd', coalesce(r.lunch_end_time, '13:00')),
                jsonb_build_object('day', 3, 'isActive', true, 'start', coalesce(r.work_start_time, '08:00'), 'end', coalesce(r.work_end_time, '18:00'), 'lunchStart', coalesce(r.lunch_start_time, '12:00'), 'lunchEnd', coalesce(r.lunch_end_time, '13:00')),
                jsonb_build_object('day', 4, 'isActive', true, 'start', coalesce(r.work_start_time, '08:00'), 'end', coalesce(r.work_end_time, '18:00'), 'lunchStart', coalesce(r.lunch_start_time, '12:00'), 'lunchEnd', coalesce(r.lunch_end_time, '13:00')),
                jsonb_build_object('day', 5, 'isActive', true, 'start', coalesce(r.work_start_time, '08:00'), 'end', coalesce(r.work_end_time, '18:00'), 'lunchStart', coalesce(r.lunch_start_time, '12:00'), 'lunchEnd', coalesce(r.lunch_end_time, '13:00')),
                jsonb_build_object('day', 6, 'isActive', false, 'start', '', 'end', '', 'lunchStart', '', 'lunchEnd', '')
            );
            
            UPDATE public.profiles SET work_schedule = schedule_json WHERE id = r.id;
        END IF;
    END LOOP;
END $$;
-- Add permissions column to profiles table for granular staff module access
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;

-- Typical permissions expected: 'banho_tosa', 'creche', 'hospedagem', 'servicos', 'ponto'
-- Only applicable for users with role = 'staff'.
-- Create petshop_sales table to track pending and paid product sales to pets

CREATE TABLE IF NOT EXISTS public.petshop_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    pet_id UUID REFERENCES public.pets(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'partial')) DEFAULT 'paid',
    payment_method TEXT,
    financial_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indices for fast lookups
CREATE INDEX IF NOT EXISTS idx_petshop_sales_org ON public.petshop_sales(org_id);
CREATE INDEX IF NOT EXISTS idx_petshop_sales_pet ON public.petshop_sales(pet_id);
CREATE INDEX IF NOT EXISTS idx_petshop_sales_status ON public.petshop_sales(org_id, payment_status);

-- RLS
ALTER TABLE public.petshop_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view org petshop_sales" ON public.petshop_sales
FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin'))
);

CREATE POLICY "Admin can manage petshop_sales" ON public.petshop_sales
FOR ALL USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin'))
);
-- Dynamic Pet Assessment Migration

-- 1. Create Assessment Questions Table
CREATE TABLE IF NOT EXISTS assessment_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- e.g., 'social', 'routine', 'health', 'care'
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL CHECK (question_type IN ('boolean', 'text', 'select')),
    options JSONB, -- Array of strings for 'select' type (e.g., ["Calmo", "Nervoso"])
    is_active BOOLEAN NOT NULL DEFAULT true,
    order_index INTEGER NOT NULL DEFAULT 0,
    system_key VARCHAR(100), -- To link back to old hardcoded fields, useful for data migration
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_questions_org ON assessment_questions(org_id);

-- 2. Create Assessment Answers Table
CREATE TABLE IF NOT EXISTS assessment_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
    answer_boolean BOOLEAN,
    answer_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pet_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_answers_pet ON assessment_answers(pet_id);

-- 3. Update functionality
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_questions_update_timestamp
    BEFORE UPDATE ON assessment_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

CREATE TRIGGER assessment_answers_update_timestamp
    BEFORE UPDATE ON assessment_answers
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

-- 4. Enable RLS
ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_answers ENABLE ROW LEVEL SECURITY;

-- 5. Policies for assessment_questions
-- Staff/Owner can manage questions for their org
CREATE POLICY "Staff can manage org assessment questions" ON assessment_questions
    USING (org_id IN (
        SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'staff')
    ));

-- Tutors can view active questions for their org
CREATE POLICY "Tutors can view org assessment questions" ON assessment_questions
    FOR SELECT
    USING (org_id IN (
        SELECT org_id FROM profiles WHERE id = auth.uid()
    ) AND is_active = true);

-- 6. Policies for assessment_answers
-- Tutors can manage answers for their own pets
CREATE POLICY "Tutors can manage their pets answers" ON assessment_answers
    USING (pet_id IN (
        SELECT id FROM pets WHERE customer_id IN (
            SELECT id FROM customers WHERE user_id = auth.uid()
        )
    ));

-- Staff/Owner can manage all answers in their org
CREATE POLICY "Staff can manage all org assessment answers" ON assessment_answers
    USING (pet_id IN (
        SELECT id FROM pets WHERE customer_id IN (
            SELECT id FROM customers WHERE org_id IN (
                SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'staff')
            )
        )
    ));

-- 7. Data Migration: Pre-populate questions for all existing organizations
DO $$
DECLARE
    org RECORD;
BEGIN
    FOR org IN SELECT id FROM organizations LOOP
        -- Socialização
        INSERT INTO assessment_questions (org_id, category, question_text, question_type, system_key, order_index) VALUES
        (org.id, 'social', 'É sociável com humanos?', 'boolean', 'sociable_with_humans', 10),
        (org.id, 'social', 'É sociável com outros cães?', 'boolean', 'sociable_with_dogs', 20),
        (org.id, 'social', 'Foi socializado na infância (primeiros meses)?', 'boolean', 'socialized_early', 30),
        (org.id, 'social', 'Foi dessensibilizado (acostumado a sons, pessoas, objetos)?', 'boolean', 'desensitized', 40),
        (org.id, 'social', 'É reativo?', 'boolean', 'is_reactive', 50),
        (org.id, 'social', 'Se sim, descreva o comportamento reativo:', 'text', 'reactive_description', 60),
        (org.id, 'social', 'Apresenta sinais de fuga (tentar sair, cavar, pular portões)?', 'boolean', 'shows_escape_signs', 70),
        (org.id, 'social', 'Já mordeu alguma pessoa?', 'boolean', 'has_bitten_person', 80),
        (org.id, 'social', 'Já foi mordido ou atacado por outro cão?', 'boolean', 'has_been_bitten', 90);

        -- Rotina
        INSERT INTO assessment_questions (org_id, category, question_text, question_type, system_key, order_index) VALUES
        (org.id, 'routine', 'Possui rotina organizada?', 'boolean', 'has_routine', 10),
        (org.id, 'routine', 'Faz passeios regularmente?', 'boolean', 'regular_walks', 20),
        (org.id, 'routine', 'Fica em casa sozinho sem estresse?', 'boolean', 'stays_alone_ok', 30),
        (org.id, 'routine', 'Descreva a rotina diária do cão:', 'text', 'daily_routine_description', 40),
        (org.id, 'routine', 'Possui ansiedade de separação?', 'boolean', 'separation_anxiety', 50),
        (org.id, 'routine', 'Possui algum tipo de fobia (barulhos, chuva, pessoas)?', 'boolean', 'has_phobias', 60),
        (org.id, 'routine', 'Se sim, qual fobia?', 'text', 'phobia_description', 70),
        (org.id, 'routine', 'É possessivo com objetos, brinquedos ou pessoas?', 'boolean', 'possessive_behavior', 80),
        (org.id, 'routine', 'Possui traços de humanização? (tratado como bebê, dorme na cama)', 'boolean', 'humanization_traits', 90),
        (org.id, 'routine', 'Obedece a comandos básicos (senta, fica, vem)?', 'boolean', 'obeys_basic_commands', 100),
        (org.id, 'routine', 'Já foi adestrado por profissional?', 'boolean', 'professionally_trained', 110);

        -- Saúde
        INSERT INTO assessment_questions (org_id, category, question_text, question_type, system_key, order_index) VALUES
        (org.id, 'health', 'É braquicefálico? (focinho achatado)', 'boolean', 'is_brachycephalic', 10),
        (org.id, 'health', 'Tem restrições de convivência por idade ou saúde?', 'boolean', 'age_health_restrictions', 20),
        (org.id, 'health', 'Possui (ou já teve) algum problema de saúde?', 'boolean', 'has_health_issues', 30),
        (org.id, 'health', 'Se sim, qual problema de saúde?', 'text', 'health_issues_description', 40),
        (org.id, 'health', 'Possui restrição alimentar?', 'boolean', 'food_restrictions', 50),
        (org.id, 'health', 'Se sim, qual restrição?', 'text', 'food_restrictions_description', 60),
        (org.id, 'health', 'Possui dermatite ou alergias de pele?', 'boolean', 'has_dermatitis', 70),
        (org.id, 'health', 'Possui restrição de atividade física?', 'boolean', 'activity_restrictions', 80),
        (org.id, 'health', 'Possui problema patelar ou ortopédico?', 'boolean', 'patellar_orthopedic_issues', 90),
        (org.id, 'health', 'Outros problemas de saúde, medicações ou cirurgias:', 'text', 'other_health_notes', 100);

        -- Cuidados Específicos
        INSERT INTO assessment_questions (org_id, category, question_text, question_type, options, system_key, order_index) VALUES
        (org.id, 'care', 'Como o pet reage quando entra em contato com água?', 'select', '["calmo", "nervoso", "adora", "medo", "neutro"]'::jsonb, 'water_reaction', 10);
        
        INSERT INTO assessment_questions (org_id, category, question_text, question_type, system_key, order_index) VALUES
        (org.id, 'care', 'O pet tem autorização para uso da piscina?', 'boolean', 'pool_authorized', 20),
        (org.id, 'care', 'Qual ração ele come?', 'text', 'food_brand', 30);
    END LOOP;
END $$;

-- 8. Data Migration: Migrate existing assessment answers
DO $$
DECLARE
    assessment RECORD;
    q RECORD;
BEGIN
    FOR assessment IN SELECT * FROM pet_assessments LOOP
        -- For each assessment, loop through all questions in this org
        FOR q IN SELECT * FROM assessment_questions WHERE org_id = assessment.org_id LOOP
            IF q.system_key = 'sociable_with_humans' AND assessment.sociable_with_humans IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.sociable_with_humans);
            ELSIF q.system_key = 'sociable_with_dogs' AND assessment.sociable_with_dogs IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.sociable_with_dogs);
            ELSIF q.system_key = 'socialized_early' AND assessment.socialized_early IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.socialized_early);
            ELSIF q.system_key = 'desensitized' AND assessment.desensitized IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.desensitized);
            ELSIF q.system_key = 'is_reactive' AND assessment.is_reactive IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.is_reactive);
            ELSIF q.system_key = 'reactive_description' AND assessment.reactive_description IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_text) VALUES (assessment.pet_id, q.id, assessment.reactive_description);
            ELSIF q.system_key = 'shows_escape_signs' AND assessment.shows_escape_signs IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.shows_escape_signs);
            ELSIF q.system_key = 'has_bitten_person' AND assessment.has_bitten_person IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.has_bitten_person);
            ELSIF q.system_key = 'has_been_bitten' AND assessment.has_been_bitten IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.has_been_bitten);
                
            -- Routine
            ELSIF q.system_key = 'has_routine' AND assessment.has_routine IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.has_routine);
            ELSIF q.system_key = 'regular_walks' AND assessment.regular_walks IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.regular_walks);
            ELSIF q.system_key = 'stays_alone_ok' AND assessment.stays_alone_ok IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.stays_alone_ok);
            ELSIF q.system_key = 'daily_routine_description' AND assessment.daily_routine_description IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_text) VALUES (assessment.pet_id, q.id, assessment.daily_routine_description);
            ELSIF q.system_key = 'separation_anxiety' AND assessment.separation_anxiety IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.separation_anxiety);
            ELSIF q.system_key = 'has_phobias' AND assessment.has_phobias IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.has_phobias);
            ELSIF q.system_key = 'phobia_description' AND assessment.phobia_description IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_text) VALUES (assessment.pet_id, q.id, assessment.phobia_description);
            ELSIF q.system_key = 'possessive_behavior' AND assessment.possessive_behavior IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.possessive_behavior);
            ELSIF q.system_key = 'humanization_traits' AND assessment.humanization_traits IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.humanization_traits);
            ELSIF q.system_key = 'obeys_basic_commands' AND assessment.obeys_basic_commands IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.obeys_basic_commands);
            ELSIF q.system_key = 'professionally_trained' AND assessment.professionally_trained IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.professionally_trained);
                
            -- Health
            ELSIF q.system_key = 'is_brachycephalic' AND assessment.is_brachycephalic IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.is_brachycephalic);
            ELSIF q.system_key = 'age_health_restrictions' AND assessment.age_health_restrictions IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.age_health_restrictions);
            ELSIF q.system_key = 'has_health_issues' AND assessment.has_health_issues IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.has_health_issues);
            ELSIF q.system_key = 'health_issues_description' AND assessment.health_issues_description IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_text) VALUES (assessment.pet_id, q.id, assessment.health_issues_description);
            ELSIF q.system_key = 'food_restrictions' AND assessment.food_restrictions IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.food_restrictions);
            ELSIF q.system_key = 'food_restrictions_description' AND assessment.food_restrictions_description IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_text) VALUES (assessment.pet_id, q.id, assessment.food_restrictions_description);
            ELSIF q.system_key = 'has_dermatitis' AND assessment.has_dermatitis IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.has_dermatitis);
            ELSIF q.system_key = 'activity_restrictions' AND assessment.activity_restrictions IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.activity_restrictions);
            ELSIF q.system_key = 'patellar_orthopedic_issues' AND assessment.patellar_orthopedic_issues IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.patellar_orthopedic_issues);
            ELSIF q.system_key = 'other_health_notes' AND assessment.other_health_notes IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_text) VALUES (assessment.pet_id, q.id, assessment.other_health_notes);
                
            -- Care
            ELSIF q.system_key = 'water_reaction' AND assessment.water_reaction IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_text) VALUES (assessment.pet_id, q.id, assessment.water_reaction);
            ELSIF q.system_key = 'pool_authorized' AND assessment.pool_authorized IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_boolean) VALUES (assessment.pet_id, q.id, assessment.pool_authorized);
            ELSIF q.system_key = 'food_brand' AND assessment.food_brand IS NOT NULL THEN
                INSERT INTO assessment_answers (pet_id, question_id, answer_text) VALUES (assessment.pet_id, q.id, assessment.food_brand);
            END IF;
        END LOOP;
    END LOOP;
END $$;
-- Fix RLS policy for assessment_questions insertion
DROP POLICY IF EXISTS "Staff can manage org assessment questions" ON assessment_questions;

CREATE POLICY "Staff can manage org assessment questions" ON assessment_questions
    USING (org_id IN (
        SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'staff')
    ))
    WITH CHECK (org_id IN (
        SELECT org_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'staff')
    ));
-- Add is_adapted column to public.pets table
-- Defaults to false so that new pets require adaptation explicitly
ALTER TABLE public.pets 
ADD COLUMN IF NOT EXISTS is_adapted BOOLEAN NOT NULL DEFAULT FALSE;

-- Give it a quick comment
COMMENT ON COLUMN public.pets.is_adapted IS 'Indicates if the pet has undergone the presencial adaptation process for Creche/Hotel';
