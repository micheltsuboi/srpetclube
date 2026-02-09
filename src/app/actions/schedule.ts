'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface ActionState {
    message: string
    success: boolean
}

interface ScheduleBlock {
    id?: string
    start_at: string
    end_at: string
    reason: string
}

export async function createScheduleBlock(prevState: any, formData: FormData): Promise<ActionState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { message: 'Não autorizado.', success: false }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) return { message: 'Erro de organização.', success: false }

    const reason = formData.get('reason') as string
    const start_at = formData.get('start_at') as string
    const end_at = formData.get('end_at') as string

    if (!reason || !start_at || !end_at) {
        return { message: 'Preencha todos os campos.', success: false }
    }

    const { error } = await supabase.from('schedule_blocks').insert({
        org_id: profile.org_id,
        start_at,
        end_at,
        reason,
        created_by: user.id
    })

    if (error) {
        console.error('Erro ao criar bloqueio:', error)
        return { message: 'Erro ao bloquear horário.', success: false }
    }

    revalidatePath('/owner/agenda')
    return { message: 'Horário bloqueado com sucesso.', success: true }
}

export async function deleteScheduleBlock(id: string): Promise<ActionState> {
    const supabase = await createClient()
    const { error } = await supabase.from('schedule_blocks').delete().eq('id', id)

    if (error) return { message: 'Erro ao remover bloqueio.', success: false }

    revalidatePath('/owner/agenda')
    return { message: 'Bloqueio removido.', success: true }
}

export async function getScheduleBlocks(startStr: string, endStr: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

    const { data } = await supabase
        .from('schedule_blocks')
        .select('*')
        .eq('org_id', profile?.org_id!)
        .gte('end_at', startStr) // Começa depois do início do range ou termina dps
        .lte('start_at', endStr) // Termina antes do fim do range ou começa antes
        .order('start_at')

    return data || []
}
