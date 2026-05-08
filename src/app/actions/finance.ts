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
                    start_date: data.date ? `${data.date}T12:00:00` : new Date().toISOString()
                }])
                .select()
                .single()

            if (recurringError) {
                console.error('Erro ao salvar despesa fixa:', recurringError)
                return { success: false, message: 'Erro ao cadastrar despesa fixa.' }
            }

            // Agora processa para gerar a primeira transação (mês atual)
            // Chamamos de forma otimizada passando o ID para evitar loop global
            await processRecurringExpenses(recurringData.id)
            
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
                    date: data.date 
                        ? (data.date.includes('T') ? data.date : `${data.date}T12:00:00`)
                        : new Date().toISOString(),
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

/**
 * Função otimizada para sincronizar despesas recorrentes.
 * @param specificId se fornecido, processa apenas este ID (reduz CPU)
 */
export async function processRecurringExpenses(specificId?: string) {
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

        // 1. Busca as despesas fixas ativas (ou apenas uma específica)
        let query = supabase
            .from('recurring_expenses')
            .select('*')
            .eq('org_id', profile.org_id)
            .eq('is_active', true)
        
        if (specificId) {
            query = query.eq('id', specificId)
        }

        const { data: recurringExpenses, error: recurringError } = await query

        if (recurringError || !recurringExpenses) return { success: false, message: 'Nenhuma despesa fixa encontrada.' }

        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth()

        for (const expense of recurringExpenses) {
            // OTIMIZAÇÃO: Buscar apenas a transação mais recente deste recurring_id
            const { data: lastTx } = await supabase
                .from('financial_transactions')
                .select('date')
                .eq('recurring_id', expense.id)
                .order('date', { ascending: false })
                .limit(1)
                .single()

            // Se existir transação anterior, começamos do mês seguinte a ela.
            // Se não, usamos a start_date original.
            let startDate = expense.start_date ? new Date(expense.start_date) : new Date()
            if (lastTx) {
                const lastDate = new Date(lastTx.date)
                startDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 1, 12, 0, 0)
            }
            
            // Loop apenas se a startDate for anterior ou igual ao mês atual
            let checkDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 12, 0, 0)
            const limitDate = new Date(currentYear, currentMonth, 1, 23, 59, 59)

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

                // OTIMIZAÇÃO E PREVENÇÃO DE DUPLICIDADE:
                // Verifica se JÁ EXISTE uma transação para esta despesa neste mês específico
                const startOfMonth = new Date(yearToCheck, monthToCheck, 1).toISOString()
                const endOfMonth = new Date(yearToCheck, monthToCheck + 1, 0, 23, 59, 59).toISOString()
                
                const { data: existingTx } = await supabase
                    .from('financial_transactions')
                    .select('id')
                    .eq('recurring_id', expense.id)
                    .gte('date', startOfMonth)
                    .lte('date', endOfMonth)
                    .limit(1)
                    .single()

                if (existingTx) {
                    // Já existe para este mês (pode ter sido gerado por outro usuário/sessão)
                    checkDate.setMonth(checkDate.getMonth() + 1)
                    continue
                }

                const originalStartDay = expense.start_date ? new Date(expense.start_date).getDate() : 1
                const dayToUse = new Date(yearToCheck, monthToCheck, originalStartDay).getMonth() === monthToCheck 
                    ? originalStartDay 
                    : new Date(yearToCheck, monthToCheck + 1, 0).getDate()
                
                const transactionDate = new Date(yearToCheck, monthToCheck, dayToUse, 12, 0, 0)

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

export async function deleteFinancialTransaction(txId: string, options?: {
    cancelRecurrence?: boolean,
    skipMonth?: boolean
}) {
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, message: 'Não autorizado.' }

        const { data: tx, error: fetchError } = await supabase
            .from('financial_transactions')
            .select('*')
            .eq('id', txId)
            .single()

        if (fetchError || !tx) return { success: false, message: 'Transação não encontrada.' }

        if (tx.recurring_id) {
            if (options?.cancelRecurrence) {
                await supabase
                    .from('recurring_expenses')
                    .update({ is_active: false })
                    .eq('id', tx.recurring_id)
            } else if (options?.skipMonth) {
                // Previne erro de fuso horário ao extrair o mês da transação
                // Se a data vier como string "YYYY-MM-DD...", pegamos o prefixo
                const dateStr = typeof tx.date === 'string' ? tx.date : new Date(tx.date).toISOString()
                const monthKey = dateStr.substring(0, 7) // Pega "YYYY-MM"
                
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
