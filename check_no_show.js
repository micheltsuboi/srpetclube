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
  const { data: pet } = await supabase.from('pets').select('id, org_id').limit(1).single();
  const { data: srv } = await supabase.from('services').select('id').limit(1).single();
  const { data: iData, error: iErr } = await supabase.from('appointments').insert({
    org_id: pet.org_id,
    pet_id: pet.id,
    service_id: srv.id,
    scheduled_at: new Date().toISOString(),
    status: 'no_show'
  }).select('id').single();
  
  if (iErr) {
    console.error("Insertion error:", iErr.message);
  } else {
    console.log("Success inserting 'no_show'");
    await supabase.from('appointments').delete().eq('id', iData.id);
  }
}
run();
