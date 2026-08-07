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
    .select('id, pet_id, scheduled_at, package_credit_id, pets!inner(name), services(name)')
    .eq('status', 'pending');
    
  console.log('Total pending appointments:', appts.length);
  const byPet = {};
  appts.forEach(a => {
    byPet[a.pets.name] = (byPet[a.pets.name] || 0) + 1;
  });
  console.log('Pending appointments by pet:');
  console.log(Object.entries(byPet).sort((a,b) => b[1] - a[1]).slice(0, 15));
}
run();
