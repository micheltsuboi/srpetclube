require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching appointments with package_credit_id but no usage_index...");
  const { data: appts, error } = await supabase
    .from('appointments')
    .select('id, package_credit_id, scheduled_at, status')
    .not('package_credit_id', 'is', null)
    .is('package_usage_index', null)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${appts.length} appointments to backfill.`);

  // Group by package_credit_id
  const byCredit = {};
  for (const a of appts) {
    if (!byCredit[a.package_credit_id]) {
      byCredit[a.package_credit_id] = [];
    }
    byCredit[a.package_credit_id].push(a);
  }

  let updated = 0;
  for (const [creditId, sessions] of Object.entries(byCredit)) {
    // We need to know how many sessions already HAVE an index to start from there.
    const { data: existing, error: e2 } = await supabase
      .from('appointments')
      .select('package_usage_index')
      .eq('package_credit_id', creditId)
      .not('package_usage_index', 'is', null)
      .neq('status', 'cancelled')
      .order('package_usage_index', { ascending: false })
      .limit(1);
    
    let startingIndex = existing && existing.length > 0 ? existing[0].package_usage_index + 1 : 1;

    for (const session of sessions) {
      console.log(`Updating ${session.id} to index ${startingIndex}`);
      await supabase
        .from('appointments')
        .update({ package_usage_index: startingIndex })
        .eq('id', session.id);
      
      startingIndex++;
      updated++;
    }
  }

  console.log(`Done. Updated ${updated} appointments.`);
}

run();
