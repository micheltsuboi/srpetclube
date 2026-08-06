-- SQL Script para RECONSTRUIR a agenda futura de pacotes
-- Isso vai iterar sobre todos os pacotes ativos e chamar a função 
-- de geração de slots. Como deletamos os appointments e slots duplicados,
-- ela vai preencher as lacunas recriando os agendamentos originais.

DO $$
DECLARE
  v_cp RECORD;
  v_slots_criados INT;
  v_total_criados INT := 0;
BEGIN
  FOR v_cp IN (
    SELECT id, pet_id FROM public.customer_packages 
    WHERE is_active = true
  ) LOOP
    -- Chama a função para o pacote
    v_slots_criados := public.generate_package_slots(v_cp.id);
    v_total_criados := v_total_criados + v_slots_criados;
  END LOOP;
  
  RAISE NOTICE 'Agenda reconstruída. Total de slots recriados: %', v_total_criados;
END;
$$;
