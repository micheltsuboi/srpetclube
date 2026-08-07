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
  
  const { data: pkgs } = await supabase.from('customer_packages').select('id').eq('pet_id', pet.id);
  const { data: slots } = await supabase
    .from('package_schedule_slots')
    .select('id, slot_date, status, customer_package_id')
    .in('customer_package_id', pkgs.map(p => p.id));
    
  console.log('Total slots for Catarina:', slots.length);
  console.table(slots.filter(s => s.slot_date.startsWith('2026-08')));
}
run();
