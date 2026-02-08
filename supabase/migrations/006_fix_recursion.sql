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
