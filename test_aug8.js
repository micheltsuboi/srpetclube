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
  const { data: appts } = await supabase.from('appointments').select('id, status, scheduled_at, pets(name)').gte('scheduled_at', '2026-08-08T00:00:00.000Z').lte('scheduled_at', '2026-08-08T23:59:59.999Z');
  console.log("Appointments on Aug 8:", appts);
}
run();
