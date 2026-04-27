
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envPath = path.resolve('.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('='))
)

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSnow() {
  console.log('Searching for pet "Snow"...')
  const { data: pets, error: petError } = await supabase
    .from('pets')
    .select('id, name')
    .ilike('name', '%Snow%')

  if (petError || !pets || pets.length === 0) {
    console.log('Pet not found')
    return
  }

  const snow = pets[0]
  console.log(`Found pet: ${snow.name} (ID: ${snow.id})`)

  console.log('\nChecking customer packages for Snow...')
  const { data: customerPackages, error: cpError } = await supabase
    .from('customer_packages')
    .select(`
      id,
      package_id,
      service_packages (name),
      is_auto_schedule,
      preferred_weekdays,
      preferred_time
    `)
    .eq('pet_id', snow.id)

  if (cpError) {
    console.error('Error fetching customer packages:', cpError)
    return
  }

  console.table(customerPackages.map(cp => ({
    id: cp.id,
    name: cp.service_packages?.name,
    auto: cp.is_auto_schedule,
    days: cp.preferred_weekdays,
    time: cp.preferred_time
  })))

  console.log('\nChecking package credits for Snow...')
  const { data: credits, error: creditError } = await supabase
    .from('package_credits')
    .select(`
      id,
      customer_package_id,
      service_id,
      total_quantity,
      used_quantity,
      services (name)
    `)
    .in('customer_package_id', customerPackages.map(cp => cp.id))

  if (creditError) {
    console.error('Error fetching credits:', creditError)
  } else {
    console.table(credits.map(c => ({
      pkg_id: c.customer_package_id.slice(0, 8),
      service: c.services?.name,
      total: c.total_quantity,
      used: c.used_quantity
    })))
  }

  console.log('\nChecking all appointments for Snow...')
  const { data: appts, error: apptError } = await supabase
    .from('appointments')
    .select(`
      id, 
      scheduled_at, 
      status, 
      package_credit_id, 
      package_slot_id,
      services (name)
    `)
    .eq('pet_id', snow.id)
    .order('scheduled_at', { ascending: false })

  if (apptError) {
    console.error('Error fetching appointments:', apptError)
  } else {
    console.table(appts.map(a => ({
      id: a.id,
      date: a.scheduled_at,
      status: a.status,
      service: a.services?.name,
      credit: a.package_credit_id,
      slot: a.package_slot_id
    })))
  }

  console.log('\nChecking all package slots for Snow...')
  const { data: slots, error: slotError } = await supabase
    .from('package_schedule_slots')
    .select(`
      id, 
      slot_date, 
      slot_time, 
      status, 
      appointment_id,
      customer_package_id,
      services (name)
    `)
    .in('customer_package_id', customerPackages.map(cp => cp.id))
    .order('slot_date', { ascending: false })

  if (slotError) {
    console.error('Error fetching slots:', slotError)
  } else {
    console.table(slots.map(s => ({
      id: s.id,
      pkg_id: s.customer_package_id.slice(0, 8),
      date: s.slot_date,
      time: s.slot_time,
      status: s.status,
      appt_id: s.appointment_id,
      service: s.services?.name
    })))
  }
}

checkSnow()
