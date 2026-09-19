import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data } = await supabase.from('pet_vaccines').select('*').limit(1)
    console.log(JSON.stringify(data, null, 2))
}
run()
