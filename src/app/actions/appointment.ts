'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createNotification } from './notification'
import { fixPackageUsageIndices } from './fix_data'

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
        .select('org_id, role')
        .eq('id', user.id)
        .single()

    if (!profile?.org_id) return { message: 'Organização não encontrada.', success: false }

    const isCustomer = profile.role === 'customer'

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

    // Taxi Dog Extract
    const hasTaxi = formData.get('hasTaxi') === 'true'
    const taxiFee = parseFloat(formData.get('taxiFee') as string || '0')

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

    // Validate Assessment for Creche/Hospedagem (Only for CUSTOMERS)
    if ((isCreche || isHospedagem) && isCustomer) {
        const { data: assessment } = await supabase
            .from('pet_assessments')
            .select('status')
            .eq('pet_id', petId)
            .single()

        if (!assessment || assessment.status !== 'approved') {
            return { message: `Este pet precisa de uma avaliação aprovada para ${categoryName}.`, success: false }
        }
    }

    // 3. Get customer & pet data FIRST (needed for species check)
    const { data: petData, error: petError } = await supabase
        .from('pets')
        .select('id, name, customer_id, weight_kg, species') // Ensure species is selected
        .eq('id', petId)
        .single()

    if (petError || !petData) {
        return { message: 'Pet não encontrado ou erro ao buscar dados do tutor.', success: false }
    }

    // Prepare Date Range / Scheduled At
    let scheduledAt: string
    let checkIn: string | null = null
    let checkOut: string | null = null

    if (isHospedagem && checkInDate && checkOutDate) {
        // Hospedagem Logic
        checkIn = checkInDate
        checkOut = checkOutDate
        // Scheduled at mostly for sorting, set to Check-in at 17:00
        scheduledAt = new Date(`${checkInDate}T17:00:00-03:00`).toISOString()
    } else {
        // Standard / Creche Logic
        try {
            scheduledAt = new Date(`${date}T${time}:00-03:00`).toISOString()

            // 4. Check for Schedule Blocks (Conflict Check)
            const { data: blocks } = await supabase
                .from('schedule_blocks')
                .select('id, reason, allowed_species')
                .eq('org_id', profile.org_id)
                .lte('start_at', scheduledAt)
                .gte('end_at', scheduledAt)

            // Filter blocks based on species and category restrictions
            const blockingBlocks = blocks?.filter(block => {
                const blockTags: string[] = block.allowed_species || [];
                const allowedSpecies = blockTags.filter(t => !t.startsWith('blocked_cat_'));
                const blockedCategories = blockTags.filter(t => t.startsWith('blocked_cat_')).map(t => t.replace('blocked_cat_', ''));

                let blockApplies = false;

                if (blockedCategories.length > 0) {
                    if (blockedCategories.includes(categoryName || '')) {
                        blockApplies = true;
                    }
                } else {
                    blockApplies = true;
                }

                if (blockApplies) {
                    if (allowedSpecies.length > 0) {
                        const species = (petData as any).species || 'dog';
                        return !allowedSpecies.includes(species);
                    } else {
                        return true; // Block applies to everyone
                    }
                }

                return false; // Block doesn't apply to this category
            })

            if (blockingBlocks && blockingBlocks.length > 0 && !isCreche && !isHospedagem) {
                if (isCustomer) {
                    return { message: `Este horário está bloqueado: ${blockingBlocks[0].reason}`, success: false }
                } else {
                    console.log('[CreateAppointment] Bypassing schedule block for non-customer user.')
                }
            }
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
            .select('id, reason, allowed_species')
            .eq('org_id', profile.org_id)
            .lt('start_at', endAt)
            .gt('end_at', scheduledAt)

        // Same filtering logic for duration blocks
        const blockingConflicts = conflictBlocks?.filter(block => {
            const blockTags: string[] = block.allowed_species || [];
            const allowedSpecies = blockTags.filter(t => !t.startsWith('blocked_cat_'));
            const blockedCategories = blockTags.filter(t => t.startsWith('blocked_cat_')).map(t => t.replace('blocked_cat_', ''));

            let blockApplies = false;

            if (blockedCategories.length > 0) {
                if (blockedCategories.includes(categoryName || '')) {
                    blockApplies = true;
                }
            } else {
                blockApplies = true;
            }

            if (blockApplies) {
                if (allowedSpecies.length > 0) {
                    const species = (petData as any).species || 'dog';
                    return !allowedSpecies.includes(species);
                } else {
                    return true;
                }
            }

            return false;
        })

        if (blockingConflicts && blockingConflicts.length > 0 && !isCreche && !isHospedagem) {
            if (isCustomer) {
                return { message: `Conflito com bloqueio: ${blockingConflicts[0].reason}`, success: false }
            } else {
                console.log('[CreateAppointment] Bypassing duration conflict block for non-customer user.')
            }
        }
    }

    // Verify Credits
    let packageCreditId: string | null = null
    const ignorePackage = formData.get('ignorePackage') === 'true'

    if (!ignorePackage) {
        const { data: creditData } = await supabase.rpc('use_package_credit_for_pet', {
            p_pet_id: petId,
            p_service_id: serviceId
        })

        if (creditData) {
            packageCreditId = creditData
        }
    }

    // Pricing Calculation Logic
    let calculatedPrice = (serviceData as any).base_price

    // Use weight_kg from petData
    const weight = (petData as any).weight_kg ?? (petData as any).weight

    if (weight !== null && weight !== undefined) {
        const { data: rules } = await supabase
            .from('pricing_matrix')
            .select('fixed_price')
            .eq('service_id', serviceId)
            .eq('is_active', true)
            .lte('weight_min', weight)
            .gte('weight_max', weight)

        if (rules && rules.length > 0) {
            calculatedPrice = rules[0].fixed_price
        } else {
            // SECOND TRY: Use get_price RPC to ensure we follow the same logic as the frontend
            const { data: rpcPrice } = await supabase.rpc('get_price', {
                p_pet_id: petId,
                p_service_id: serviceId,
                p_date: date || checkInDate || new Date().toISOString().split('T')[0]
            })
            if (rpcPrice) calculatedPrice = rpcPrice
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

    let packageUsageIndex: number | null = null
    let inheritedHasTaxi = hasTaxi
    let inheritedTaxiFee = taxiFee

    if (packageCreditId) {
        try {
            // 1. Get the customer package ID and its taxi status
            const { data: creditInfo } = await supabase
                .from('package_credits')
                .select(`
                    customer_package_id,
                    customer_packages (
                        has_taxi,
                        taxi_fee
                    )
                `)
                .eq('id', packageCreditId)
                .single()

            if (creditInfo?.customer_package_id) {
                const pkg = (creditInfo.customer_packages as any)
                if (pkg?.has_taxi) {
                    inheritedHasTaxi = true
                    inheritedTaxiFee = 0 // Inluso no pacote (pré-pago)
                }

                // 2. Count existing non-cancelled sessions for this package
                const { count } = await supabase
                    .from('appointments')
                    .select('id', { count: 'exact', head: true })
                    .eq('package_credit_id', packageCreditId) // Direct check or via relation
                    .neq('status', 'cancelled')

                // Count sessions for the whole customer package
                const { count: totalInPkg } = await supabase
                    .from('appointments')
                    .select('id', { count: 'exact', head: true })
                    .eq('package_credits.customer_package_id', creditInfo.customer_package_id)
                    .neq('status', 'cancelled')

                packageUsageIndex = (totalInPkg || 0) + 1
            }
        } catch (e) {
            console.error('Error calculating session index:', e)
        }
    }

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
            package_usage_index: packageUsageIndex,
            checklist: finalChecklist,
            check_in_date: checkIn,
            check_out_date: checkOut,
            calculated_price: calculatedPrice,
            final_price: calculatedPrice + (inheritedHasTaxi ? inheritedTaxiFee : 0),
            has_taxi: inheritedHasTaxi,
            taxi_fee: inheritedTaxiFee,
            payment_status: 'pending',
            discount_percent: 0
        })

    if (!error) {
        // Generate Notification for new appointment
        const formattedDate = date ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR') :
            (checkInDate ? new Date(`${checkInDate}T12:00:00`).toLocaleDateString('pt-BR') : '');

        await createNotification({
            org_id: profile.org_id,
            type: 'new_appointment',
            title: 'Novo Agendamento 📅',
            message: `Novo agendamento de ${serviceAny.name} para o pet ${petData.name} em ${formattedDate}.`,
            link: isHospedagem ? '/owner/hospedagem' : (isCreche ? '/owner/creche' : '/owner/agenda')
        });
    }

    if (error) {
        return { message: `Erro ao agendar: ${error.message}`, success: false }
    }

    // Sincronizar índices do pacote para este pet
    await fixPackageUsageIndices(petId)

    revalidatePath('/owner/agenda')
    revalidatePath('/owner/pets')
    revalidatePath('/owner/creche') // Revalidate new dashboards
    revalidatePath('/owner/hospedagem')
    revalidatePath('/owner/hospedagem')
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
    revalidatePath('/owner/banho-tosa')
    revalidatePath('/owner/creche')
    revalidatePath('/owner/hospedagem')
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
    const checkInDate = formData.get('checkInDate') as string
    const checkOutDate = formData.get('checkOutDate') as string
    const hasTaxi = formData.get('hasTaxi') === 'true'
    const taxiFee = parseFloat(formData.get('taxiFee') as string || '0')

    if (!id || !date || !time || !serviceId) {
        return { message: 'Dados incompletos.', success: false }
    }

    // 1. Fetch current appointment to get pet_id
    const { data: currentAppt } = await supabase
        .from('appointments')
        .select('pet_id, service_id')
        .eq('id', id)
        .single()

    if (!currentAppt) return { message: 'Agendamento não encontrado.', success: false }

    // 2. Fetch service category and base price
    const { data: serviceData } = await supabase
        .from('services')
        .select('category_id, base_price, service_categories(name)')
        .eq('id', serviceId)
        .single()

    let scheduledAt: string
    try {
        // Force 17:00 for Hospedagem, otherwise use provided time
        const isHospedagem = (serviceData as any)?.service_categories?.name === 'Hospedagem';
        const cleanTime = isHospedagem ? '17:00' : time.slice(0, 5)
        scheduledAt = new Date(`${date}T${cleanTime}:00-03:00`).toISOString()
    } catch (_) {
        return { message: 'Data inválida.', success: false }
    }

    const isActuallyHospedagem = (serviceData as any)?.service_categories?.name === 'Hospedagem';

    // 3. Recalculate price if service changed OR just for safety
    let calculatedPrice = serviceData?.base_price || 0
    
    // Call RPC for dynamic pricing (same as createAppointment)
    const { data: rpcPrice } = await supabase.rpc('get_price', {
        p_pet_id: currentAppt.pet_id,
        p_service_id: serviceId,
        p_date: date || checkInDate || new Date().toISOString().split('T')[0]
    })
    if (rpcPrice) calculatedPrice = rpcPrice

    let days = 1
    if (isActuallyHospedagem && checkInDate && checkOutDate) {
        const start = new Date(checkInDate)
        const end = new Date(checkOutDate)
        start.setHours(12, 0, 0, 0)
        end.setHours(12, 0, 0, 0)

        const diffTime = Math.abs(end.getTime() - start.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        days = diffDays > 0 ? diffDays : 1

        calculatedPrice = calculatedPrice * days
    }

    const updateData: any = {
        service_id: serviceId,
        service_category_id: serviceData?.category_id,
        scheduled_at: scheduledAt,
        notes: notes || null,
        has_taxi: hasTaxi,
        taxi_fee: taxiFee,
        calculated_price: calculatedPrice,
        final_price: calculatedPrice + (hasTaxi ? taxiFee : 0), // Reset final price to new base price + taxi
        discount_percent: 0, // Reset discount when service changes
        discount: 0
    }

    if (checkInDate) updateData.check_in_date = checkInDate
    if (checkOutDate) updateData.check_out_date = checkOutDate

    // Se NÃO for hospedagem, garantir que as datas de check-in/out sejam removidas
    // Isso evita que o card fique "preso" em um range de datas antigo na agenda
    if (!isActuallyHospedagem) {
        updateData.check_in_date = null
        updateData.check_out_date = null
    }

    const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    // Sincronizar índices do pacote para este pet
    await fixPackageUsageIndices(currentAppt.pet_id)

    revalidatePath('/owner/agenda')
    revalidatePath('/owner/banho-tosa')
    revalidatePath('/owner/hospedagem')
    revalidatePath('/owner/creche')
    return { message: 'Agendamento atualizado com sucesso!', success: true }
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
            package_credit_id, package_usage_index,
            package_credits (
                total_quantity,
                customer_packages (
                    has_taxi,
                    taxi_fee,
                    package_credits (
                        total_quantity
                    )
                )
            ),
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


export async function updatePaymentStatus(id: string, paymentStatus: string, paymentMethod?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const updateData: Record<string, unknown> = {
        payment_status: paymentStatus
    }

    if (paymentStatus === 'paid') {
        updateData.paid_at = new Date().toISOString().split('T')[0] + 'T12:00:00'
        if (paymentMethod) {
            updateData.payment_method = paymentMethod
        }
    } else if (paymentStatus === 'pending') {
        updateData.paid_at = null
        updateData.payment_method = null
    }

    const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/agenda')
    revalidatePath('/owner/banho-tosa')
    revalidatePath('/owner/creche')
    revalidatePath('/owner/hospedagem')
    revalidatePath('/owner')
    return { message: paymentStatus === 'paid' ? 'Pagamento registrado!' : 'Status de pagamento atualizado.', success: true }
}

export async function applyDiscount(id: string, value: number, type: 'percent' | 'fixed', frontendBasePrice?: number) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    // Fetch current calculated_price
    const { data: appt, error: fetchErr } = await supabase
        .from('appointments')
        .select(`calculated_price, services(base_price)`)
        .eq('id', id)
        .single()

    if (fetchErr || !appt) return { message: 'Agendamento não encontrado.', success: false }

    const dbBasePrice = appt.calculated_price ?? (appt.services as any)?.base_price ?? 0
    const basePrice = frontendBasePrice ?? dbBasePrice

    let finalPrice: number
    let discountPercent: number
    let discountAmount: number

    if (type === 'percent') {
        if (value < 0 || value > 100) {
            return { message: 'Desconto deve ser entre 0% e 100%.', success: false }
        }
        discountPercent = value
        finalPrice = basePrice * (1 - discountPercent / 100)
        discountAmount = basePrice - finalPrice
    } else {
        if (value < 0 || value > basePrice) {
            return { message: 'Desconto não pode ser maior que o valor base.', success: false }
        }
        discountAmount = value
        finalPrice = basePrice - discountAmount
        discountPercent = basePrice > 0 ? (discountAmount / basePrice) * 100 : 0
    }

    const { error } = await supabase
        .from('appointments')
        .update({
            discount_percent: parseFloat(discountPercent.toFixed(2)),
            discount: parseFloat(discountAmount.toFixed(2)),
            final_price: parseFloat(finalPrice.toFixed(2))
        })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/agenda')
    revalidatePath('/owner/banho-tosa')
    revalidatePath('/owner/creche')
    revalidatePath('/owner/hospedagem')
    revalidatePath('/owner')

    const displayValue = type === 'percent' ? `${value}%` : `R$ ${value.toFixed(2)}`
    return { message: `Desconto de ${displayValue} aplicado! Valor final: R$ ${finalPrice.toFixed(2)}`, success: true }
}
