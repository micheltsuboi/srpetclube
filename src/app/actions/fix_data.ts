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
