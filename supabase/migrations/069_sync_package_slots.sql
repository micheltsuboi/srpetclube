-- =====================================================
-- MIGRATION 069: Sync Package Slots
-- Sincroniza a data e hora do slot do pacote quando o
-- agendamento correspondente é alterado.
-- =====================================================

CREATE OR REPLACE FUNCTION public.sync_package_slot_on_appointment_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Se for INSERT ou se o scheduled_at mudou no UPDATE
  IF (TG_OP = 'INSERT') OR (OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at) THEN
    -- Sincronizar o slot do pacote se houver um vinculado
    UPDATE public.package_schedule_slots
    SET 
      slot_date = NEW.scheduled_at::DATE,
      slot_time = TO_CHAR(NEW.scheduled_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
      updated_at = now()
    WHERE (id = NEW.package_slot_id AND NEW.package_slot_id IS NOT NULL)
       OR (appointment_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover se já existir para evitar erro
DROP TRIGGER IF EXISTS sync_package_slot_trigger ON public.appointments;

CREATE TRIGGER sync_package_slot_trigger
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.sync_package_slot_on_appointment_update();

-- Comentário para documentação
COMMENT ON FUNCTION public.sync_package_slot_on_appointment_update() IS 'Sincroniza data/hora do slot do pacote quando o agendamento é movido na agenda.';
