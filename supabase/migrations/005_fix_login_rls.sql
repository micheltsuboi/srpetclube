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
