-- Alter migration 055 to use Array
ALTER TABLE pets DROP COLUMN IF EXISTS vaccine_card_url;
ALTER TABLE pets ADD COLUMN vaccine_card_urls TEXT[] DEFAULT '{}';
