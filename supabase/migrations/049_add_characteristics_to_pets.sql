-- Add characteristics field to pets
ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS characteristics TEXT;
