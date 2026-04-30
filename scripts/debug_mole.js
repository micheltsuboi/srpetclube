const { createClient } = require('@supabase/supabase-js');

async function debugMole() {
    const supabaseUrl = process.argv[2];
    const supabaseKey = process.argv[3]; 

    if (!supabaseUrl || !supabaseKey) {
        console.error('Supabase URL or Key missing. Pass as arguments.');
        process.exit(1);
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('--- DEBUG PET MÓLE ---');

    // 1. Get Pet "Móle"
    const { data: pets, error: pErr } = await supabase
        .from('pets')
        .select('*')
        .ilike('name', '%Móle%');
    
    if (pErr) console.error('Error fetching pets:', pErr);
    if (!pets || pets.length === 0) { console.log('No Móle found'); return; }
    
    for (const pet of pets) {
        console.log(`\n===========================================`);
        console.log(`PET: ${pet.name} (ID: ${pet.id})`);
        console.log(`===========================================`);
        
        // 2. Get Customer Packages
        const { data: pkgs, error: pkgErr } = await supabase
            .from('customer_packages')
            .select('*, service_packages(name)')
            .eq('pet_id', pet.id)
            .order('purchased_at', { ascending: false });
            
        if (pkgErr) console.error('Error fetching packages:', pkgErr);
        
        for (const pkg of pkgs || []) {
            console.log(`\n📦 PACKAGE: ${pkg.service_packages?.name} (ID: ${pkg.id})`);
            console.log(`   Purchased: ${pkg.purchased_at} | Expires: ${pkg.expires_at} | Active: ${pkg.is_active}`);
            
            // 3. Get Credits
            const { data: credits, error: credErr } = await supabase
                .from('package_credits')
                .select('*, services(name)')
                .eq('customer_package_id', pkg.id);
                
            if (credErr) console.error('Error fetching credits:', credErr);
            
            console.log(`   --- CREDITS ---`);
            for (const credit of credits || []) {
                console.log(`   * ${credit.services?.name}: Total: ${credit.total_quantity} | Used: ${credit.used_quantity} | Remaining: ${credit.remaining_quantity} (Credit ID: ${credit.id})`);
                
                // 4. Get Appointments for this credit
                const { data: appts, error: apptErr } = await supabase
                    .from('appointments')
                    .select('id, scheduled_at, status, package_usage_index, package_slot_id')
                    .eq('package_credit_id', credit.id)
                    .order('scheduled_at', { ascending: true });
                    
                if (apptErr) console.error('Error fetching appts:', apptErr);
                
                console.log(`     -> APPOINTMENTS:`);
                for (const appt of appts || []) {
                    console.log(`        [${appt.status}] Scheduled: ${appt.scheduled_at} | Index: ${appt.package_usage_index} | Slot ID: ${appt.package_slot_id} | Appt ID: ${appt.id}`);
                }
            }
            
            // 5. Get Slots
            const { data: slots, error: slotErr } = await supabase
                .from('package_schedule_slots')
                .select('*')
                .eq('customer_package_id', pkg.id)
                .order('slot_date', { ascending: true });
                
            if (slotErr) console.error('Error fetching slots:', slotErr);
            
            console.log(`   --- SLOTS ---`);
            for (const slot of slots || []) {
                console.log(`   * [${slot.status}] Date: ${slot.slot_date} ${slot.slot_time} | Appt ID: ${slot.appointment_id} | Slot ID: ${slot.id}`);
            }
        }
    }
}

debugMole();
