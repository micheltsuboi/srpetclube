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
