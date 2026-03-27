import { createAdminClient } from '@/lib/supabase/admin'

export async function fixAryaHistoricalData() {
  const supabase = createAdminClient()
  console.log('Searching for Arya...')
  
  const { data: pets, error: petError } = await supabase
    .from('pets')
    .select('id, name')
    .ilike('name', 'Arya')

  if (petError || !pets || pets.length === 0) {
    return { success: false, message: 'Pet Arya not found' }
  }

  const petId = pets[0].id
  const dateStr = '2026-03-20'
  
  // Search for appointment on March 20th
  const { data: appointments, error: apptError } = await supabase
    .from('appointments')
    .select('id, scheduled_at, status')
    .eq('pet_id', petId)
    .gte('scheduled_at', `${dateStr}T00:00:00`)
    .lte('scheduled_at', `${dateStr}T23:59:59`)

  if (apptError || !appointments || appointments.length === 0) {
    return { success: false, message: `No appointment found for Arya on ${dateStr}` }
  }

  const results = []
  for (const appt of appointments) {
    // Call the RPC
    const { error: rpcError } = await supabase.rpc('complete_package_slot', {
      p_appointment_id: appt.id
    })

    if (rpcError) {
      results.push({ id: appt.id, success: false, error: rpcError.message })
    } else {
      results.push({ id: appt.id, success: true })
    }
  }

  return { success: true, results }
}
