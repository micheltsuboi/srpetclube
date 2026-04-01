'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addFinancialTransaction(data: {
    type: 'income' | 'expense'
    category: string
    amount: number
    description?: string
    date?: string
    payment_method?: string
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

        const { error: insertError } = await supabase
            .from('financial_transactions')
            .insert([{
                org_id: profile.org_id,
                type: data.type,
                category: data.category,
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
    } catch (error) {
        console.error('Erro inesperado na action finance:', error)
        return { success: false, message: 'Ocorreu um erro inesperado.' }
    }
}
