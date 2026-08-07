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
  const { data, error } = await supabase.rpc('get_enum_values', { enum_name: 'appointment_status' });
  if (error) {
     console.log('Error fetching enum. Let me just query information_schema.');
     const { data: enumData } = await supabase.from('appointments').select('status').limit(1);
     console.log('Exists');
  } else {
     console.log(data);
  }
}
run();
