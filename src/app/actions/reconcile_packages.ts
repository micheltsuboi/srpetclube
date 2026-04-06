'use server'
import { createClient } from '@/lib/supabase/server'
import { addFinancialTransaction } from '@/app/actions/finance'

export async function reconcilePaidPackages() {
    const supabase = await createClient()

    // 1. Buscar pacotes pagos
    const { data: paidPackages, error } = await supabase
        .from('customer_packages')
        .select(`
            id, total_paid, calculated_price, purchased_at, payment_method, org_id,
            service_packages(name),
            pets(name),
            customers(name)
        `)
        .eq('payment_status', 'paid')

    if (error) {
        console.error('Erro ao buscar pacotes pagos:', error)
        return { success: false, message: error.message }
    }

    console.log(`Encontrados ${paidPackages?.length} pacotes pagos. Verificando faturamento...`)

    let createdCount = 0

    for (const pkg of paidPackages || []) {
        // 2. Verificar se já existe uma transação para este pacote
        // Usamos o campo description ou reference_id para rastrear? 
        // No sistema atual, usamos description. Vamos buscar por Cliente ID ou nome do pet no description.
        
        const petName = Array.isArray(pkg.pets) ? pkg.pets[0]?.name : pkg.pets?.name
        const customerName = Array.isArray(pkg.customers) ? pkg.customers[0]?.name : pkg.customers?.name
        
        const descriptionMatch = `Cliente ID: ${customerName || ''}`
        const petMatch = `Pet: ${petName || ''}`

        const { data: existingTx } = await supabase
            .from('financial_transactions')
            .select('id')
            .eq('org_id', pkg.org_id)
            .or(`description.ilike.%${pkg.id}%,description.ilike.%${petMatch}%`)
            .limit(1)

        if (!existingTx || existingTx.length === 0) {
            // 3. Criar transação faltante
            const amount = pkg.total_paid || pkg.calculated_price || 0
            const packageName = Array.isArray(pkg.service_packages) 
                ? pkg.service_packages[0]?.name 
                : (pkg.service_packages as any)?.name || 'Pacote'
            
            const targetName = petName || customerName || 'Cliente'

            await addFinancialTransaction({
                type: 'income',
                category: 'Pacotes',
                name: `Venda de Pacote: ${packageName} (Retroativo)`,
                amount: amount,
                date: pkg.purchased_at, // DATA ORIGINAL
                payment_method: pkg.payment_method || 'other',
                description: `Vinculado ao pacote ID: ${pkg.id} - Pet: ${targetName}`
            })
            createdCount++
        }
    }

    return { success: true, message: `Reconciliação concluída. ${createdCount} transações criadas.` }
}
