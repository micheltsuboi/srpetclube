'use server'

import { createClient } from '@/lib/supabase/server'

export async function getPetshopHistory(petId: string) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Unauthorized')

        const { data, error } = await supabase
            .from('petshop_sales')
            .select('id, product_name, quantity, total_price, payment_status, created_at')
            .eq('pet_id', petId)
            .order('created_at', { ascending: false })

        if (error) throw error
        return { success: true, data }
    } catch (error: any) {
        console.error('Error fetching petshop history:', error)
        return { success: false, data: [] }
    }
}

export async function payPetshopSale(saleId: string, paymentMethod: string) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, message: 'Não autorizado.' }
        }

        // 1. Get the sale
        const { data: sale, error: saleError } = await supabase
            .from('petshop_sales')
            .select('id, org_id, total_price, quantity, product_name, payment_status')
            .eq('id', saleId)
            .single()

        if (saleError || !sale) {
            return { success: false, message: 'Venda não encontrada.' }
        }

        if (sale.payment_status === 'paid') {
            return { success: false, message: 'Esta venda já está paga.' }
        }

        // 2. Create financial transaction
        const { data: tx, error: txError } = await supabase
            .from('financial_transactions')
            .insert({
                org_id: sale.org_id,
                type: 'income',
                category: 'Venda Produto',
                amount: sale.total_price,
                description: `Pagamento Pendente: Venda de ${sale.quantity}x ${sale.product_name}`,
                payment_method: paymentMethod,
                created_by: user.id,
                date: new Date().toISOString().split('T')[0] + 'T12:00:00'
            })
            .select()
            .single()

        if (txError) {
            console.error('Error creating transaction:', txError)
            return { success: false, message: 'Erro ao gerar transação financeira.' }
        }

        // 3. Update sale status
        const { error: updateError } = await supabase
            .from('petshop_sales')
            .update({
                payment_status: 'paid',
                payment_method: paymentMethod,
                financial_transaction_id: tx.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', saleId)

        if (updateError) {
            console.error('Error updating sale:', updateError)
            return { success: false, message: 'Financeiro gerado, mas erro ao atualizar status do produto.' }
        }

        return { success: true, message: 'Pagamento registrado com sucesso!' }
    } catch (error: any) {
        console.error('Error processing payment:', error)
        return { success: false, message: 'Ocorreu um erro ao processar o pagamento.' }
    }
}
