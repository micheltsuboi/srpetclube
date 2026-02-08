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
