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
  // Pega todos os agendamentos pendentes
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, pet_id, scheduled_at, package_credit_id')
    .eq('status', 'pending');

  const groups = {};
  for (const a of appts) {
    if (!a.package_credit_id) continue;
    // Agrupa por pet, credito e data (sem horas)
    const dateStr = new Date(a.scheduled_at).toISOString().split('T')[0];
    const key = `${a.pet_id}_${a.package_credit_id}_${dateStr}`;
    
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  }

  const toDelete = [];
  for (const key in groups) {
    if (groups[key].length > 1) {
      // Ordena por ID ou data pra manter 1
      groups[key].sort((x, y) => x.id.localeCompare(y.id));
      for (let i = 1; i < groups[key].length; i++) {
        toDelete.push(groups[key][i].id);
      }
    }
  }

  if (toDelete.length === 0) {
    console.log('Nenhuma duplicação de MESMO DIA E PACOTE encontrada.');
    return;
  }
  
  console.log(`Encontrados ${toDelete.length} duplicados exatos. Apagando...`);
  for (let i = 0; i < toDelete.length; i += 50) {
      const chunk = toDelete.slice(i, i + 50);
      await supabase.from('appointments').delete().in('id', chunk);
  }
  console.log('Limpeza de duplicações finalizada!');
}
run();
