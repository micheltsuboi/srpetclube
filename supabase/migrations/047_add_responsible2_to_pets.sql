-- Add responsible 2 fields and remove vaccination_up_to_date (optional, but requested to remove from UI)
ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS responsible2_name TEXT;
ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS responsible2_phone TEXT;

-- We won't drop the column vaccination_up_to_date yet to avoid breaking stuff if other parts use it, 
-- but we will remove it from the UI as requested.
