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
  const { data, error } = await supabase.from('appointments').select('id, status').limit(1);
  console.log(data);
  // Try inserting a fake appointment with status missed
  const { data: pet } = await supabase.from('pets').select('id').limit(1).single();
  const { data: iData, error: iErr } = await supabase.from('appointments').insert({
    pet_id: pet.id,
    scheduled_at: new Date().toISOString(),
    status: 'missed'
  });
  if (iErr) {
    console.error("Insertion error:", iErr.message);
  } else {
    console.log("Success inserting 'missed'");
  }
}
run();
