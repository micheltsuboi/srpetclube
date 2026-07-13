-- Migration to add Services Extras fields to appointments
-- Allows tracking manual extra services and their values on individual appointments

ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS has_extras BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS extras_fee NUMERIC DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.appointments.has_extras IS 'Indica se o agendamento possui serviços extras adicionados na hora';
COMMENT ON COLUMN public.appointments.extras_fee IS 'Valor total dos serviços extras cobrados';
COMMENT ON COLUMN public.appointments.extras IS 'Lista de serviços extras cadastrados na hora contendo nome e preço';
