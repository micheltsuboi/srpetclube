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
  const { data: slots } = await supabase
    .from('package_schedule_slots')
    .select('id, appointment_id')
    .eq('status', 'scheduled');
    
  const withAppt = slots.filter(s => s.appointment_id);
  const withoutAppt = slots.filter(s => !s.appointment_id);
  console.log(`Slots scheduled COM appointment_id: ${withAppt.length}`);
  console.log(`Slots scheduled SEM appointment_id: ${withoutAppt.length}`);
}
run();
