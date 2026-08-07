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
  const apptId = '115aeb3c-9787-490a-b05e-556ac6c21873';
  const { data, error } = await supabase.from('appointments').update({ status: 'no_show' }).eq('id', apptId).select();
  
  if (error) {
    console.error("Update error:", error);
  } else {
    console.log("Success updating no_show:", data);
    // revert
    await supabase.from('appointments').update({ status: 'pending' }).eq('id', apptId);
  }
}
run();
