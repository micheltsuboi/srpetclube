import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: pkgs, error } = await supabase.from('customer_packages').select('id, calculated_price, total_paid, discount_percent')
  
  if (error) {
      console.error(error)
      return
  }
  
  let fixed = 0
  if (pkgs) {
      for (const p of pkgs) {
          // If total_paid is 0 but calculated_price is > 0, and there was no discount, total_paid is likely incorrect old data.
          // Wait, if discount_percent > 0, total_paid shouldn't necessarily be 0. It should be calculated_price * (1 - discount_percent/100).
          // But if it is 0 right now, let's fix it.
          if ((p.total_paid === 0 || p.total_paid === null) && p.calculated_price > 0 && p.calculated_price !== p.total_paid) {
              const expectedTotal = p.calculated_price * (1 - (p.discount_percent || 0) / 100);
              console.log(`Fixing total_paid for ${p.id}: ${p.total_paid} -> ${expectedTotal}`)
              await supabase.from('customer_packages').update({ total_paid: expectedTotal }).eq('id', p.id)
              fixed++
          }
      }
  }
  console.log(`Fixed total_paid on ${fixed} packages`)
}
run()
