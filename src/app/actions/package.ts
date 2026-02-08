'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
    const validity_days = formData.get('validity_days') ? parseInt(formData.get('validity_days') as string) : null

    // Criar o pacote
    const { data: package_data, error: packageError } = await supabase
        .from('service_packages')
        .insert({
            org_id: profile.org_id,
            name,
            description,
            total_price,
            validity_days
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
    const validity_days = formData.get('validity_days') ? parseInt(formData.get('validity_days') as string) : null

    const { error } = await supabase
        .from('service_packages')
        .update({ name, description, total_price, validity_days })
        .eq('id', id)

    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/packages')
    return { message: 'Pacote atualizado!', success: true }
}

export async function deleteServicePackage(id: string): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase.from('service_packages').delete().eq('id', id)
    if (error) return { message: error.message, success: false }

    revalidatePath('/owner/packages')
    return { message: 'Pacote excluído.', success: true }
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
        .select('*, package_items(service_id, quantity)')
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
    return { message: 'Pacote vendido com sucesso!', success: true }
}

// Nova função para vender pacote direto para um pet (atalho)
export async function sellPackageToPet(petId: string, packageId: string, totalPaid: number, paymentMethod: string): Promise<ActionState> {
    console.log('sellPackageToPet iniciado', { petId, packageId, totalPaid, paymentMethod })
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

    // Criar registro de compra do pacote
    const { data: customerPackage, error: cpError } = await supabase
        .from('customer_packages')
        .insert({
            customer_id: petData.customer_id,
            pet_id: petId,
            package_id: packageId,
            org_id: profile.org_id,
            total_paid: totalPaid,
            payment_method: paymentMethod,
            notes: `Pacote para ${petData.name}`,
            expires_at
        })
        .select()
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

    revalidatePath('/owner/packages')
    revalidatePath('/owner/pets')
    revalidatePath('/staff')
    return { message: `Pacote "${packageData.name}" ativado para ${petData.name}!`, success: true }
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
        .select('*, service_packages(validity_days, package_items(service_id, quantity))')
        .eq('id', customerPackageId)
        .single()

    if (fetchError || !currentPackage) {
        return { message: 'Pacote não encontrado.', success: false }
    }

    // Os créditos não usados devem ser somados aos novos créditos
    const { data: existingCredits } = await supabase
        .from('package_credits')
        .select('*')
        .eq('customer_package_id', customerPackageId)

    // Calcular nova data de expiração
    let new_expires_at = null
    const validityDays = (currentPackage.service_packages as { validity_days: number | null }).validity_days
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
            total_paid: 0, // Renovação pode ser gratuita ou paga manualmente
            payment_method: 'other',
            notes: 'Renovação automática',
            expires_at: new_expires_at
        })
        .select()
        .single()

    if (newPackageError || !newPackage) {
        return { message: 'Erro ao renovar pacote.', success: false }
    }

    // Criar créditos considerando os antigos
    const packageItems = (currentPackage.service_packages as { package_items: Array<{ service_id: string; quantity: number }> }).package_items
    const newCredits = packageItems.map((item) => {
        const existingCredit = existingCredits?.find(c => c.service_id === item.service_id)
        const carryOver = existingCredit?.remaining_quantity || 0

        return {
            customer_package_id: newPackage.id,
            service_id: item.service_id,
            total_quantity: item.quantity + carryOver,
            used_quantity: 0,
            remaining_quantity: item.quantity + carryOver
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

export async function getPetPackagesWithUsage(petId: string) {
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

    // 2. Buscar detalhes de uso (agendamentos) para cada item
    const packagesWithUsage = await Promise.all(summary.map(async (item: any) => {
        // Primeiro, precisamos encontrar o crédito exato
        // A RPC não retorna o ID do crédito, então precisamos buscar
        const { data: credit } = await supabase
            .from('package_credits')
            .select('id')
            .eq('customer_package_id', item.customer_package_id)
            .eq('service_id', item.service_id)
            .single()

        let appointments: any[] = []
        if (credit) {
            const { data: apps } = await supabase
                .from('appointments')
                .select('id, scheduled_at, status')
                .eq('package_credit_id', credit.id)
                .order('scheduled_at', { ascending: false })

            if (apps) appointments = apps
        }

        return {
            ...item,
            credit_id: credit?.id,
            appointments
        }
    }))

    return packagesWithUsage
}
