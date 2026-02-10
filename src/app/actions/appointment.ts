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

    // Hospedagem Specifics
    const checkInDate = formData.get('checkInDate') as string
    const checkOutDate = formData.get('checkOutDate') as string

    if (!petId || !serviceId) {
        return { message: 'Preencha todos os campos obrigatórios.', success: false }
    }

    // validate date/time only if NOT Hospedagem or if single day
    if ((!date || !time) && (!checkInDate || !checkOutDate)) {
        return { message: 'Selecione a data ou período.', success: false }
    }

    // Get Service & Category
    const { data: serviceData } = await supabase
        .from('services')
        .select(`
            id, 
            duration_minutes, 
            base_price,
            category_id,
            checklist_template,
            service_categories (id, name)
        `)
        .eq('id', serviceId)
        .single()

    console.log('[CreateAppointment] Service Data:', serviceData)

    if (!serviceData) return { message: 'Serviço não encontrado.', success: false }

    // Force cast to any to avoid complex typing for joined relation for now
    const serviceAny = serviceData as any
    const categoryName = serviceAny.service_categories?.name
    const isCreche = categoryName === 'Creche'
    const isHospedagem = categoryName === 'Hospedagem'

    // Validate Assessment for Creche/Hospedagem
    if (isCreche || isHospedagem) {
        const { data: assessment } = await supabase
            .from('pet_assessments')
            .select('status')
            .eq('pet_id', petId)
            .single()

        if (!assessment || assessment.status !== 'approved') {
            return { message: `Este pet precisa de uma avaliação aprovada para ${categoryName}.`, success: false }
        }
    }

    // Prepare Date Range / Scheduled At
    let scheduledAt: string
    let checkIn: string | null = null
    let checkOut: string | null = null

    if (isHospedagem && checkInDate && checkOutDate) {
        // Hospedagem Logic
        checkIn = checkInDate
        checkOut = checkOutDate
        // Scheduled at mostly for sorting, set to Check-in at 12:00
        scheduledAt = new Date(`${checkInDate}T12:00:00-03:00`).toISOString()
    } else {
        // Standard / Creche Logic
        try {
            scheduledAt = new Date(`${date}T${time}:00-03:00`).toISOString()
        } catch (_) { // unused e
            return { message: 'Data ou hora inválida.', success: false }
        }
    }

    // Check Conflicts (Skip for Hospedagem for now, or implement room logic later)
    if (!isHospedagem) {
        const duration = serviceData.duration_minutes || 60
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
    }

    // Get customer_id from the Pet
    const { data: petData, error: petError } = await supabase
        .from('pets')
        .select('customer_id, weight_kg')
        .eq('id', petId)
        .single()

    if (petError || !petData) {
        return { message: 'Pet não encontrado ou erro ao buscar dados do tutor.', success: false }
    }

    // Verify Credits
    let packageCreditId: string | null = null
    const { data: creditData } = await supabase.rpc('use_package_credit_for_pet', {
        p_pet_id: petId,
        p_service_id: serviceId
    })

    if (creditData) {
        packageCreditId = creditData
    }

    // Pricing Calculation Logic
    let calculatedPrice = (serviceData as any).base_price

    // Use weight_kg from petData
    const weight = (petData as any).weight_kg ?? (petData as any).weight

    if (weight !== null && weight !== undefined) {
        const { data: rules, error: rErr } = await supabase
            .from('pricing_matrix')
            .select('*')
            .eq('service_id', serviceId)
            .eq('is_active', true)
            .lte('weight_min', weight)
            .gte('weight_max', weight)
            .order('fixed_price', { ascending: false }) // Initial sort

        if (rules && rules.length > 0) {
            // Find the most specific rule (smallest range)
            const specificRule = rules.sort((a, b) => {
                const rangeA = a.max_weight - a.min_weight
                const rangeB = b.max_weight - b.min_weight
                return rangeA - rangeB
            })[0]

            calculatedPrice = specificRule.fixed_price
            console.log('[CreateAppointment] Selected Specific Rule:', specificRule)
        }
    }

    // Hospedagem Daily Rate Calculation
    let days = 1
    if (isHospedagem && checkIn && checkOut) {
        const start = new Date(checkIn)
        const end = new Date(checkOut)
        // Set to noon to avoid timezone issues
        start.setHours(12, 0, 0, 0)
        end.setHours(12, 0, 0, 0)

        const diffTime = Math.abs(end.getTime() - start.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        days = diffDays > 0 ? diffDays : 1

        console.log('[CreateAppointment] Hospedagem Pricing:', {
            initialPrice: calculatedPrice,
            days: days,
            totalBefore: calculatedPrice * days
        })

        calculatedPrice = calculatedPrice * days
    }

    const finalChecklist = (serviceAny.checklist_template || []).map((item: string) => ({
        text: item,
        completed: false,
        completed_at: null
    }))

    console.log('[CreateAppointment] Final Checklist:', finalChecklist)

    // 3. Create Appointment
    const { error } = await supabase
        .from('appointments')
        .insert({
            org_id: profile.org_id,
            pet_id: petId,
            service_id: serviceId,
            service_category_id: serviceAny.category_id,
            customer_id: petData.customer_id,
            staff_id: staffId || null,
            scheduled_at: scheduledAt,
            notes: notes || null,
            status: 'pending',
            package_credit_id: packageCreditId,
            checklist: finalChecklist,
            check_in_date: checkIn,
            check_out_date: checkOut,
            calculated_price: calculatedPrice
        })

    if (error) {
        return { message: `Erro ao agendar: ${error.message}`, success: false }
    }

    revalidatePath('/owner/agenda')
    revalidatePath('/owner/pets')
    revalidatePath('/owner/creche') // Revalidate new dashboards
    revalidatePath('/owner/hospedagem')
    revalidatePath('/owner/hospedagem')

    let debugMsg = `Agendamento criado! total: R$ ${calculatedPrice}`
    if (isHospedagem) {
        // Safe access (though logic implies it's set)
        const daysDebug = (calculatedPrice && (serviceData as any).base_price) ? Math.round(calculatedPrice / ((calculatedPrice / (days || 1)))) : days
        debugMsg = `Agendamento criado!
        Preço Final: R$ ${calculatedPrice}
        Dias Calculados: ${days}
        (Valor Diária usado: R$ ${calculatedPrice / (days || 1)})`
    }

    return { message: debugMsg, success: true }
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

export async function updateChecklist(id: string, checklist: { text?: string, label?: string, item?: string, completed?: boolean, checked?: boolean, done?: boolean, completed_at?: string | null }[]) {
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

export async function getPetAppointmentsByCategory(petId: string, category: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) return []

    const { data } = await supabase
        .from('appointments')
        .select(`
            id, scheduled_at, status, check_in_date, check_out_date,
            services!inner (
                name,
                service_categories!inner ( name )
            )
        `)
        .eq('pet_id', petId)
        .eq('org_id', profile.org_id)
        .eq('services.service_categories.name', category)
        .order('scheduled_at', { ascending: false })
        .limit(10)

    return data || []
}

export async function checkInAppointment(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const now = new Date().toISOString()
    const { error } = await supabase
        .from('appointments')
        .update({ actual_check_in: now, status: 'in_progress' })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/agenda')
    return { message: 'Check-in realizado!', success: true }
}

export async function checkOutAppointment(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const now = new Date().toISOString()
    const { error } = await supabase
        .from('appointments')
        .update({ actual_check_out: now, status: 'done' })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/agenda')
    return { message: 'Check-out realizado!', success: true }
}
