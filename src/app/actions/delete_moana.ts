import { createAdminClient } from '../../lib/supabase/admin'

async function findAndDeleteMoanaPackage() {
    const supabase = createAdminClient()
    
    // 1. Find Moana
    const { data: pets, error: petError } = await supabase
        .from('pets')
        .select('id, name')
        .ilike('name', '%Moana%')
        
    if (petError || !pets || pets.length === 0) {
        console.error('Pet Moana não encontrado:', petError?.message || 'Nenhum pet com este nome.')
        return
    }

    if (pets.length > 1) {
        console.log(`Encontrados ${pets.length} pets com o nome similar. Usando o primeiro exato ou o mais provável...`)
    }
    
    const pet = pets.find(p => p.name.toLowerCase() === 'moana') || pets[0]
    console.log(`Pet selecionado: ${pet.name} (${pet.id})`)
    
    // 2. Find packages for this pet
    const { data: packages, error: pkgError } = await supabase
        .from('customer_packages')
        .select('*, service_packages(name)')
        .eq('pet_id', pet.id)
        .order('created_at', { ascending: false })
        
    if (pkgError || !packages || packages.length === 0) {
        console.warn(`Nenhum pacote encontrado para ${pet.name}. Talvez tenha sido deletado manualmente?`)
        return
    }
    
    const latestPkg = packages[0]
    console.log(`Pacote mais recente de ${pet.name}: ${latestPkg.service_packages.name} (ID: ${latestPkg.id}, Criado em: ${latestPkg.created_at})`)
    
    // 3. Find slots AND appointments
    const { data: slots } = await supabase
        .from('package_schedule_slots')
        .select('id, appointment_id')
        .eq('customer_package_id', latestPkg.id)
        
    const appointmentIds = slots?.map(s => s.appointment_id).filter(id => id != null) || []
    
    if (appointmentIds.length > 0) {
        console.log(`Removendo ${appointmentIds.length} agendamentos associados (status 'scheduled')...`)
        const { error: delApptError } = await supabase
            .from('appointments')
            .delete()
            .in('id', appointmentIds)
            .eq('status', 'scheduled') 
            
        if (delApptError) console.error('Erro ao deletar agendamentos:', delApptError.message)
    }
    
    // 4. Delete the package
    console.log(`Deletando pacote ID: ${latestPkg.id}...`)
    const { error: delPkgError } = await supabase
        .from('customer_packages')
        .delete()
        .eq('id', latestPkg.id)
        
    if (delPkgError) {
        console.error('Erro ao deletar pacote:', delPkgError.message)
    } else {
        console.log('Pacote e agendamentos futuros removidos com sucesso!')
    }
}

findAndDeleteMoanaPackage()
