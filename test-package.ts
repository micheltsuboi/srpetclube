import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Or anon if we can't find service role
)

async function test() {
  const { data: pets } = await supabase.from('pets').select('id, name').limit(5)
  for (const pet of pets!) {
    const { data, error } = await supabase.rpc('get_pet_package_summary', { p_pet_id: pet.id })
    if (error) console.log("RPC Error:", error)
    if (data && data.length > 0) {
      console.log(`Pet ${pet.name} (${pet.id}) has packages:`, data)
    }
  }
}

test()
