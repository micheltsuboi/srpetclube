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
    .select('id, pet_id, scheduled_at, service_id, status')
    .eq('status', 'pending');

  const groups = {};
  for (const a of appts) {
    if (!a.service_id) continue;
    const dateStr = new Date(a.scheduled_at).toISOString().split('T')[0];
    const key = `${a.pet_id}_${a.service_id}_${dateStr}`;
    
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  }

  const toDelete = [];
  for (const key in groups) {
    if (groups[key].length > 1) {
      groups[key].sort((x, y) => x.id.localeCompare(y.id));
      for (let i = 1; i < groups[key].length; i++) {
        toDelete.push(groups[key][i].id);
      }
    }
  }

  if (toDelete.length === 0) {
    console.log('Nenhuma duplicação do MESMO SERVIÇO NO MESMO DIA encontrada.');
    return;
  }
  
  console.log(`Encontrados ${toDelete.length} serviços agendados no mesmo dia para o mesmo pet! Apagando as duplicações...`);
  
  let deletedCount = 0;
  for (let i = 0; i < toDelete.length; i += 50) {
      const chunk = toDelete.slice(i, i + 50);
      const { data, error } = await supabase.from('appointments').delete().in('id', chunk).select('id');
      if (error) console.error('Erro ao deletar:', error);
      if (data) deletedCount += data.length;
  }
  console.log(`Sucesso! ${deletedCount} agendamentos duplicados apagados do Banho e Tosa.`);
}
run();
