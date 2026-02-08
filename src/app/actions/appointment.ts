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
    const scheduledAt = `${date}T${time}:00-03:00`

    // 3. Create Appointment
    const { error } = await supabase
        .from('appointments')
        .insert({
            org_id: profile.org_id,
            pet_id: petId,
            service_id: serviceId,
            staff_id: staffId || null,
            scheduled_at: scheduledAt,
            notes: notes || null,
            status: 'pending',
            checklist: [] // Initialize empty
        })

    if (error) {
        return { message: `Erro ao agendar: ${error.message}`, success: false }
    }

    revalidatePath('/owner/agenda')
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

export async function updateChecklist(id: string, checklist: any[]) {
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
