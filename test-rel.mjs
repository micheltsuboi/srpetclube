import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase.from('appointments').select(`
      id,
      package_slot_id,
      package_schedule_slots!package_slot_id (
          customer_package_id,
          customer_packages (
              calculated_price, total_paid
          )
      )
  `).not('package_slot_id', 'is', null).limit(1)
  
  if (error) {
      console.error(error)
      return
  }
  
  console.log(JSON.stringify(data, null, 2))
}
run()
