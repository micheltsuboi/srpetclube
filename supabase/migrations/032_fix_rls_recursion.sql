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
