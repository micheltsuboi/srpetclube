-- =====================================================
-- MIGRATION: 062_system_performance_indexes.sql
-- Adiciona índices para otimizar consultas frequentes e reduzir CPU
-- =====================================================

-- Índices para Transações Financeiras (Filtros por data e organização)
CREATE INDEX IF NOT EXISTS idx_financial_transactions_org_date_type 
ON public.financial_transactions(org_id, date DESC, type);

-- Índices para Agendamentos (Melhoria na performance da Agenda)
CREATE INDEX IF NOT EXISTS idx_appointments_org_scheduled 
ON public.appointments(org_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_multiday 
ON public.appointments(check_in_date, check_out_date) 
WHERE check_in_date IS NOT NULL;

-- Índice para Busca de Pets (Ordenação e Filtragem por tutor)
CREATE INDEX IF NOT EXISTS idx_pets_customer_name 
ON public.pets(customer_id, name ASC);

-- Índice para Clientes (Busca por nome/tutor)
CREATE INDEX IF NOT EXISTS idx_customers_org_name 
ON public.customers(org_id, name ASC);

-- Comentários
COMMENT ON INDEX idx_financial_transactions_org_date_type IS 'Otimiza o dashboard financeiro e extratos mensais.';
COMMENT ON INDEX idx_appointments_org_scheduled IS 'Otimiza o carregamento da agenda diária/semanal.';
COMMENT ON INDEX idx_pets_customer_name IS 'Otimiza a listagem e busca de animais.';
