const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function test() {
    try {
        const env = fs.readFileSync('.env.local', 'utf8').split('\n');
        let SUPABASE_URL, SUPABASE_KEY;
        env.forEach(line => {
            if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) SUPABASE_URL = line.split('=')[1].trim();
            if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) SUPABASE_KEY = line.split('=')[1].trim();
        });

        if (!SUPABASE_KEY) {
            env.forEach(line => {
                if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) SUPABASE_KEY = line.split('=')[1].trim();
            });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        const { data: pets, error: petErr } = await supabase.from('pets').select('id, name');
        if (petErr) {
            console.error(petErr);
            return;
        }

        let found = false;
        for (const pet of pets) {
            const { data, error } = await supabase.rpc('get_pet_package_summary', { p_pet_id: pet.id });
            if (error) {
                console.error("RPC Error:", error);
                return;
            }
            if (data && data.length > 0) {
                console.log(`Pet ${pet.name} (${pet.id}) packages:`, JSON.stringify(data, null, 2));
                found = true;
            }
        }

        if (!found) {
            console.log("No packages found for any pet using get_pet_package_summary.");

            // Check customer_packages and package_credits directly
            const { data: cp } = await supabase.from('customer_packages').select('*');
            console.log("Customer Packages count:", cp?.length);
            if (cp?.length) console.log(cp[0]);

            const { data: pc } = await supabase.from('package_credits').select('*');
            console.log("Package Credits count:", pc?.length);
            if (pc?.length) console.log(pc[0]);
        }
    } catch (e) {
        console.error("Script exception:", e);
    }
}

test();
