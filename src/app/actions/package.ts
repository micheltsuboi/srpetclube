'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { addFinancialTransaction } from '@/app/actions/finance'
import { fixPackageUsageIndices } from '@/app/actions/fix_data'

interface ActionState {
    message: string
    success: boolean
    data?: unknown
}

// =====================================================
// SERVICE PACKAGES (Templates)
// =====================================================

export async function createServicePackage(prevState: ActionState, formData: FormData): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) return { message: 'Erro de organização.', success: false }

    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const total_price = parseFloat(formData.get('total_price') as string)
    let validity_type = (formData.get('validity_type') as string) || 'none'
    const validity_weeks = parseInt(formData.get('validity_weeks') as string) || 0
    // Mensal não existe mais no frontend, mas no banco aceitamos 'weekly' e convertemos para dias.
    if (validity_type === 'monthly') validity_type = 'weekly';
    const validity_days = validity_type === 'weekly' ? validity_weeks * 7 : null

    // Criar o pacote
    const { data: package_data, error: packageError } = await supabase
        .from('service_packages')
        .insert({
            org_id: profile.org_id,
            name,
            description,
            total_price,
            validity_days,
            validity_type
        })
        .select()
        .single()

    if (packageError) return { message: packageError.message, success: false }

    revalidatePath('/owner/packages')
    return { message: 'Pacote criado!', success: true, data: package_data }
}

export async function updateServicePackage(prevState: ActionState, formData: FormData): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const id = formData.get('id') as string
    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const total_price = parseFloat(formData.get('total_price') as string)
    let validity_type = (formData.get('validity_type') as string) || 'none'
    const validity_weeks = parseInt(formData.get('validity_weeks') as string) || 0
    if (validity_type === 'monthly') validity_type = 'weekly';
    const validity_days = validity_type === 'weekly' ? validity_weeks * 7 : null

    const { error } = await supabase
        .from('service_packages')
        .update({ name, description, total_price, validity_days, validity_type })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/packages')
    return { message: 'Pacote atualizado!', success: true }
}

export async function deleteServicePackage(id: string): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    try {
        // 1. Get all customer packages linked to this service package
        const { data: customerPkgs } = await supabase
            .from('customer_packages')
            .select('id')
            .eq('package_id', id)
        
        const customerPkgIds = customerPkgs?.map(cp => cp.id) || []

        if (customerPkgIds.length > 0) {
            // 2. Get all package credits for these customer packages
            const { data: credits } = await supabase
                .from('package_credits')
                .select('id')
                .in('customer_package_id', customerPkgIds)
            
            const creditIds = credits?.map(c => c.id) || []

            if (creditIds.length > 0) {
                // 3. Delete appointments using these credits
                await supabase.from('appointments').delete().in('package_credit_id', creditIds)
                
                // 4. Delete package credits
                await supabase.from('package_credits').delete().in('id', creditIds)
            }

            // 5. Delete customer packages
            await supabase.from('customer_packages').delete().in('id', customerPkgIds)
        }

        // 6. Delete package items (template components)
        await supabase.from('package_items').delete().eq('package_id', id)

        // 7. Finally, delete the service package template
        const { error } = await supabase.from('service_packages').delete().eq('id', id)
        
        if (error) return { message: error.message, success: false }

        revalidatePath('/owner/packages')
        return { message: 'Pacote e todas as suas dependências foram excluídos.', success: true }
    } catch (err: any) {
        return { message: err.message || 'Erro ao realizar a exclusão em cascata.', success: false }
    }
}

export async function togglePackageStatus(id: string, isActive: boolean): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase
        .from('service_packages')
        .update({ is_active: isActive })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/packages')
    return { message: isActive ? 'Pacote ativado!' : 'Pacote desativado!', success: true }
}

// =====================================================
// PACKAGE ITEMS (Composição)
// =====================================================

export async function addPackageItem(packageId: string, serviceId: string, quantity: number): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase
        .from('package_items')
        .insert({
            package_id: packageId,
            service_id: serviceId,
            quantity
        })

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/packages')
    return { message: 'Serviço adicionado ao pacote!', success: true }
}

export async function updatePackageItem(id: string, quantity: number): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase
        .from('package_items')
        .update({ quantity })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/packages')
    return { message: 'Quantidade atualizada!', success: true }
}

export async function deletePackageItem(id: string): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase.from('package_items').delete().eq('id', id)
    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/packages')
    return { message: 'Serviço removido do pacote.', success: true }
}

// =====================================================
// CUSTOMER PACKAGES (Vendas)
// =====================================================

export async function sellPackageToCustomer(prevState: ActionState, formData: FormData): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) return { message: 'Erro de organização.', success: false }

    const customer_id = formData.get('customer_id') as string
    const package_id = formData.get('package_id') as string
    const pet_id = formData.get('pet_id') as string || null // NOVO: suporte a pet específico
    const total_paid = parseFloat(formData.get('total_paid') as string)
    const payment_method = formData.get('payment_method') as string
    const notes = formData.get('notes') as string || null

    // Buscar informações do pacote
    const { data: packageData, error: packageError } = await supabase
        .from('service_packages')
        .select('id, name, total_price, validity_days, package_items(service_id, quantity)')
        .eq('id', package_id)
        .single()

    if (packageError || !packageData) {
        return { message: 'Pacote não encontrado.', success: false }
    }

    // Calcular data de expiração
    let expires_at = null
    if (packageData.validity_days) {
        const expiry = new Date()
        expiry.setDate(expiry.getDate() + packageData.validity_days)
        expires_at = expiry.toISOString()
    }

    // Criar registro de compra do pacote
    const { data: customerPackage, error: cpError } = await supabase
        .from('customer_packages')
        .insert({
            customer_id,
            pet_id, // NOVO: vincular a pet específico (opcional)
            package_id,
            org_id: profile.org_id,
            total_paid,
            calculated_price: packageData.total_price || total_paid,
            payment_method,
            notes,
            expires_at
        })
        .select()
        .single()

    if (cpError || !customerPackage) {
        return { message: cpError?.message || 'Erro ao criar pacote.', success: false }
    }

    // Criar créditos para cada serviço do pacote
    const credits = packageData.package_items.map((item: { service_id: string; quantity: number }) => ({
        customer_package_id: customerPackage.id,
        service_id: item.service_id,
        total_quantity: item.quantity,
        used_quantity: 0,
        remaining_quantity: item.quantity
    }))

    const { error: creditsError } = await supabase
        .from('package_credits')
        .insert(credits)

    if (creditsError) {
        // Rollback: deletar o customer_package
        await supabase.from('customer_packages').delete().eq('id', customerPackage.id)
        return { message: creditsError.message, success: false }
    }

    revalidatePath('/owner/packages')
    revalidatePath('/owner/pets')
    revalidatePath('/staff')

    // Registrar transação financeira
    await addFinancialTransaction({
        type: 'income',
        category: 'Pacotes',
        name: `Venda de Pacote: ${packageData.name || 'Serviço'}`,
        amount: total_paid,
        date: new Date().toISOString(),
        payment_method: payment_method,
        description: `Cliente ID: ${customer_id}${notes ? ` - ${notes}` : ''}`
    })

    return { message: 'Pacote vendido com sucesso!', success: true }
}

export async function deleteCustomerPackage(customerPackageId: string): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) return { message: 'Erro de organização.', success: false }

    // Obter todos os package_credits associados
    const { data: credits } = await supabase
        .from('package_credits')
        .select('id')
        .eq('customer_package_id', customerPackageId)

    const { data: slots } = await supabase
        .from('package_schedule_slots')
        .select('id')
        .eq('customer_package_id', customerPackageId)

    const creditIds = credits?.map(c => c.id) || []
    const slotIds = slots?.map(s => s.id) || []

    // 1. Desvincular agendamentos JÁ realizados ou cancelados (que não queremos deletar)
    if (creditIds.length > 0 || slotIds.length > 0) {
        let query = supabase.from('appointments').update({
            package_credit_id: null,
            package_slot_id: null
        })

        if (creditIds.length > 0 && slotIds.length > 0) {
            query = query.or(`package_credit_id.in.(${creditIds.join(',')}),package_slot_id.in.(${slotIds.join(',')})`)
        } else if (creditIds.length > 0) {
            query = query.in('package_credit_id', creditIds)
        } else {
            query = query.in('package_slot_id', slotIds)
        }

        await query.not('status', 'in', '("pending","scheduled")')
    }

    // 2. Excluir agendamentos futuristas (pendentes/agendados) que pertencem a este pacote
    if (creditIds.length > 0 || slotIds.length > 0) {
        let query = supabase.from('appointments').delete()

        if (creditIds.length > 0 && slotIds.length > 0) {
            query = query.or(`package_credit_id.in.(${creditIds.join(',')}),package_slot_id.in.(${slotIds.join(',')})`)
        } else if (creditIds.length > 0) {
            query = query.in('package_credit_id', creditIds)
        } else {
            query = query.in('package_slot_id', slotIds)
        }

        await query.in('status', ['pending', 'scheduled'])
    }

    // 2.5 Excluir transação financeira associada ao pacote (se houver)
    // A transação foi vinculada pela string na descrição, portanto usamos o LIKE
    await supabase
        .from('financial_transactions')
        .delete()
        .like('description', `%Vinculado ao pacote ID: ${customerPackageId}%`)
        .eq('org_id', profile.org_id)

    // 3. Remover o pacote (o cascade cuidará de package_credits e package_schedule_slots no banco,
    // mas vamos garantir a ordem aqui se necessário)
    const { error } = await supabase
        .from('customer_packages')
        .delete()
        .eq('id', customerPackageId)
        .eq('org_id', profile.org_id)

    if (error) {
        return { message: error.message, success: false }
    }

    revalidatePath('/owner/packages')
    revalidatePath('/owner/pets')
    revalidatePath('/owner/agenda')
    return { message: 'Pacote e agendamentos futuros excluídos com sucesso.', success: true }
}

export async function updatePackagePaymentStatus(id: string, status: string, method?: string, paidAt?: string) {
    try {
    const supabase = await createClient()
    
    let realPaidAt: string | null = null

    // Se estiver marcando como pago, precisamos registrar no financeiro
    if (status === 'paid') {
        realPaidAt = paidAt 
            ? (paidAt.includes('T') ? paidAt : `${paidAt}T12:00:00`)
            : new Date().toISOString()

        const { data: pkg, error: pkgError } = await supabase
            .from('customer_packages')
            .select(`
                id, total_paid, calculated_price, purchased_at, payment_method,
                service_packages(name), 
                pets(name),
                customers(name)
            `)
            .eq('id', id)
            .single()

        if (!pkgError && pkg) {
            const amount = pkg.total_paid || pkg.calculated_price || 0
            const packageName = (pkg.service_packages as any)?.name || 'Pacote'
            const targetName = (pkg.pets as any)?.name || (pkg.customers as any)?.name || 'Cliente'

            // Verificamos se já existe transação para evitar duplicidade
            const { data: existing } = await supabase
                .from('financial_transactions')
                .select('id')
                .eq('description', `Vinculado ao pacote ID: ${pkg.id} - Pet: ${targetName}`)
                .limit(1)

            if (!existing || existing.length === 0) {
                await addFinancialTransaction({
                    type: 'income',
                    category: 'Pacotes',
                    name: `Venda de Pacote: ${packageName}`,
                    amount: amount,
                    date: realPaidAt,
                    payment_method: method || pkg.payment_method || 'other',
                    description: `Vinculado ao pacote ID: ${pkg.id} - Pet: ${targetName}`
                })
            }
        }
    }

    const updatePayload: Record<string, any> = { 
        payment_status: status, 
        payment_method: method 
    }
    if (status === 'paid') {
        updatePayload.paid_at = realPaidAt
    } else if (status === 'pending') {
        updatePayload.paid_at = null
    }

    await supabase.from('customer_packages').update(updatePayload).eq('id', id)
    
    revalidatePath('/owner/pets')
    revalidatePath('/owner/packages')
    revalidatePath('/owner')
    revalidatePath('/owner/financeiro')
    revalidatePath('/owner/agenda')
    revalidatePath('/owner/creche')
    revalidatePath('/owner/banho-tosa')
    revalidatePath('/owner/hospedagem')

    return { success: true, message: 'Status de pagamento atualizado com sucesso!' }
    } catch (e: any) {
        console.error(e);
        return { success: false, message: 'Erro ao atualizar pagamento do pacote.' }
    }
}

export async function applyPackageDiscount(id: string, value: number, type: 'percent' | 'fixed', basePrice: number) {
    const supabase = await createClient()

    let finalPrice: number
    let discountPercent: number

    if (type === 'percent') {
        if (value < 0 || value > 100) return { message: 'Desconto deve ser entre 0% e 100%.', success: false }
        discountPercent = value
        const discountAmount = (basePrice * discountPercent) / 100
        finalPrice = basePrice - discountAmount
    } else {
        if (value < 0 || value > basePrice) return { message: 'Desconto não pode ser maior que o valor base.', success: false }
        finalPrice = basePrice - value
        discountPercent = basePrice > 0 ? (value / basePrice) * 100 : 0
    }

    const { error } = await supabase
        .from('customer_packages')
        .update({
            discount_percent: parseFloat(discountPercent.toFixed(2)),
            total_paid: parseFloat(finalPrice.toFixed(2))
        })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/pets')
    revalidatePath('/owner/packages')
    return { success: true, message: 'Desconto aplicado com sucesso!' }
}

// Nova função para vender pacote direto para um pet (atalho)
export async function sellPackageToPet(
    petId: string,
    packageId: string,
    totalPaid: number,
    paymentMethod: string,
    preferredWeekdays?: number[],
    preferredTime?: string,
    isAutoSchedule?: boolean,
    hasTaxi?: boolean,
    taxiFee?: number,
    startDate?: string, // Data de início das sessões (YYYY-MM-DD)
    autoRenew?: boolean
): Promise<ActionState> {
    console.log('sellPackageToPet iniciado', { petId, packageId, totalPaid, paymentMethod, preferredWeekdays, preferredTime, isAutoSchedule, hasTaxi, taxiFee })
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        console.log('Usuário não autenticado')
        return { message: 'Não autorizado.', success: false }
    }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) {
        console.log('Perfil ou org_id não encontrado', profile)
        return { message: 'Erro de organização.', success: false }
    }

    // Buscar customer_id do pet
    const { data: petData, error: petError } = await supabase
        .from('pets')
        .select('customer_id, name')
        .eq('id', petId)
        .single()

    if (petError || !petData) {
        console.log('Erro ao buscar pet', petError)
        return { message: 'Pet não encontrado.', success: false }
    }

    // Buscar informações do pacote
    const { data: packageData, error: packageError } = await supabase
        .from('service_packages')
        .select('*, package_items(service_id, quantity)')
        .eq('id', packageId)
        .single()

    if (packageError || !packageData) {
        return { message: 'Pacote não encontrado.', success: false }
    }

    // Calcular data de expiração
    let expires_at = null
    if (packageData.validity_days) {
        const expiry = new Date()
        expiry.setDate(expiry.getDate() + packageData.validity_days)
        expires_at = expiry.toISOString()
    }

    // Calcular mês de referência a partir da data de início das aulas (startDate), se informada
    let calculatedPeriodLabel: string | null = null
    if (startDate) {
        try {
            const d = new Date(startDate + 'T12:00:00')
            const monthName = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
            if (monthName) {
                calculatedPeriodLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1)
            }
        } catch {
            calculatedPeriodLabel = null
        }
    }

    // Criar registro de compra do pacote
    const { data: customerPackage, error: cpError } = await supabase
        .from('customer_packages')
        .insert({
            customer_id: petData.customer_id,
            pet_id: petId,
            package_id: packageId,
            org_id: profile.org_id,
            total_paid: totalPaid,
            calculated_price: (packageData.total_price || totalPaid) + (taxiFee || 0),
            expires_at,
            preferred_weekdays: preferredWeekdays ?? null,
            preferred_time: preferredTime ?? null,
            is_auto_schedule: isAutoSchedule ?? false,
            has_taxi: hasTaxi ?? false,
            taxi_fee: taxiFee ?? 0,
            auto_renew: autoRenew ?? false,
            payment_status: 'pending',
            period_label: calculatedPeriodLabel
        })
        .select(`
            *,
            service_packages(name)
        `)
        .single()

    if (cpError || !customerPackage) {
        console.error('Erro ao criar customer_package:', cpError)
        return { message: cpError?.message || 'Erro ao criar pacote.', success: false }
    }

    // Criar créditos para cada serviço do pacote
    const credits = packageData.package_items.map((item: { service_id: string; quantity: number }) => ({
        customer_package_id: customerPackage.id,
        service_id: item.service_id,
        total_quantity: item.quantity,
        used_quantity: 0,
        remaining_quantity: item.quantity
    }))

    const { error: creditsError } = await supabase
        .from('package_credits')
        .insert(credits)

    if (creditsError) {
        // Rollback: deletar o customer_package
        await supabase.from('customer_packages').delete().eq('id', customerPackage.id)
        return { message: creditsError.message, success: false }
    }

    // Gerar slots (Automático ou Manual via RPC)
    try {
        const rpcParams: any = { p_customer_package_id: customerPackage.id }
        if (startDate) rpcParams.p_period_start = startDate
        await supabase.rpc('generate_package_slots', rpcParams)
        await fixPackageUsageIndices(petId)
    } catch (slotErr) {
        console.warn('Slots não gerados (non-critical):', slotErr)
    }

    revalidatePath('/owner/packages')
    revalidatePath('/owner/pets')
    revalidatePath('/staff')
    revalidatePath('/owner/agenda')

    return { message: `Pacote "${packageData.name}" ativado para ${petData.name}!`, success: true }
}

// =====================================================
// PACKAGE SLOTS - Geração e controle de sessões
// =====================================================

export async function generatePackageSlotsAction(customerPackageId: string): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { data, error } = await supabase.rpc('generate_package_slots', {
        p_customer_package_id: customerPackageId
    })

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/pets')
    revalidatePath('/owner/agenda')
    return { message: `${data} sessão(ões) gerada(s) com sucesso!`, success: true, data }
}

export async function reschedulePackageSlot(
    slotId: string,
    newDate: string,
    newTime: string
): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    // Buscar o slot atual
    const { data: slot, error: slotError } = await supabase
        .from('package_schedule_slots')
        .select('id, appointment_id, customer_package_id, customer_packages(pet_id, org_id, preferred_time), services(id, name)')
        .eq('id', slotId)
        .single()

    if (slotError || !slot) return { message: 'Sessão não encontrada.', success: false }

    const scheduledAt = `${newDate}T${newTime}:00`

    // Atualizar o slot
    const { error: updateError } = await supabase
        .from('package_schedule_slots')
        .update({
            slot_date: newDate,
            slot_time: newTime,
            status: slot.appointment_id ? 'scheduled' : 'pending',
            updated_at: new Date().toISOString()
        })
        .eq('id', slotId)

    if (updateError) return { message: updateError.message, success: false }

    // Se tinha agendamento vinculado, atualizar também
    if (slot.appointment_id) {
        await supabase
            .from('appointments')
            .update({ scheduled_at: scheduledAt })
            .eq('id', slot.appointment_id)
    } else {
        // Criar appointment como 'pending' para refletir na agenda
        const cpData = Array.isArray(slot.customer_packages) ? slot.customer_packages[0] : slot.customer_packages
        const serviceData = Array.isArray(slot.services) ? slot.services[0] : slot.services
        if (cpData && cpData.pet_id && cpData.org_id && serviceData?.id) {
            const { data: credit } = await supabase
                .from('package_credits')
                .select('id')
                .eq('customer_package_id', slot.customer_package_id)
                .eq('service_id', serviceData.id)
                .single()

            const { data: newAppt } = await supabase
                .from('appointments')
                .insert({
                    org_id: cpData.org_id,
                    pet_id: cpData.pet_id,
                    service_id: serviceData.id,
                    scheduled_at: scheduledAt,
                    status: 'pending',
                    package_slot_id: slotId,
                    package_credit_id: credit?.id || null
                })
                .select('id')
                .single()

            if (newAppt) {
                await supabase
                    .from('package_schedule_slots')
                    .update({ appointment_id: newAppt.id })
                    .eq('id', slotId)
            }
        }
    }

    revalidatePath('/owner/pets')
    revalidatePath('/owner/agenda')
    return { message: 'Sessão reagendada com sucesso!', success: true }
}

export async function skipPackageSlot(slotId: string): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase
        .from('package_schedule_slots')
        .update({ status: 'skipped', updated_at: new Date().toISOString() })
        .eq('id', slotId)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/pets')
    return { message: 'Sessão marcada como pulada.', success: true }
}

export async function getPackageSlotsHistory(customerPackageId: string) {
    const supabase = await createClient()

    // 1. Buscar slots do pacote
    const { data: slots, error: slotsError } = await supabase
        .from('package_schedule_slots')
        .select(`
            id, slot_date, slot_time, status, period_label,
            appointment_id,
            services (id, name, category)
        `)
        .eq('customer_package_id', customerPackageId)
        .order('slot_date', { ascending: false })

    if (slotsError) {
        console.error('Erro ao buscar histórico de slots:', slotsError)
        return []
    }

    // 2. Buscar créditos do pacote para localizar agendamentos
    const { data: credits } = await supabase
        .from('package_credits')
        .select('id, service_id, services(id, name, category)')
        .eq('customer_package_id', customerPackageId)

    const creditIds = (credits || []).map(c => c.id)
    const slotIds = (slots || []).map(s => s.id)
    const appointmentIds = (slots || []).map(s => s.appointment_id).filter(Boolean)

    const conditions: string[] = []
    if (appointmentIds.length > 0) conditions.push(`id.in.(${appointmentIds.join(',')})`)
    if (slotIds.length > 0) conditions.push(`package_slot_id.in.(${slotIds.join(',')})`)
    if (creditIds.length > 0) conditions.push(`package_credit_id.in.(${creditIds.join(',')})`)

    const apptMap = new Map<string, any>()
    let extraAppts: any[] = []

    if (conditions.length > 0) {
        const { data: apptsData } = await supabase
            .from('appointments')
            .select(`
                id, scheduled_at, status, notes,
                has_extras, extras_fee, extras,
                has_taxi, taxi_fee,
                payment_status, payment_method, paid_at,
                final_price, calculated_price,
                package_slot_id, package_credit_id,
                package_usage_index,
                services (id, name, category)
            `)
            .or(conditions.join(','))
            .order('scheduled_at', { ascending: false })

        if (apptsData) {
            apptsData.forEach(appt => {
                apptMap.set(appt.id, appt)
                if (appt.package_slot_id) {
                    apptMap.set(`slot_${appt.package_slot_id}`, appt)
                }
            })

            // Identificar agendamentos que consom crédito deste pacote mas não possuem slot correspondente
            extraAppts = apptsData.filter(a =>
                !slots?.some(s => s.id === a.package_slot_id || s.appointment_id === a.id)
            )
        }
    }

    // 3. Mesclar cada slot com o respectivo appointment e seus extras
    const enrichedSlots = (slots || []).map(slot => {
        const appt = (slot.appointment_id ? apptMap.get(slot.appointment_id) : null) || apptMap.get(`slot_${slot.id}`) || null
        
        let parsedExtras: any[] = []
        if (appt?.extras) {
            if (Array.isArray(appt.extras)) parsedExtras = appt.extras
            else if (typeof appt.extras === 'string') {
                try { parsedExtras = JSON.parse(appt.extras) } catch { parsedExtras = [] }
            }
        }

        const hasExtras = !!(appt?.has_extras || parsedExtras.length > 0 || (appt?.extras_fee && appt.extras_fee > 0))

        return {
            ...slot,
            appointment_id: slot.appointment_id || appt?.id || null,
            appointment: appt,
            has_extras: hasExtras,
            extras_fee: Number(appt?.extras_fee || 0),
            extras: parsedExtras,
            has_taxi: !!appt?.has_taxi,
            taxi_fee: Number(appt?.taxi_fee || 0),
            appt_payment_status: appt?.payment_status || null,
            appt_payment_method: appt?.payment_method || null,
            appt_paid_at: appt?.paid_at || null
        }
    })

    // Adicionar sessões que não tinham slot registrado (ex: agendamentos avulsos na agenda que consumiram créditos do pacote)
    extraAppts.forEach(a => {
        let parsedExtras: any[] = []
        if (a.extras) {
            if (Array.isArray(a.extras)) parsedExtras = a.extras
            else if (typeof a.extras === 'string') {
                try { parsedExtras = JSON.parse(a.extras) } catch { parsedExtras = [] }
            }
        }
        const hasExtras = !!(a.has_extras || parsedExtras.length > 0 || (a.extras_fee && a.extras_fee > 0))

        enrichedSlots.push({
            id: `appt_${a.id}`,
            slot_date: a.scheduled_at ? a.scheduled_at.split('T')[0] : '',
            slot_time: a.scheduled_at ? new Date(a.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null,
            status: a.status === 'done' || a.status === 'completed' ? 'done' : (a.status === 'no_show' ? 'no_show' : 'scheduled'),
            period_label: null,
            appointment_id: a.id,
            services: a.services,
            appointment: a,
            has_extras: hasExtras,
            extras_fee: Number(a.extras_fee || 0),
            extras: parsedExtras,
            has_taxi: !!a.has_taxi,
            taxi_fee: Number(a.taxi_fee || 0),
            appt_payment_status: a.payment_status || null,
            appt_payment_method: a.payment_method || null,
            appt_paid_at: a.paid_at || null
        })
    })

    return enrichedSlots
}

export async function schedulePackageSlot(
    slotId: string,
    petId: string,
    serviceId: string,
    date: string,
    time: string,
    customerPackageId: string
): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) return { message: 'Erro de organização.', success: false }

    // Buscar o credit_id para vincular ao appointment
    const { data: credit } = await supabase
        .from('package_credits')
        .select('id')
        .eq('customer_package_id', customerPackageId)
        .eq('service_id', serviceId)
        .single()

    // Criar agendamento
    const { data: appointment, error: apptError } = await supabase
        .from('appointments')
        .insert({
            org_id: profile.org_id,
            pet_id: petId,
            service_id: serviceId,
            scheduled_at: `${date}T${time}:00`,
            status: 'confirmed',
            package_slot_id: slotId,
            package_credit_id: credit?.id || null
        })
        .select()
        .single()

    if (apptError || !appointment) return { message: apptError?.message || 'Erro ao criar agendamento.', success: false }

    // Vincular slot ao agendamento e marcar como scheduled
    const { error: slotError } = await supabase
        .from('package_schedule_slots')
        .update({
            appointment_id: appointment.id,
            slot_date: date,
            slot_time: time,
            status: 'scheduled',
            updated_at: new Date().toISOString()
        })
        .eq('id', slotId)

    if (slotError) return { message: slotError.message, success: false }

    // Decrementar crédito
    if (credit?.id) {
        await supabase.rpc('use_package_credit_for_pet', { p_pet_id: petId, p_service_id: serviceId })
    }

    revalidatePath('/owner/pets')
    revalidatePath('/owner/agenda')
    return { message: 'Agendamento criado e vinculado ao pacote!', success: true }
}

export async function renewCustomerPackage(customerPackageId: string): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) return { message: 'Erro de organização.', success: false }

    // Buscar pacote atual
    const { data: currentPackage, error: fetchError } = await supabase
        .from('customer_packages')
        .select(`
            id, customer_id, package_id, org_id, pet_id, 
            preferred_weekdays, preferred_time, is_auto_schedule, has_taxi, taxi_fee, auto_renew,
            service_packages(validity_days, total_price, package_items(service_id, quantity))
        `)
        .eq('id', customerPackageId)
        .single()

    if (fetchError || !currentPackage) {
        return { message: 'Pacote não encontrado.', success: false }
    }

    // Os créditos não usados devem ser somados aos novos créditos
    const { data: existingCredits } = await supabase
        .from('package_credits')
        .select('service_id, remaining_quantity')
        .eq('customer_package_id', customerPackageId)

    // Calcular nova data de expiração
    let new_expires_at = null
    const validityDays = (currentPackage.service_packages as any)?.validity_days
    if (validityDays) {
        const expiry = new Date()
        expiry.setDate(expiry.getDate() + validityDays)
        new_expires_at = expiry.toISOString()
    }

    // Criar novo pacote
    const { data: newPackage, error: newPackageError } = await supabase
        .from('customer_packages')
        .insert({
            customer_id: currentPackage.customer_id,
            package_id: currentPackage.package_id,
            org_id: currentPackage.org_id,
            pet_id: currentPackage.pet_id,
            preferred_weekdays: currentPackage.preferred_weekdays,
            preferred_time: currentPackage.preferred_time,
            is_auto_schedule: currentPackage.is_auto_schedule,
            has_taxi: currentPackage.has_taxi,
            taxi_fee: currentPackage.taxi_fee,
            auto_renew: currentPackage.auto_renew,
            calculated_price: (currentPackage.service_packages as any)?.total_price || 0,
            total_paid: 0, // Renovação pode ser gratuita ou paga manualmente
            payment_status: 'pending',
            payment_method: 'other',
            notes: 'Renovação automática',
            expires_at: new_expires_at
        })
        .select()
        .single()

    if (newPackageError || !newPackage) {
        return { message: 'Erro ao renovar pacote.', success: false }
    }

    // Criar créditos considerando apenas a quantidade original do pacote
    const packageItems = (currentPackage.service_packages as any)?.package_items || []
    const newCredits = packageItems.map((item: any) => {
        return {
            customer_package_id: newPackage.id,
            service_id: item.service_id,
            total_quantity: item.quantity,
            used_quantity: 0,
            remaining_quantity: item.quantity
        }
    })

    const { error: creditsError } = await supabase
        .from('package_credits')
        .insert(newCredits)

    if (creditsError) {
        await supabase.from('customer_packages').delete().eq('id', newPackage.id)
        return { message: creditsError.message, success: false }
    }

    // Desativar pacote antigo
    await supabase
        .from('customer_packages')
        .update({ is_active: false })
        .eq('id', customerPackageId)

    // Gerar slots (Automático ou Manual conforme a configuração do pacote)
    try {
        await supabase.rpc('generate_package_slots', {
            p_customer_package_id: newPackage.id
        })
        if (newPackage.pet_id) {
            await fixPackageUsageIndices(newPackage.pet_id)
        }
    } catch (err) {
        console.error('Erro ao gerar slots na renovação:', err)
    }

    revalidatePath('/owner/packages')
    revalidatePath('/staff')
    return { message: 'Pacote renovado! Créditos antigos foram transferidos.', success: true }
}

export async function cancelCustomerPackage(id: string): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase
        .from('customer_packages')
        .update({ is_active: false })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/packages')
    revalidatePath('/staff')
    return { message: 'Pacote cancelado.', success: true }
}

import { unstable_noStore as noStore } from 'next/cache'

export async function getPetPackagesWithUsage(petId: string) {
    noStore();
    const supabase = await createClient()

    // 1. Buscar resumo dos pacotes (usando a função RPC existente para facilitar)
    const { data: summary, error } = await supabase.rpc('get_pet_package_summary', {
        p_pet_id: petId
    })

    if (error) {
        console.error('Erro ao buscar resumo de pacotes:', error)
        return []
    }

    if (!summary || summary.length === 0) return []

    // 1.1 Buscar period_label customizado de cada customer_package
    const cpIds = Array.from(new Set(summary.map((s: any) => s.customer_package_id)))
    const { data: cpRecords } = await supabase
        .from('customer_packages')
        .select('id, period_label')
        .in('id', cpIds)

    const cpMap = new Map((cpRecords || []).map(r => [r.id, r]))

    // 2. Buscar detalhes de uso (agendamentos e extras) para cada item
    const packagesWithUsage = await Promise.all(summary.map(async (item: any) => {
        const { data: credit } = await supabase
            .from('package_credits')
            .select('id')
            .eq('customer_package_id', item.customer_package_id)
            .eq('service_id', item.service_id)
            .maybeSingle()

        // Buscar slots deste pacote (ordenados para identificar a primeira sessão cronológica)
        const { data: slots } = await supabase
            .from('package_schedule_slots')
            .select('id, appointment_id, slot_date')
            .eq('customer_package_id', item.customer_package_id)
            .order('slot_date', { ascending: true })

        // Calcular mês de referência inteligente:
        // 1º: period_label salvo explicitamente no pacote
        // 2º: mês da primeira sessão/aula agendada (ex: se comprou em setembro para começar em outubro)
        // 3º: mês da data de compra
        const cp = cpMap.get(item.customer_package_id)
        let referenceMonth: string | null = cp?.period_label || null

        if (!referenceMonth && slots && slots.length > 0 && slots[0].slot_date) {
            try {
                const d = new Date(slots[0].slot_date + 'T12:00:00')
                const m = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                if (m) referenceMonth = m.charAt(0).toUpperCase() + m.slice(1)
            } catch {
                // ignore
            }
        }

        if (!referenceMonth) {
            try {
                const fallbackDate = item.purchased_at || item.expires_at || new Date().toISOString()
                const m = new Date(fallbackDate).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                if (m) referenceMonth = m.charAt(0).toUpperCase() + m.slice(1)
            } catch {
                // ignore
            }
        }

        const slotIds = (slots || []).map(s => s.id)
        const apptIdsFromSlots = (slots || []).map(s => s.appointment_id).filter(Boolean)

        const conditions: string[] = []
        if (credit?.id) conditions.push(`package_credit_id.eq.${credit.id}`)
        if (slotIds.length > 0) conditions.push(`package_slot_id.in.(${slotIds.join(',')})`)
        if (apptIdsFromSlots.length > 0) conditions.push(`id.in.(${apptIdsFromSlots.join(',')})`)

        let appointments: any[] = []
        let packageExtras: any[] = []
        let totalExtrasFee = 0
        let hasPendingExtras = false

        if (conditions.length > 0) {
            const { data: apps } = await supabase
                .from('appointments')
                .select(`
                    id, scheduled_at, status,
                    has_extras, extras_fee, extras,
                    payment_status, payment_method, paid_at,
                    package_usage_index
                `)
                .or(conditions.join(','))
                .order('scheduled_at', { ascending: false })

            if (apps) {
                const uniqueAppsMap = new Map<string, any>()
                apps.forEach(a => uniqueAppsMap.set(a.id, a))
                appointments = Array.from(uniqueAppsMap.values())

                appointments.forEach((appt: any) => {
                    let parsedExtras: any[] = []
                    if (appt.extras) {
                        if (Array.isArray(appt.extras)) parsedExtras = appt.extras
                        else if (typeof appt.extras === 'string') {
                            try { parsedExtras = JSON.parse(appt.extras) } catch { parsedExtras = [] }
                        }
                    }

                    const apptHasExtras = !!(appt.has_extras || parsedExtras.length > 0 || (appt.extras_fee && appt.extras_fee > 0))

                    if (apptHasExtras) {
                        const fee = Number(appt.extras_fee || 0)
                        totalExtrasFee += fee
                        if (appt.payment_status !== 'paid') {
                            hasPendingExtras = true
                        }

                        if (parsedExtras.length > 0) {
                            parsedExtras.forEach(ext => {
                                packageExtras.push({
                                    name: ext.name,
                                    price: Number(ext.price || 0),
                                    sessionDate: appt.scheduled_at ? appt.scheduled_at.split('T')[0] : null,
                                    sessionIndex: appt.package_usage_index || null,
                                    paymentStatus: appt.payment_status || 'pending',
                                    paymentMethod: appt.payment_method || null,
                                    appointmentId: appt.id
                                })
                            })
                        } else if (fee > 0) {
                            packageExtras.push({
                                name: 'Serviço/Produto Extra',
                                price: fee,
                                sessionDate: appt.scheduled_at ? appt.scheduled_at.split('T')[0] : null,
                                sessionIndex: appt.package_usage_index || null,
                                paymentStatus: appt.payment_status || 'pending',
                                paymentMethod: appt.payment_method || null,
                                appointmentId: appt.id
                            })
                        }
                    }
                })
            }
        }

        return {
            ...item,
            credit_id: credit?.id,
            appointments,
            package_extras: packageExtras,
            total_extras_fee: totalExtrasFee,
            has_pending_extras: hasPendingExtras,
            reference_month: referenceMonth,
            period_label: cp?.period_label || null
        }
    }))

    return packagesWithUsage
}

/**
 * Atualiza o mês ou rótulo de referência de um pacote do cliente (ex: "Outubro de 2026")
 */
export async function updatePackageReferenceMonth(
    customerPackageId: string,
    referenceMonth: string
): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const formatted = referenceMonth.trim()
    const { error } = await supabase
        .from('customer_packages')
        .update({ period_label: formatted })
        .eq('id', customerPackageId)

    if (error) {
        console.error('Erro ao atualizar mês de referência do pacote:', error)
        return { message: error.message, success: false }
    }

    revalidatePath('/owner/pets')
    revalidatePath('/owner/packages')
    return { message: 'Mês de referência atualizado com sucesso!', success: true }
}

/**
 * Busca todos os pacotes ativos que estão vencendo hoje (ou já vencidos) 
 * e que possuem a flag auto_renew = true, processando a renovação de cada um.
 */
export async function checkAndProcessAutoRenewals(): Promise<ActionState> {
    const supabase = await createClient()
    
    // Buscar pacotes ativos, com auto_renew, onde a data de expiração é hoje ou anterior
    const now = new Date().toISOString()
    const { data: packagesToRenew, error } = await supabase
        .from('customer_packages')
        .select('id, pet_id')
        .eq('is_active', true)
        .eq('auto_renew', true)
        .lte('expires_at', now)

    if (error) {
        console.error('Erro ao buscar pacotes para renovação:', error)
        return { message: 'Erro ao buscar pacotes.', success: false }
    }

    if (!packagesToRenew || packagesToRenew.length === 0) {
        return { message: 'Nenhum pacote para renovar hoje.', success: true }
    }

    console.log(`Iniciando renovação automática de ${packagesToRenew.length} pacotes...`)
    
    let successCount = 0
    for (const pkg of packagesToRenew) {
        try {
            const res = await renewCustomerPackage(pkg.id)
            if (res.success) successCount++
        } catch (err) {
            console.error(`Falha ao renovar pacote ${pkg.id}:`, err)
        }
    }

    return { 
        message: `${successCount} pacotes renovados com sucesso.`, 
        success: true,
        data: { total: packagesToRenew.length, success: successCount }
    }
}

/**
 * Atualiza a configuração de renovação automática de um pacote específico.
 */
export async function updatePackageAutoRenew(id: string, autoRenew: boolean): Promise<ActionState> {
    const supabase = await createClient()
    const { error } = await supabase
        .from('customer_packages')
        .update({ auto_renew: autoRenew })
        .eq('id', id)

    if (error) {
        return { message: 'Erro ao atualizar renovação: ' + error.message, success: false }
    }

    revalidatePath('/owner/pets')
    return { message: 'Configuração de renovação atualizada!', success: true }
}
