import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: pkgs, error } = await supabase.from('customer_packages').select('id, calculated_price, total_paid, service_packages(total_price)').eq('calculated_price', 0)
  
  if (error) {
      console.error(error)
      return
  }
  
  console.log("Found", pkgs?.length, "packages with 0 calculated price")
  if (pkgs) {
      console.log(pkgs.slice(0, 5))
  }
}
run()
