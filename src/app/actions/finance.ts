'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addFinancialTransaction(data: {
    type: 'income' | 'expense'
    category: string
    name: string
    amount: number
    description?: string
    date?: string
    payment_method?: string
    is_recurring?: boolean
}) {
    const supabase = await createClient()

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return { success: false, message: 'Usuário não autenticado.' }
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()

        if (profileError || !profile?.org_id) {
            return { success: false, message: 'Perfil não encontrado ou sem organização vinculada.' }
        }

        if (data.is_recurring && data.type === 'expense') {
            // Se for despesa fixa, salva na tabela de templates
            const { data: recurringData, error: recurringError } = await supabase
                .from('recurring_expenses')
                .insert([{
                    org_id: profile.org_id,
                    name: data.name,
                    category: data.category,
                    amount: data.amount,
                    description: data.description,
                    payment_method: data.payment_method,
                    start_date: data.date || new Date().toISOString()
                }])
                .select()
                .single()

            if (recurringError) {
                console.error('Erro ao salvar despesa fixa:', recurringError)
                return { success: false, message: 'Erro ao cadastrar despesa fixa.' }
            }

            // Agora processa para gerar a primeira transação (mês atual)
            await processRecurringExpenses()
            
            revalidatePath('/owner/financeiro')
            revalidatePath('/owner')
            return { success: true, message: 'Despesa fixa cadastrada com sucesso!' }
        } else {
            // Se for despesa variável (normal)
            const { error: insertError } = await supabase
                .from('financial_transactions')
                .insert([{
                    org_id: profile.org_id,
                    type: data.type,
                    category: data.category,
                    name: data.name,
                    amount: data.amount,
                    description: data.description,
                    date: data.date || new Date().toISOString(),
                    payment_method: data.payment_method || 'cash',
                    created_by: user.id
                }])

            if (insertError) {
                console.error('Erro ao inserir transação:', insertError)
                return { success: false, message: 'Erro ao registrar transação no banco de dados.' }
            }

            revalidatePath('/owner/financeiro')
            revalidatePath('/owner')
            return { success: true, message: 'Transação registrada com sucesso!' }
        }
    } catch (error) {
        console.error('Erro inesperado na action finance:', error)
        return { success: false, message: 'Ocorreu um erro inesperado.' }
    }
}

export async function processRecurringExpenses() {
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, message: 'Usuário não autenticado.' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()

        if (!profile?.org_id) return { success: false, message: 'Organização não encontrada.' }

        const { data: recurringExpenses, error: recurringError } = await supabase
            .from('recurring_expenses')
            .select('*')
            .eq('org_id', profile.org_id)
            .eq('is_active', true)

        if (recurringError || !recurringExpenses) return { success: false, message: 'Nenhuma despesa fixa encontrada.' }

        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth()

        for (const expense of recurringExpenses) {
            const startDate = new Date(expense.start_date)
            let checkDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
            const limitDate = new Date(currentYear, currentMonth, 1)

            while (checkDate <= limitDate) {
                const monthToCheck = checkDate.getMonth()
                const yearToCheck = checkDate.getFullYear()
                const monthKey = `${yearToCheck}-${String(monthToCheck + 1).padStart(2, '0')}`

                // Verifica se este mês está na lista de "pulados"
                const skipped = expense.skipped_months || []
                if (skipped.includes(monthKey)) {
                    checkDate.setMonth(checkDate.getMonth() + 1)
                    continue
                }

                const startOfMonth = new Date(yearToCheck, monthToCheck, 1).toISOString()
                const endOfMonth = new Date(yearToCheck, monthToCheck + 1, 0, 23, 59, 59).toISOString()

                const { data: existing, error: checkError } = await supabase
                    .from('financial_transactions')
                    .select('id')
                    .eq('org_id', profile.org_id)
                    .eq('recurring_id', expense.id)
                    .gte('date', startOfMonth)
                    .lte('date', endOfMonth)
                    .limit(1)

                if (!checkError && existing?.length === 0) {
                    const day = startDate.getDate()
                    const dayToUse = new Date(yearToCheck, monthToCheck, day).getMonth() === monthToCheck 
                        ? day 
                        : new Date(yearToCheck, monthToCheck + 1, 0).getDate()
                    
                    const transactionDate = new Date(yearToCheck, monthToCheck, dayToUse)

                    await supabase.from('financial_transactions').insert([{
                        org_id: profile.org_id,
                        type: 'expense',
                        category: expense.category,
                        name: expense.name,
                        amount: expense.amount,
                        description: `[Fixa] ${expense.description || ''}`,
                        payment_method: expense.payment_method,
                        date: transactionDate.toISOString(),
                        created_by: user.id,
                        recurring_id: expense.id
                    }])
                }
                checkDate.setMonth(checkDate.getMonth() + 1)
            }
        }

        revalidatePath('/owner/financeiro')
        revalidatePath('/owner')
        return { success: true }
    } catch (error) {
        console.error('Erro ao processar recorrência:', error)
        return { success: false }
    }
}

/**
 * Action para excluir transação com suporte a recorrências
 */
export async function deleteFinancialTransaction(txId: string, options?: {
    cancelRecurrence?: boolean,
    skipMonth?: boolean
}) {
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, message: 'Não autorizado.' }

        // 1. Busca os detalhes da transação antes de excluir
        const { data: tx, error: fetchError } = await supabase
            .from('financial_transactions')
            .select('*')
            .eq('id', txId)
            .single()

        if (fetchError || !tx) return { success: false, message: 'Transação não encontrada.' }

        if (tx.recurring_id) {
            if (options?.cancelRecurrence) {
                // Desativa a recorrência futura
                await supabase
                    .from('recurring_expenses')
                    .update({ is_active: false })
                    .eq('id', tx.recurring_id)
            } else if (options?.skipMonth) {
                // Adiciona este mês à lista de meses pulados para não recriar
                const txDate = new Date(tx.date)
                const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`
                
                // Busca os meses já pulados
                const { data: rec } = await supabase
                    .from('recurring_expenses')
                    .select('skipped_months')
                    .eq('id', tx.recurring_id)
                    .single()
                
                const currentSkipped = rec?.skipped_months || []
                if (!currentSkipped.includes(monthKey)) {
                    await supabase
                        .from('recurring_expenses')
                        .update({ skipped_months: [...currentSkipped, monthKey] })
                        .eq('id', tx.recurring_id)
                }
            }
        }

        // 2. Exclui a transação
        const { error: deleteError } = await supabase
            .from('financial_transactions')
            .delete()
            .eq('id', txId)

        if (deleteError) throw deleteError

        revalidatePath('/owner/financeiro')
        revalidatePath('/owner')
        return { success: true, message: 'Operação realizada com sucesso.' }
    } catch (error) {
        console.error('Erro ao excluir transação:', error)
        return { success: false, message: 'Erro ao processar exclusão.' }
    }
}
