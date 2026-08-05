-- Backfill package_usage_index for existing package appointments
WITH chronological_appointments AS (
  SELECT 
    id,
    package_credit_id,
    ROW_NUMBER() OVER(PARTITION BY package_credit_id ORDER BY scheduled_at ASC) as calc_index
  FROM public.appointments
  WHERE package_credit_id IS NOT NULL 
    AND status != 'cancelled'
)
UPDATE public.appointments a
SET package_usage_index = ca.calc_index
FROM chronological_appointments ca
WHERE a.id = ca.id
  AND a.package_usage_index IS NULL;
