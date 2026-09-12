import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function test() {
    const { data, error } = await supabase
        .from('package_credits')
        .select(`
            id,
            remaining_quantity,
            customer_packages!inner (
                org_id,
                is_active,
                pets!inner (
                    id,
                    name,
                    customers!inner (
                        name,
                        phone_1
                    )
                )
            ),
            services!inner (
                name
            )
        `)
        .limit(1)

    console.log(JSON.stringify({ data, error }, null, 2))
}
test()
