'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getPetshopHistory(petId: string) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Unauthorized')

        const { data, error } = await supabase
            .from('petshop_sales')
            .select('id, product_name, quantity, unit_price, total_price, discount_percent, payment_status, payment_method, created_at, updated_at, financial_transactions(id, date, payment_method)')
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

        revalidatePath('/owner/petshop')
        revalidatePath('/owner/financeiro')
        revalidatePath('/owner/pets')
        revalidatePath('/owner')

        return { success: true, message: 'Pagamento registrado com sucesso!' }
    } catch (error: any) {
        console.error('Error processing payment:', error)
        return { success: false, message: 'Ocorreu um erro ao processar o pagamento.' }
    }
}

export async function deletePetshopSale(saleId: string) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, message: 'Não autorizado.' }
        }

        // 1. Get the sale to see if it has a transaction
        const { data: sale, error: saleError } = await supabase
            .from('petshop_sales')
            .select('financial_transaction_id, product_id, quantity')
            .eq('id', saleId)
            .single()

        if (saleError || !sale) {
            return { success: false, message: 'Venda não encontrada.' }
        }

        // 2. Delete financial transaction if exists
        if (sale.financial_transaction_id) {
            await supabase
                .from('financial_transactions')
                .delete()
                .eq('id', sale.financial_transaction_id)
        }

        // 3. Restore stock
        const { data: product } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', sale.product_id)
            .single()
            
        if (product) {
            await supabase
                .from('products')
                .update({ stock_quantity: product.stock_quantity + sale.quantity })
                .eq('id', sale.product_id)
        }

        // 4. Delete the sale
        const { error: deleteError } = await supabase
            .from('petshop_sales')
            .delete()
            .eq('id', saleId)

        if (deleteError) {
            console.error('Error deleting sale:', deleteError)
            return { success: false, message: 'Erro ao excluir produto.' }
        }

        revalidatePath('/owner/petshop')
        revalidatePath('/owner/financeiro')
        revalidatePath('/owner/pets')
        revalidatePath('/owner')

        return { success: true, message: 'Produto removido com sucesso!' }
    } catch (error: any) {
        console.error('Error deleting sale:', error)
        return { success: false, message: 'Ocorreu um erro ao excluir.' }
    }
}

export async function createPetshopSale(saleData: {
    pet_id: string | null;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    discount_percent?: number;
    payment_status: 'paid' | 'pending';
    payment_method: string;
}) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, message: 'Não autorizado.' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()

        if (!profile?.org_id) return { success: false, message: 'Erro de organização.' }

        const safeQty = Math.max(1, Math.floor(Number(saleData.quantity) || 1))
        const safeUnitPrice = Math.max(0, Number(Number(saleData.unit_price || 0).toFixed(2)))
        const safeTotalPrice = Math.max(0, Number(Number(saleData.total_price || 0).toFixed(2)))
        const safeDiscountPercent = Math.min(100, Math.max(0, Number(Number(saleData.discount_percent || 0).toFixed(2))))
        const safePaymentMethod = saleData.payment_method || 'cash'

        let transactionId: string | null = null

        // 1. If paid and positive value, create financial transaction first
        if (saleData.payment_status === 'paid' && safeTotalPrice > 0) {
            const { data: txData, error: txError } = await supabase
                .from('financial_transactions')
                .insert({
                    org_id: profile.org_id,
                    type: 'income',
                    category: 'Venda Produto',
                    amount: safeTotalPrice,
                    description: `Venda de ${safeQty}x ${saleData.product_name}`,
                    payment_method: safePaymentMethod,
                    created_by: user.id,
                    date: new Date().toISOString()
                })
                .select()
                .single()

            if (txError || !txData) {
                console.error('Error creating transaction for petshop sale:', txError)
                return { success: false, message: 'Erro ao registrar transação no financeiro.' }
            }
            transactionId = txData.id
        }

        // 2. Insert Sale (if it fails, rollback created transaction to avoid orphan income)
        const { error: saleError } = await supabase
            .from('petshop_sales')
            .insert({
                org_id: profile.org_id,
                pet_id: saleData.pet_id || null,
                product_id: saleData.product_id,
                product_name: saleData.product_name,
                quantity: safeQty,
                unit_price: safeUnitPrice,
                total_price: safeTotalPrice,
                discount_percent: safeDiscountPercent,
                payment_status: saleData.payment_status,
                payment_method: safePaymentMethod,
                financial_transaction_id: transactionId
            })

        if (saleError) {
            if (transactionId) {
                await supabase.from('financial_transactions').delete().eq('id', transactionId)
            }
            throw saleError
        }

        // 3. Update Stock
        const { data: product } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', saleData.product_id)
            .single()

        if (product) {
            await supabase
                .from('products')
                .update({ stock_quantity: product.stock_quantity - safeQty })
                .eq('id', saleData.product_id)
        }

        revalidatePath('/owner/petshop')
        revalidatePath('/owner/financeiro')
        revalidatePath('/owner/pets')
        revalidatePath('/owner')

        return { success: true, message: 'Venda registrada com sucesso!' }
    } catch (error: any) {
        console.error('Error creating petshop sale:', error)
        return { success: false, message: 'Erro ao registrar venda.' }
    }
}
