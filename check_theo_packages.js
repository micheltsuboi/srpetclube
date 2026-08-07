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
  const { data: customers } = await supabase.from('customers').select('id, name').ilike('name', '%Michel%');
  if (!customers || customers.length === 0) return console.log("Customer Michel not found");
  
  const { data: pets } = await supabase.from('pets').select('id, name, customer_id').ilike('name', '%Theo%').in('customer_id', customers.map(c => c.id));
  if (!pets || pets.length === 0) return console.log("Pet Theo not found");
  const pet = pets[0];
  console.log("Found Pet:", pet.name, pet.id);
  
  const { data: pkgs } = await supabase.from('customer_packages').select('*').eq('pet_id', pet.id).order('created_at', { ascending: false });
  console.log(`Found ${pkgs?.length || 0} packages for Theo`);
  if (pkgs && pkgs.length > 0) {
      console.log("Latest package:", pkgs[0]);
      
      const { data: credits } = await supabase.from('package_credits').select('*').eq('customer_package_id', pkgs[0].id);
      console.log(`Credits for latest package:`, credits);
      
      const { data: slots } = await supabase.from('package_schedule_slots').select('*').eq('customer_package_id', pkgs[0].id);
      console.log(`Slots for latest package: ${slots?.length || 0}`);
  }
}
run();
