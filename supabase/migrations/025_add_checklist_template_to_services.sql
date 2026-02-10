-- Add checklist_template to services table
-- This allows defining a default checklist for each service (e.g., Banho e Tosa steps)

ALTER TABLE services 
ADD COLUMN IF NOT EXISTS checklist_template JSONB DEFAULT '[]'::jsonb;

-- Comment on column
COMMENT ON COLUMN services.checklist_template IS 'Default checklist items for this service (JSON array of strings)';
