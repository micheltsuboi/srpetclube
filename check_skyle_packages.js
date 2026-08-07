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
  const { data: pkgs } = await supabase
    .from('customer_packages')
    .select('id, created_at, is_active, pets!inner(name), service_packages(name)')
    .ilike('pets.name', '%Skyle%')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  console.table(pkgs.map(p => ({
    pet: p.pets.name,
    pacote: p.service_packages.name,
    criado_em: p.created_at,
    ativo: p.is_active
  })));
}
run();
