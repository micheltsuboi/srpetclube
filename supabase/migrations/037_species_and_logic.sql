-- Migration: Add allowed_species to schedule_blocks
-- Enables blocking time slots for specific species (e.g., Cat Day)

ALTER TABLE public.schedule_blocks
ADD COLUMN IF NOT EXISTS allowed_species TEXT[] DEFAULT NULL;

-- Comment: If allowed_species is NULL/Empty, it blocks EVERYONE (default behavior).
-- If allowed_species has values (e.g. ['cat']), it allows CATS but blocks DOGS.
