'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface CreateAppointmentState {
    message: string
    success: boolean
}

export async function createAppointment(prevState: CreateAppointmentState, formData: FormData) {
    const supabase = await createClient()

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

    if (!profile?.org_id) return { message: 'Organização não encontrada.', success: false }

    // 2. Extract Data
    const petId = formData.get('petId') as string
    const serviceId = formData.get('serviceId') as string
    const date = formData.get('date') as string
    const time = formData.get('time') as string
    const notes = formData.get('notes') as string
    const staffId = formData.get('staffId') as string // Optional

    if (!petId || !serviceId || !date || !time) {
        return { message: 'Preencha todos os campos obrigatórios.', success: false }
    }

    // specific service checklist logic could be applied here if we want default checklist
    // For now, default is empty array []

    // Hardcoded Brazil Offset for MVP efficiency
    // Converting to UTC ISO string to ensure Postgres compatibility
    let scheduledAt: string
    try {
        scheduledAt = new Date(`${date}T${time}:00-03:00`).toISOString()
    } catch (_) { // unused e
        return { message: 'Data ou hora inválida.', success: false }
    }

    // Check Conflicts with Blocks
    const { data: sData } = await supabase
        .from('services')
        .select('duration_minutes')
        .eq('id', serviceId)
        .maybeSingle()

    const duration = sData?.duration_minutes || 60
    const startDt = new Date(scheduledAt)
    const endDt = new Date(startDt.getTime() + duration * 60000)
    const endAt = endDt.toISOString()

    const { data: conflictBlocks } = await supabase
        .from('schedule_blocks')
        .select('id')
        .eq('org_id', profile.org_id)
        .lt('start_at', endAt)
        .gt('end_at', scheduledAt)

    if (conflictBlocks && conflictBlocks.length > 0) {
        return { message: 'Este horário está bloqueado na agenda.', success: false }
    }

    // Get customer_id from the Pet
    const { data: petData, error: petError } = await supabase
        .from('pets')
        .select('customer_id')
        .eq('id', petId)
        .single()

    if (petError || !petData) {
        return { message: 'Pet não encontrado ou erro ao buscar dados do tutor.', success: false }
    }

    // **NOVO**: Verificar se há créditos de pacote disponíveis para este serviço
    let packageCreditId: string | null = null
    const { data: creditData } = await supabase.rpc('use_package_credit_for_pet', {
        p_pet_id: petId,
        p_service_id: serviceId
    })

    if (creditData) {
        packageCreditId = creditData
    }

    // 3. Create Appointment
    const { error } = await supabase
        .from('appointments')
        .insert({
            org_id: profile.org_id,
            pet_id: petId,
            service_id: serviceId,
            customer_id: petData.customer_id, // Important relation!
            staff_id: staffId || null,
            scheduled_at: scheduledAt,
            notes: notes || null,
            status: 'pending',
            package_credit_id: packageCreditId, // Vincula ao crédito do pacote se usado
            checklist: [] // Initialize empty
        })

    if (error) {
        return { message: `Erro ao agendar: ${error.message}`, success: false }
    }

    revalidatePath('/owner/agenda')
    revalidatePath('/owner/pets')
    return { message: 'Agendamento criado com sucesso!', success: true }
}

export async function updateAppointmentStatus(id: string, status: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase
        .from('appointments')
        .update({ status })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/agenda')
    return { message: 'Status atualizado.', success: true }
}

export async function updateChecklist(id: string, checklist: { label: string, checked: boolean }[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    // Check if appointment is finished? Maybe
    // Just update JSONB
    const { error } = await supabase
        .from('appointments')
        .update({ checklist })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/agenda')
    return { message: 'Checklist salvo.', success: true }
}

export async function seedServices() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) return { message: 'Erro na organização.', success: false }

    const services = [
        { name: 'Banho', base_price: 45.00, category: 'banho', duration_minutes: 60 },
        { name: 'Tosa Higiênica', base_price: 30.00, category: 'tosa', duration_minutes: 30 },
        { name: 'Banho e Tosa', base_price: 80.00, category: 'banho_tosa', duration_minutes: 90 },
        { name: 'Hidratação', base_price: 25.00, category: 'outro', duration_minutes: 30 }
    ]

    for (const service of services) {
        const { count } = await supabase
            .from('services')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', profile.org_id)
            .eq('name', service.name)

        if (count === 0) {
            await supabase.from('services').insert({ ...service, org_id: profile.org_id })
        }
    }

    revalidatePath('/owner/agenda')
    return { message: 'Serviços cadastrados!', success: true }
}

export async function deleteAppointment(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    // **NOVO**: Buscar se o agendamento usou crédito de pacote
    const { data: appointment } = await supabase
        .from('appointments')
        .select('package_credit_id')
        .eq('id', id)
        .single()

    // Se usou crédito, devolver antes de deletar
    if (appointment?.package_credit_id) {
        await supabase.rpc('return_package_credit', {
            p_credit_id: appointment.package_credit_id
        })
    }

    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/agenda')
    revalidatePath('/owner/pets')
    return { message: 'Agendamento excluído.', success: true }
}

export async function updateAppointment(prevState: CreateAppointmentState, formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const id = formData.get('id') as string
    const date = formData.get('date') as string
    const time = formData.get('time') as string
    const serviceId = formData.get('serviceId') as string
    const notes = formData.get('notes') as string

    if (!id || !date || !time || !serviceId) {
        return { message: 'Dados incompletos.', success: false }
    }

    let scheduledAt: string
    try {
        scheduledAt = new Date(`${date}T${time}:00-03:00`).toISOString()
    } catch (_) {
        return { message: 'Data inválida.', success: false }
    }

    const { error } = await supabase
        .from('appointments')
        .update({
            service_id: serviceId,
            scheduled_at: scheduledAt,
            notes: notes || null
        })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/agenda')
    return { message: 'Agendamento atualizado!', success: true }
}

export async function updatePetPreferences(petId: string, prefs: { perfume_allowed?: boolean, accessories_allowed?: boolean }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase
        .from('pets')
        .update(prefs)
        .eq('id', petId)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/agenda')
    return { message: 'Preferências atualizadas.', success: true }
}
