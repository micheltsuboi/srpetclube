-- Migration to add Taxi Dog fields to appointments
-- Allows summing values while keeping discrimination

ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS has_taxi BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS taxi_fee NUMERIC DEFAULT 0.0;

COMMENT ON COLUMN appointments.has_taxi IS 'Indica se o agendamento possui serviço de transporte (Taxi Dog)';
COMMENT ON COLUMN appointments.taxi_fee IS 'Valor cobrado pelo serviço de transporte (Taxi Dog)';
