-- Create migration 055_add_vaccine_card_to_pets
ALTER TABLE pets ADD COLUMN IF NOT EXISTS vaccine_card_url TEXT;
