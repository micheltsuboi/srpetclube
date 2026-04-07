import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase.from('customer_packages').select('id, calculated_price, total_paid')
  
  if (error) {
      console.error(error)
      return
  }
  
  const zeros = data.filter(p => !p.calculated_price || !p.total_paid)
  console.log("Total packages with 0 or null:", zeros.length)
  if (zeros.length > 0) {
      console.log(zeros.slice(0, 5))
  }
}
run()
