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
  if (pets.length === 0) return;
  const pet = pets[0];
  console.log('Pet:', pet.name);

  const { data: pkgs } = await supabase.from('customer_packages').select('id, is_active, created_at, package_id').eq('pet_id', pet.id);
  
  console.table(pkgs.map(p => ({
    ativo: p.is_active,
    criado_em: p.created_at,
    pkg_id: p.package_id,
    cp_id: p.id
  })));

  const { data: credits } = await supabase.from('package_credits').select('id').in('customer_package_id', pkgs.map(p => p.id));

  const { data: appts } = await supabase
    .from('appointments')
    .select('id, status, scheduled_at, package_credit_id')
    .in('package_credit_id', credits.map(c => c.id))
    .order('scheduled_at');

  let totalDone = 0;
  let totalPending = 0;
  let totalCancelled = 0;
  appts.forEach(a => {
    if(a.status === 'pending') totalPending++;
    if(a.status === 'done' || a.status === 'completed' || a.status === 'checked_out') totalDone++;
    if(a.status === 'cancelled') totalCancelled++;
  });
  console.log(`Total Done: ${totalDone}, Total Pending: ${totalPending}, Total Cancelled: ${totalCancelled}`);
}
run();
