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
  const { data: pkg } = await supabase.from('service_packages').select('id, name, package_items(id, service_id, quantity)').eq('id', 'dd1c517a-f8a9-491e-a6b5-0c656f9ec41e').single();
  console.log("Package:", JSON.stringify(pkg, null, 2));
}
run();
