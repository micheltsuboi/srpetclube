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
            return { success: true, message: 'Transação registrada com sucesso!' }
        }
    } catch (error) {
        console.error('Erro inesperado na action finance:', error)
        return { success: false, message: 'Ocorreu um erro inesperado.' }
    }
}

/**
 * Função que sincroniza as despesas recorrentes com as transações reais.
 * Deve ser chamada toda vez que o dashboard carregar ou quando uma nova fixa for criada.
 */
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

        // 1. Busca todas as despesas fixas ativas
        const { data: recurringExpenses, error: recurringError } = await supabase
            .from('recurring_expenses')
            .select('*')
            .eq('org_id', profile.org_id)
            .eq('is_active', true)

        if (recurringError || !recurringExpenses) return { success: false, message: 'Nenhuma despesa fixa encontrada.' }

        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth()

        // 2. Para cada despesa fixa, verifica os meses faltantes
        for (const expense of recurringExpenses) {
            const startDate = new Date(expense.start_date)
            
            // Loop desde o mês de início até o mês atual
            let checkDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
            const limitDate = new Date(currentYear, currentMonth, 1)

            while (checkDate <= limitDate) {
                const monthToCheck = checkDate.getMonth()
                const yearToCheck = checkDate.getFullYear()

                // Verifica se já existe transação para esta despesa neste mês/ano
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
                    // Não existe transação para este mês. Criamos agora.
                    // Mantemos o dia da data original, mas ajustamos o mês/ano
                    const day = startDate.getDate()
                    const dayToUse = new Date(yearToCheck, monthToCheck, day).getMonth() === monthToCheck 
                        ? day 
                        : new Date(yearToCheck, monthToCheck + 1, 0).getDate() // Ajuste para meses com menos dias
                    
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

                // Incrementa um mês
                checkDate.setMonth(checkDate.getMonth() + 1)
            }
        }

        revalidatePath('/owner/financeiro')
        return { success: true }
    } catch (error) {
        console.error('Erro ao processar recorrência:', error)
        return { success: false }
    }
}
