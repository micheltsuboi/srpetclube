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
  const { data: pets } = await supabase.from('pets').select('id, name').ilike('name', '%Cloe%');
  if (pets.length === 0) return;
  const pet = pets[0];
  
  const { data: pkgs } = await supabase.from('customer_packages')
    .select('id, is_active, created_at, package_id, packages(name)')
    .eq('pet_id', pet.id)
    .eq('is_active', true);
  console.table(pkgs.map(p => ({
    ativo: p.is_active,
    criado_em: p.created_at,
    pkg_nome: p.packages?.name,
    cp_id: p.id
  })));
}
run();
