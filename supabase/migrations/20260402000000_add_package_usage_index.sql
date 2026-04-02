-- Add package_usage_index column to appointments
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS package_usage_index INTEGER;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_appointments_package_usage_index ON public.appointments(package_usage_index);
CREATE INDEX IF NOT EXISTS idx_appointments_package_credit_id ON public.appointments(package_credit_id);
