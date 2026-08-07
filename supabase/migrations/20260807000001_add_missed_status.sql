-- Adiciona o status de falta (missed)
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'missed';
