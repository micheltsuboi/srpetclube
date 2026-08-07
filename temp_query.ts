import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function run() {
  const { data: pet } = await supabase.from('pets').select('id, name').ilike('name', '%Skyle%').single()
  if (!pet) { console.log('Pet not found'); return }
  
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, scheduled_at, package_usage_index, status')
    .eq('pet_id', pet.id)
    .order('scheduled_at')

  console.table(appts)
}
run()
