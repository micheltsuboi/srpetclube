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
  const { data: slots } = await supabase.from('package_schedule_slots').select('*').eq('customer_package_id', '6323695c-637a-47cf-a986-a85174a297c1');
  console.log(`Michel's Theo's slots: ${slots.length}`);
  console.log(slots);
}
run();
