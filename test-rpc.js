const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
    try {
        const env = fs.readFileSync('.env.local', 'utf8').split('\n');
        let SUPABASE_URL, SUPABASE_KEY;
        env.forEach(line => {
            if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) SUPABASE_URL = line.split('=')[1].trim();
            if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) SUPABASE_KEY = line.split('=')[1].trim();
        });
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        
        const { data, error } = await supabase.rpc('get_pet_package_summary', {
            p_pet_id: '00000000-0000-0000-0000-000000000000'
        });
        console.log("Data:", data);
        console.log("Error:", error);
    } catch (e) {
        console.log("Exception:", e);
    }
}
run();
