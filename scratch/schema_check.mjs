import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data, error } = await supabase.from('package_credits').select('*, customer_packages(*, pets(*, customers(*))), services(*)').limit(1)
console.log(JSON.stringify(data, null, 2))
console.log(error)
