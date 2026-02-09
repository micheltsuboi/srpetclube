-- Check if there are any appointments that are falling into 'Hospedagem' category unexpectedly
-- and see if there are pet assessments that are not being linked correctly.

-- 1. Count Hospedagem appointments
SELECT COUNT(*) as hospedagem_count FROM appointments a
JOIN services s ON a.service_id = s.id
JOIN service_categories sc ON s.category_id = sc.id
WHERE sc.name = 'Hospedagem';

-- 2. List Hospedagem appointments details to see why they appear
SELECT a.id, a.scheduled_at, a.check_in_date, a.check_out_date, s.name as service_name, p.name as pet_name
FROM appointments a
JOIN services s ON a.service_id = s.id
JOIN service_categories sc ON s.category_id = sc.id
JOIN pets p ON a.pet_id = p.id
WHERE sc.name = 'Hospedagem'
ORDER BY a.scheduled_at DESC
LIMIT 5;

-- 3. Check assessments
SELECT * FROM pet_assessments LIMIT 5;
