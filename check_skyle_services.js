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
  const { data: pet } = await supabase.from('pets').select('id, name').ilike('name', '%Skyle%').single();
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, scheduled_at, package_usage_index, service_id, services(name)')
    .eq('pet_id', pet.id)
    .eq('status', 'pending');
    
  console.table(appts.map(a => ({
    data: a.scheduled_at,
    sessao: a.package_usage_index,
    servico: a.services?.name
  })));
}
run();
