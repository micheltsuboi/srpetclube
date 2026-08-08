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
  const { data: pet } = await supabase.from('pets').select('id, name').ilike('name', 'Theo').limit(1).single();
  
  // Find customer_packages for Theo
  const { data: cps } = await supabase.from('customer_packages').select('*').eq('pet_id', pet.id);
  console.log("Theo's packages:", cps.length);
  
  for (const cp of cps) {
    const { data: slots } = await supabase.from('package_schedule_slots').select('*').eq('customer_package_id', cp.id);
    console.log(`Package ${cp.id} has ${slots.length} slots.`);
    if (slots.length > 0) {
      console.log("Sample slot:", slots[0]);
    }
  }
}
run();
