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
  const apptId = '1bff3d18-103a-4fdf-83f7-78e83c61c694';
  const { data, error } = await supabase.from('appointments').update({ status: 'no_show' }).eq('id', apptId).select();
  
  if (error) {
    console.error("Update error:", error);
  } else {
    console.log("Success updating no_show for Theo:", data);
  }
}
run();
