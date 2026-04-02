'use server'

import { createClient } from '@/lib/supabase/server'

export async function fixServiceCategories() {
    console.log('Starting service category fix...')
    const supabase = await createClient()

    try {
        // 1. Get Hospedagem Category ID
        const { data: cat, error: catError } = await supabase
            .from('service_categories')
            .select('id')
            .eq('name', 'Hospedagem')
            .single()

        if (catError || !cat) {
            console.error('Error finding Hospedagem category:', catError)
            return { success: false, message: 'Categoria Hospedagem não encontrada.' }
        }

        console.log('Hospedagem Category ID:', cat.id)

        // 2. Find services to update (Hospedagem or Hotel)
        const { data: services, error: svcError } = await supabase
            .from('services')
            .select('id, name, category_id')
            .or('name.ilike.%hospedagem%,name.ilike.%hotel%')

        if (svcError) {
            console.error('Error finding services:', svcError)
            return { success: false, message: 'Erro ao buscar serviços.' }
        }

        console.log('Found services to fix:', services?.length)

        // 3. Update them
        let updatedCount = 0
        if (services && services.length > 0) {
            for (const svc of services) {
                if (svc.category_id !== cat.id) {
                    const { error: updateError } = await supabase
                        .from('services')
                        .update({ category_id: cat.id })
                        .eq('id', svc.id)

                    if (!updateError) {
                        updatedCount++
                        console.log(`Updated service: ${svc.name}`)
                    } else {
                        console.error(`Failed to update ${svc.name}:`, updateError)
                    }
                }
            }
        }

        return { success: true, message: `Sucesso! ${updatedCount} serviços atualizados para a categoria Hospedagem.` }

    } catch (error) {
        console.error('Exception in fixServiceCategories:', error)
        return { success: false, message: 'Erro interno ao corrigir dados.' }
    }
}

export async function listServicesWithCategories() {
    const supabase = await createClient()

    const { data: services } = await supabase
        .from('services')
        .select('id, name, base_price, category_id, service_categories(id, name)')
        .order('name')

    const { data: categories } = await supabase
        .from('service_categories')
        .select('id, name, color, icon')
        .order('name')

    return { services: services || [], categories: categories || [] }
}

export async function fixPackageUsageIndices() {
    console.log('Starting universal package usage index fix...')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Não autorizado.' }

    try {
        // 1. Carregar Catálogo de Serviços e Categorias (para saber o category_id de cada serviço)
        const { data: services } = await supabase
            .from('services')
            .select('id, name, category_id')
        
        const serviceMap: Record<string, string> = {} // service_id -> category_id
        services?.forEach(s => { serviceMap[s.id] = s.category_id })

        // 2. Buscar todos os agendamentos (não cancelados)
        const { data: appts, error: apptError } = await supabase
            .from('appointments')
            .select('id, scheduled_at, package_credit_id, pet_id, service_id, status, pets(customer_id)')
            .not('status', 'eq', 'cancelled')
            .order('scheduled_at', { ascending: true })

        if (apptError || !appts) return { success: false, message: 'Erro ao buscar agendamentos.' }

        // 3. Buscar todos os créditos de pacotes ativos na organização
        const { data: allCredits } = await supabase
            .from('package_credits')
            .select(`
                id, service_id, total_quantity, used_quantity,
                customer_packages!inner (id, pet_id, customer_id, is_active)
            `)
            .eq('customer_packages.is_active', true)

        if (!allCredits) return { success: false, message: 'Nenhum crédito de pacote encontrado.' }

        let linkedCount = 0
        let indexedCount = 0

        // 4. Primeiro Passo: Vincular Órfãos (Busca Inteligente por Categoria)
        for (const appt of appts) {
            if (appt.package_credit_id) continue // Já está vinculado

            const apptCategoryId = serviceMap[appt.service_id]
            if (!apptCategoryId) continue

            const petCustomerId = (appt.pets as any)?.customer_id

            // Buscar um crédito que combine:
            // - Mesmo serviço OU Mesma categoria
            // - Mesmo PET OU Mesmo CLIENTE (se o pacote do pet for nulo)
            const possibleCredits = allCredits.filter(c => {
                const cp = Array.isArray(c.customer_packages) ? c.customer_packages[0] : c.customer_packages;
                if (!cp) return false;

                const creditCategoryId = serviceMap[c.service_id]
                const isSameService = c.service_id === appt.service_id
                const isSameCategory = creditCategoryId === apptCategoryId
                
                const isPetMatch = cp.pet_id === appt.pet_id
                const isCustomerMatch = !cp.pet_id && cp.customer_id === petCustomerId

                return (isSameService || isSameCategory) && (isPetMatch || isCustomerMatch)
            })

            if (possibleCredits.length > 0) {
                const creditToLink = possibleCredits[0]
                const cpMatch = Array.isArray(creditToLink.customer_packages) ? creditToLink.customer_packages[0] : creditToLink.customer_packages;
                const { error: updErr } = await supabase
                    .from('appointments')
                    .update({ package_credit_id: creditToLink.id })
                    .eq('id', appt.id)
                
                if (!updErr) {
                    appt.package_credit_id = creditToLink.id // Atualiza na memória para o passo 5
                    linkedCount++
                }
            }
        }

        // 5. Segundo Passo: Recalcular Índices (1/4, 2/4...)
        // Agrupar agendamentos agora vinculados por credit_id
        const groups: Record<string, any[]> = {}
        appts.forEach(a => {
            if (a.package_credit_id) {
                if (!groups[a.package_credit_id]) groups[a.package_credit_id] = []
                groups[a.package_credit_id].push(a)
            }
        })

        for (const creditId in groups) {
            const sorted = groups[creditId].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
            for (let i = 0; i < sorted.length; i++) {
                const { error: idxErr } = await supabase
                    .from('appointments')
                    .update({ package_usage_index: i + 1 })
                    .eq('id', sorted[i].id)
                
                if (!idxErr) indexedCount++
            }
        }
        return { 
            success: true, 
            message: `Sincronização Concluída! \n- ${linkedCount} novos vínculos realizados.\n- ${indexedCount} posições de progresso (ex: 1/4) calculadas.` 
        }

    } catch (error: any) {
        console.error('Exception in fixPackageUsageIndices:', error)
        return { success: false, message: 'Erro interno: ' + error.message }
    }
}
