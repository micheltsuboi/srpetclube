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
  const meioDayUseId = '16244579-e0e6-4da5-a701-114fbbd77386';
  
  const items = [
    { name: 'CRECHE 1X SEMANA MEIO PERIODO', q: 4 },
    { name: 'CRECHE 2X SEMANA MEIO PERIODO', q: 8 },
    { name: 'CRECHE 3X SEMANA MEIO PERIODO', q: 12 },
    { name: 'CRECHE 4X SEMANA MEIO PERIODO', q: 16 },
    { name: 'CRECHE 5X SEMANA MEIO PERIODO', q: 20 }
  ];

  for (const item of items) {
    const { data: pkg } = await supabase.from('service_packages').select('id').eq('name', item.name).single();
    if (pkg) {
      console.log(`Fixing ${item.name} (id: ${pkg.id}) with qty: ${item.q}`);
      // Check if item already exists to avoid duplicates
      const { data: existing } = await supabase.from('package_items').select('id').eq('package_id', pkg.id);
      if (!existing || existing.length === 0) {
        await supabase.from('package_items').insert({
          package_id: pkg.id,
          service_id: meioDayUseId,
          quantity: item.q
        });
        console.log(`Inserted package_items for ${item.name}`);
      } else {
        console.log(`Already has items for ${item.name}`);
      }
    }
  }

  // Delete bogus customer_packages with 0 credits
  const { data: bogus } = await supabase
    .from('customer_packages')
    .select('id, package_credits(id)')
  
  const toDelete = bogus.filter(b => !b.package_credits || b.package_credits.length === 0);
  console.log(`Found ${toDelete.length} bogus customer_packages`);
  for (const b of toDelete) {
    await supabase.from('customer_packages').delete().eq('id', b.id);
    console.log(`Deleted bogus package ${b.id}`);
  }
}
run();
