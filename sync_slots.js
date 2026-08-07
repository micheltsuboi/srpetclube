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
  const { data: appts } = await supabase.from('appointments').select('id, status').eq('status', 'no_show');
  for (const appt of appts) {
    await supabase.from('package_schedule_slots').update({ status: 'no_show' }).eq('appointment_id', appt.id);
  }
  console.log(`Synced ${appts.length} appointments to package_schedule_slots`);
}
run();
