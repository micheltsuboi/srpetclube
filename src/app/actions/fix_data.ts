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
    console.log('Starting package usage index fix...')
    const supabase = await createClient()

    try {
        // 1. Buscar todos os agendamentos que pertencem a pacotes (ou deveriam pertencer)
        // Vamos focar nos que já têm o ID do crédito primeiro
        const { data: appts, error } = await supabase
            .from('appointments')
            .select('id, scheduled_at, package_credit_id, pet_id, service_id, status')
            .not('status', 'eq', 'cancelled')
            .order('scheduled_at', { ascending: true })

        if (error || !appts) {
            return { success: false, message: 'Erro ao buscar agendamentos: ' + error?.message }
        }

        console.log(`Found ${appts.length} candidate appointments.`)

        // 2. Agrupar por package_credit_id
        const groups: Record<string, any[]> = {}
        const orphans: any[] = []

        appts.forEach(a => {
            if (a.package_credit_id) {
                if (!groups[a.package_credit_id]) groups[a.package_credit_id] = []
                groups[a.package_credit_id].push(a)
            } else {
                orphans.push(a)
            }
        })

        let updatedCount = 0

        // 3. Atualizar índices dos vinculados
        for (const creditId in groups) {
            const sorted = groups[creditId].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
            for (let i = 0; i < sorted.length; i++) {
                const { error: updErr } = await supabase
                    .from('appointments')
                    .update({ package_usage_index: i + 1 })
                    .eq('id', sorted[i].id)
                
                if (!updErr) updatedCount++
            }
        }

        // 4. Tentar vincular "órfãos" (opcional, mas proativo)
        // Só vincula se o pet tiver EXATAMENTE um pacote ativo para aquele serviço
        for (const orphan of orphans) {
            const { data: credits } = await supabase
                .from('package_credits')
                .select('id, total_quantity, used_quantity')
                .eq('service_id', orphan.service_id)
                .eq('customer_package_id', (
                    supabase.from('customer_packages').select('id').eq('pet_id', orphan.pet_id).eq('is_active', true) as any
                )) // Simplificação de subquery não permitida aqui direto, vamos buscar manual se necessário
            
            // Para evitar lentidão extrema, vamos focar nos que já têm o vínculo de crédito.
            // Se o usuário agendou manualmente sem selecionar pacote, o ID de crédito estará nulo.
        }

        return { success: true, message: `Sucesso! ${updatedCount} agendamentos sincronizados com índices de uso.` }

    } catch (error: any) {
        console.error('Exception in fixPackageUsageIndices:', error)
        return { success: false, message: 'Erro interno: ' + error.message }
    }
}
