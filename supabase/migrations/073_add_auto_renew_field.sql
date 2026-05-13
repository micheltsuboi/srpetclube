
-- Migration: Add auto_renew to customer_packages
-- Adiciona a opção de renovação automática para pacotes de serviço

ALTER TABLE public.customer_packages 
ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.customer_packages.auto_renew IS 'Se verdadeiro, o sistema deve renovar este pacote automaticamente ao chegar na data de expiração.';
