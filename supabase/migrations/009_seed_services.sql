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
