-- Migration: 048_fix_staff_service_permissions.sql
-- Goal: Allow staff with 'servicos' and 'pacotes' permissions to manage their respective modules

-- 1. Helper function to check granular permissions (admin/superadmin always have permission)
-- This respects the JSONB 'permissions' column added for the staff role.
CREATE OR REPLACE FUNCTION public.has_permission(p_permission TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND (
      role IN ('admin', 'superadmin')
      OR (role = 'staff' AND COALESCE(permissions, '[]'::jsonb) ? p_permission)
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Update SERVICES policies
DROP POLICY IF EXISTS "Admin can manage services" ON public.services;
CREATE POLICY "Staff can manage services" ON public.services
  FOR ALL USING (
    public.is_superadmin()
    OR (
      org_id = public.get_my_org_id()
      AND public.has_permission('servicos')
    )
  );

-- 3. Update PRICING_MATRIX policies
DROP POLICY IF EXISTS "Admin can manage pricing" ON public.pricing_matrix;
CREATE POLICY "Staff can manage pricing matrix" ON public.pricing_matrix
  FOR ALL USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = pricing_matrix.service_id
      AND s.org_id = public.get_my_org_id()
      AND public.has_permission('servicos')
    )
  );

-- 4. Update PRICING_RULES policies
DROP POLICY IF EXISTS "Users can manage pricing rules of their org" ON public.pricing_rules;
CREATE POLICY "Staff can manage pricing rules" ON public.pricing_rules
  FOR ALL USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = pricing_rules.service_id
      AND s.org_id = public.get_my_org_id()
      AND public.has_permission('servicos')
    )
  );

-- 5. Update SERVICE_PACKAGES policies
DROP POLICY IF EXISTS "Admin can manage packages" ON public.service_packages;
CREATE POLICY "Staff can manage service packages" ON public.service_packages
  FOR ALL USING (
    public.is_superadmin()
    OR (
      org_id = public.get_my_org_id()
      AND public.has_permission('pacotes')
    )
  );

-- 6. Update PACKAGE_ITEMS policies
DROP POLICY IF EXISTS "Admin can manage package items" ON public.package_items;
CREATE POLICY "Staff can manage package items" ON public.package_items
  FOR ALL USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.service_packages sp
      WHERE sp.id = package_items.package_id
      AND sp.org_id = public.get_my_org_id()
      AND public.has_permission('pacotes')
    )
  );
