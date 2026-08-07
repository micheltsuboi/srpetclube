const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
let supabaseUrl = '';
let supabaseKey = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supabaseKey = line.split('=')[1].trim().replace(/['"]/g, '');
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: packages, error } = await supabase
    .from('customer_packages')
    .select('id, pet_id, package_id, pets(name), service_packages(name)')
    .eq('is_active', true)
    .not('pet_id', 'is', null);

  if (error) {
    console.error(error);
    return;
  }

  const petPackageCounts = {};

  packages.forEach(pkg => {
    const petName = pkg.pets?.name || 'Desconhecido';
    const pkgName = pkg.service_packages?.name || 'Pacote Desconhecido';
    const key = `${petName} - ${pkgName}`;
    
    if (!petPackageCounts[key]) {
      petPackageCounts[key] = { count: 0, pet: petName, pkg: pkgName, ids: [] };
    }
    petPackageCounts[key].count += 1;
    petPackageCounts[key].ids.push(pkg.id);
  });

  console.log("=== PETS COM PACOTES DUPLICADOS ATIVOS ===");
  let found = false;
  for (const key in petPackageCounts) {
    if (petPackageCounts[key].count > 1) {
      found = true;
      console.log(`- Pet: ${petPackageCounts[key].pet}`);
      console.log(`  Pacote: ${petPackageCounts[key].pkg}`);
      console.log(`  Quantidade de vezes contratado (ativos): ${petPackageCounts[key].count}`);
      console.log('-----------------------------------------');
    }
  }

  if (!found) {
    console.log("Nenhuma duplicação encontrada!");
  }
}

run();
