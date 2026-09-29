-- =========================================================================
-- MIGRATION 077: Permitir exclusão de templates de pacotes (service_packages)
-- Permite que customer_packages.package_id seja NULL com ON DELETE SET NULL,
-- evitando erro 23503 (FK violation) ao excluir modelos de pacotes no sistema.
-- =========================================================================

-- 1. Permitir que package_id em customer_packages seja NULL
ALTER TABLE public.customer_packages 
  ALTER COLUMN package_id DROP NOT NULL;

-- 2. Recriar constraint de chave estrangeira com ON DELETE SET NULL
ALTER TABLE public.customer_packages 
  DROP CONSTRAINT IF EXISTS customer_packages_package_id_fkey;

ALTER TABLE public.customer_packages 
  ADD CONSTRAINT customer_packages_package_id_fkey 
  FOREIGN KEY (package_id) 
  REFERENCES public.service_packages(id) 
  ON DELETE SET NULL;
