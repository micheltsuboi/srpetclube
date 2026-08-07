-- Migration: Limpar pacotes duplicados
-- Para cada pet, mantém ativo apenas o pacote mais recente de cada tipo
-- e desativa os mais antigos. Também remove da agenda os agendamentos pendentes gerados pelos pacotes desativados.

DO $$
DECLARE
  v_pet_id UUID;
  v_pkg_id UUID;
  v_keep_cp_id UUID;
  v_row RECORD;
BEGIN
  -- Percorre todos os pares de Pet e Tipo de Pacote que têm mais de 1 pacote ativo
  FOR v_row IN (
    SELECT pet_id, package_id, COUNT(*) as qtd
    FROM public.customer_packages
    WHERE is_active = true AND pet_id IS NOT NULL
    GROUP BY pet_id, package_id
    HAVING COUNT(*) > 1
  ) LOOP
    
    -- Descobre qual é o ID do pacote MAIS RECENTE desse tipo para esse pet
    SELECT id INTO v_keep_cp_id
    FROM public.customer_packages
    WHERE pet_id = v_row.pet_id AND package_id = v_row.package_id AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- 1. Desativa todos os outros pacotes idênticos mais antigos
    UPDATE public.customer_packages
    SET is_active = false
    WHERE pet_id = v_row.pet_id 
      AND package_id = v_row.package_id 
      AND id != v_keep_cp_id 
      AND is_active = true;
      
    -- 2. Apaga os slots e agendamentos pendentes que vieram desses pacotes desativados
    -- Remove os slots da agenda
    DELETE FROM public.package_schedule_slots
    WHERE customer_package_id IN (
      SELECT id FROM public.customer_packages
      WHERE pet_id = v_row.pet_id AND package_id = v_row.package_id AND id != v_keep_cp_id
    ) AND status = 'pending';
    
    -- Remove os appointments (baseado nos créditos dos pacotes desativados)
    DELETE FROM public.appointments
    WHERE package_credit_id IN (
      SELECT id FROM public.package_credits
      WHERE customer_package_id IN (
        SELECT id FROM public.customer_packages
        WHERE pet_id = v_row.pet_id AND package_id = v_row.package_id AND id != v_keep_cp_id
      )
    ) AND status = 'pending';
    
  END LOOP;
END;
$$;
