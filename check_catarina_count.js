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
    .select('id, status, package_credit_id')
    .in('package_credit_id', ['717af1b3-6a84-4631-bfd2-30b4a9fc3258', '8192f4c3-9a2a-485f-a37e-3574064a34c7']);

  const counts = { '717': 0, '819': 0 };
  const pending = { '717': 0, '819': 0 };
  
  appts.forEach(a => {
    if (a.package_credit_id === '717af1b3-6a84-4631-bfd2-30b4a9fc3258') {
      counts['717']++;
      if(a.status === 'pending') pending['717']++;
    }
    if (a.package_credit_id === '8192f4c3-9a2a-485f-a37e-3574064a34c7') {
      counts['819']++;
      if(a.status === 'pending') pending['819']++;
    }
  });
  console.log('Total appointments:', counts);
  console.log('Pending appointments:', pending);
}
run();
