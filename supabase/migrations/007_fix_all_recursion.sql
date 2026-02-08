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
