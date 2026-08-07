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
  const { data: pet } = await supabase.from('pets').select('id').ilike('name', 'Catarina').single();
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, status, package_credit_id, package_usage_index, scheduled_at')
    .eq('pet_id', pet.id)
    .not('package_credit_id', 'is', null)
    .order('scheduled_at');

  let maxIndex = 0;
  appts.forEach(a => {
    if (a.package_usage_index > maxIndex) maxIndex = a.package_usage_index;
  });
  console.log('Total appointments for Catarina with a package:', appts.length);
  console.log('Max package_usage_index:', maxIndex);

  const { data: activePkgs } = await supabase.from('customer_packages').select('id, created_at, is_active').eq('pet_id', pet.id).eq('is_active', true);
  console.log('Active packages:', activePkgs.length);
}
run();
