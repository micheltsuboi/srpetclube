const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
let url = '', key = '';
env.split('\n').forEach(l => {
  if(l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = l.split('=')[1].trim().replace(/['"]/g, '');
  if(l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=')[1].trim().replace(/['"]/g, '');
});
const supabase = createClient(url, key);

async function run() {
  const sql = `
  -- Limpar pacotes duplicados
  DO $$
  DECLARE
    v_keep_cp_id UUID;
    v_row RECORD;
  BEGIN
    FOR v_row IN (
      SELECT pet_id, package_id, COUNT(*) as qtd
      FROM public.customer_packages
      WHERE is_active = true AND pet_id IS NOT NULL
      GROUP BY pet_id, package_id
      HAVING COUNT(*) > 1
    ) LOOP
      
      SELECT id INTO v_keep_cp_id
      FROM public.customer_packages
      WHERE pet_id = v_row.pet_id AND package_id = v_row.package_id AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1;
      
      UPDATE public.customer_packages
      SET is_active = false
      WHERE pet_id = v_row.pet_id 
        AND package_id = v_row.package_id 
        AND id != v_keep_cp_id 
        AND is_active = true;
        
      DELETE FROM public.package_schedule_slots
      WHERE customer_package_id IN (
        SELECT id FROM public.customer_packages
        WHERE pet_id = v_row.pet_id AND package_id = v_row.package_id AND id != v_keep_cp_id
      ) AND status = 'pending';
      
      DELETE FROM public.appointments
      WHERE package_credit_id IN (
        SELECT id FROM public.package_credits
        WHERE customer_package_id IN (
          SELECT id FROM public.customer_packages
          WHERE pet_id = v_row.pet_id AND package_id = v_row.package_id AND id != v_keep_cp_id
        )
      ) AND status = 'pending';
      
    END LOOP;
  END;
  $$;
  `;
  
  // Note: supabase-js doesn't have a direct raw SQL execution endpoint unless we use RPC
  // But we have the sql file already written to disk!
}
run();
