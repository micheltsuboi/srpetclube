-- =====================================================
-- MIGRATION: Fix RLS Recursion and Permissions
-- =====================================================

-- 1. Criar função helper para pegar org_id sem recursão
CREATE OR REPLACE FUNCTION public.get_my_org_id() 
RETURNS UUID AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Corrigir políticas de PROFILES
DROP POLICY IF EXISTS "Users can view org profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can view org profiles" ON public.profiles
  FOR SELECT USING (org_id = public.get_my_org_id());

-- 3. Corrigir políticas de SCHEDULE_BLOCKS
DROP POLICY IF EXISTS "Users can view org blocks" ON public.schedule_blocks;
DROP POLICY IF EXISTS "Staff can manage org blocks" ON public.schedule_blocks;

CREATE POLICY "Users can view org blocks" ON public.schedule_blocks
  FOR SELECT USING (
    org_id = public.get_my_org_id()
  );

CREATE POLICY "Staff can manage org blocks" ON public.schedule_blocks
  FOR ALL USING (
    org_id = public.get_my_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'staff', 'superadmin')
    )
  );
