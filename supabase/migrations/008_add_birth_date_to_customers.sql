-- Adicionar data de nascimento na tabela customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birth_date DATE;
