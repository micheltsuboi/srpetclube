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
  const { data: pets } = await supabase.from('pets').select('id, name').ilike('name', '%Cata%');
  console.log('Pets found:', pets.map(p => p.name));
  
  if (pets.length === 0) return;
  const pet = pets[0];

  const { data: pkgs } = await supabase.from('customer_packages').select('id, is_active, service_packages(name)').eq('pet_id', pet.id).eq('is_active', true);
  console.log('Pacotes ativos:', pkgs.map(p => p.service_packages.name));

  if (pkgs.length === 0) return;

  const { data: credits } = await supabase.from('package_credits').select('*').in('customer_package_id', pkgs.map(p => p.id));
  console.table(credits);

  const { data: appts } = await supabase
    .from('appointments')
    .select('id, scheduled_at, status, package_usage_index, package_credit_id')
    .in('package_credit_id', credits.map(c => c.id))
    .order('scheduled_at');

  console.table(appts.map(a => ({
    data: a.scheduled_at,
    status: a.status,
    index: a.package_usage_index,
    credit: a.package_credit_id
  })));
}
run();
