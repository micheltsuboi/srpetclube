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
  console.log('Fetching inactive packages...');
  const { data: inactivePackages, error: err1 } = await supabase
    .from('customer_packages')
    .select('id')
    .eq('is_active', false);

  if (err1) throw err1;
  const ids = inactivePackages.map(p => p.id);
  
  console.log(`Found ${ids.length} inactive packages. Deleting their pending slots and appointments...`);

  let slotsDeleted = 0;
  let apptsDeleted = 0;

  for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      
      const { data: slots, error: err2 } = await supabase.from('package_schedule_slots')
        .delete()
        .in('customer_package_id', chunk)
        .eq('status', 'pending')
        .select('id');
      
      if (slots) slotsDeleted += slots.length;
        
      const { data: credits } = await supabase.from('package_credits').select('id').in('customer_package_id', chunk);
      if (credits && credits.length > 0) {
        const creditIds = credits.map(c => c.id);
        const { data: appts, error: err3 } = await supabase.from('appointments')
            .delete()
            .in('package_credit_id', creditIds)
            .eq('status', 'pending')
            .select('id');
            
        if (appts) apptsDeleted += appts.length;
      }
  }
  
  console.log(`Cleanup complete! Deleted ${slotsDeleted} slots and ${apptsDeleted} appointments.`);
}
run();
