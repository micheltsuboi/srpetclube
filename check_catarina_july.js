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
  const { data: credits } = await supabase.from('package_credits')
    .select('id')
    .eq('customer_package_id', '7aed6063-dc07-4949-943a-03c47761721a');

  const { data: appts } = await supabase
    .from('appointments')
    .select('id, scheduled_at, package_usage_index')
    .in('package_credit_id', credits.map(c => c.id));
    
  console.table(appts);
}
run();
