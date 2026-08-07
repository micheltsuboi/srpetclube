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
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, pet_id, status, scheduled_at, package_usage_index, pets(name)')
    .eq('package_usage_index', 13);
    
  console.table(appts.map(a => ({
    id: a.id,
    pet: a.pets?.name,
    status: a.status,
    data: a.scheduled_at
  })));
}
run();
