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
  console.log('Buscando pacotes ativos...');
  const { data: activePackages, error: err1 } = await supabase
    .from('customer_packages')
    .select('id, pet_id, package_id, created_at')
    .eq('is_active', true)
    .not('pet_id', 'is', null);

  if (err1) throw err1;

  const groups = {};
  for (const pkg of activePackages) {
    const key = `${pkg.pet_id}_${pkg.package_id}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(pkg);
  }

  const idsToDeactivate = [];
  for (const key in groups) {
    if (groups[key].length > 1) {
      groups[key].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      for (let i = 1; i < groups[key].length; i++) {
        idsToDeactivate.push(groups[key][i].id);
      }
    }
  }

  if (idsToDeactivate.length === 0) {
    console.log('Nenhum pacote duplicado encontrado.');
    return;
  }
  
  console.log(`Encontrados ${idsToDeactivate.length} pacotes duplicados. Desativando...`);
  
  // Limitar em chunks de 50 para não quebrar a query IN()
  for (let i = 0; i < idsToDeactivate.length; i += 50) {
      const chunk = idsToDeactivate.slice(i, i + 50);
      
      await supabase.from('customer_packages').update({ is_active: false }).in('id', chunk);
      
      const { data: deletedSlots, error: err2 } = await supabase.from('package_schedule_slots')
        .delete()
        .in('customer_package_id', chunk)
        .eq('status', 'pending');
        
      const { data: credits } = await supabase.from('package_credits').select('id').in('customer_package_id', chunk);
      
      if (credits && credits.length > 0) {
        const creditIds = credits.map(c => c.id);
        const { data: deletedAppts, error: err3 } = await supabase.from('appointments')
            .delete()
            .in('package_credit_id', creditIds)
            .eq('status', 'pending');
      }
  }
  
  console.log('Limpeza finalizada com sucesso!');
}
run();
