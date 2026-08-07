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
  const { data: pets } = await supabase.from('pets').select('id, name').ilike('name', '%Cata%');
  if (pets.length === 0) return;
  const pet = pets[0];
  
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, status, scheduled_at, package_usage_index, package_credit_id')
    .eq('pet_id', pet.id)
    .gte('scheduled_at', '2026-08-01T00:00:00Z')
    .order('scheduled_at');

  console.table(appts);
}
run();
