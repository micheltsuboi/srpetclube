-- Add scheduling_rules to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS scheduling_rules JSONB DEFAULT '[]'::jsonb;
