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
  console.log('Buscando slots fantasmas (status = scheduled MAS sem appointment_id)...');
  const { data: slots, error: err1 } = await supabase
    .from('package_schedule_slots')
    .select('id')
    .eq('status', 'scheduled')
    .is('appointment_id', null);

  if (err1) throw err1;
  
  if (!slots || slots.length === 0) {
      console.log('Nenhum slot fantasma encontrado!');
      return;
  }
  
  console.log(`Encontrados ${slots.length} slots fantasmas. Apagando...`);

  let deletedCount = 0;
  const ids = slots.map(s => s.id);
  
  for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const { data, error } = await supabase.from('package_schedule_slots')
        .delete()
        .in('id', chunk)
        .select('id');
        
      if (error) console.error('Erro ao apagar:', error);
      if (data) deletedCount += data.length;
  }
  
  console.log(`Sucesso! ${deletedCount} slots fantasmas apagados permanentemente.`);
}
run();
