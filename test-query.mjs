import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: appts, error } = await supabase
      .from('appointments')
      .select(`
          id, pet_id, package_credit_id, package_slot_id, package_usage_index,
          package_credits:package_credit_id (
              total_quantity,
              used_quantity,
              customer_packages (
                  calculated_price,
                  total_paid,
                  payment_status,
                  payment_method,
                  purchased_at
              )
          )
      `)
      .not('package_credit_id', 'is', null)
      .limit(5)
  
  if (error) {
      console.error(error)
      return
  }
  
  console.log(JSON.stringify(appts, null, 2))
}
run()
