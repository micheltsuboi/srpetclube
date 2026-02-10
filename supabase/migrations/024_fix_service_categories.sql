-- Migration to fix service categories
-- Corrects services that were wrongly assigned to 'Banho e Tosa' default category

-- Update services containing 'Hospedagem' or 'Hotel' in their name
-- to belong to the 'Hospedagem' category
UPDATE services 
SET category_id = (SELECT id FROM service_categories WHERE name = 'Hospedagem')
WHERE (name ILIKE '%hospedagem%' OR name ILIKE '%hotel%');

-- Optional: Update services containing 'Creche' to 'Creche' category just in case
UPDATE services 
SET category_id = (SELECT id FROM service_categories WHERE name = 'Creche')
WHERE (name ILIKE '%creche%' OR name ILIKE '%day care%');
