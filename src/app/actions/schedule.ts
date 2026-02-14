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
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return { message: 'Não autorizado.', success: false }

        const { data: profile, error: profError } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()

        if (profError || !profile?.org_id) {
            console.error('[CreateScheduleBlock] Profile Fetch Error:', profError)
            return { message: 'Erro de organização ou permissão.', success: false }
        }

        const reason = formData.get('reason') as string
        const start_at = formData.get('start_at') as string
        const end_at = formData.get('end_at') as string

        // Allowed Species Logic
        const allowedSpeciesRaw = formData.getAll('allowed_species') as string[]
        // If empty or contains 'both' (though UI might send explicit array), we treat as NULL (block all)
        // OR better: if user selects specific species, we save them. If user selects "Block Everything", we save NULL.
        // Let's check how the UI will send it.
        // Assuming checkboxes: allowed_species=['dog'] or allowed_species=['dog', 'cat']

        // If NO allowed_species provided, it means it's a FULL BLOCK (default behavior).
        // If allowed_species provided, checking logic applies.
        let allowed_species: string[] | null = allowedSpeciesRaw.length > 0 ? allowedSpeciesRaw : null


        if (!reason || !start_at || !end_at) {
            return { message: 'Preencha todos os campos.', success: false }
        }

        // Ensure timezone offset is included if not present to match appointment logic
        // We use -03:00 (Brasilia time) as the standard for the application
        function formatTS(ts: string) {
            if (!ts) return ts
            // If it already has an offset (+ or - after T) or Z, return it
            const hasOffset = ts.includes('Z') || (ts.includes('T') && (ts.split('T')[1].includes('+') || ts.split('T')[1].includes('-')))
            if (hasOffset) return ts
            // Otherwise, assume it's YYYY-MM-DDTHH:MM and append :00-03:00
            if (ts.includes('T')) return `${ts}:00-03:00`
            return ts
        }

        const finalStart = formatTS(start_at)
        const finalEnd = formatTS(end_at)

        console.log('[CreateScheduleBlock] Executing for Org:', profile.org_id, 'Dates:', { finalStart, finalEnd }, 'Allowed:', allowed_species)

        const { error } = await supabase.from('schedule_blocks').insert({
            org_id: profile.org_id,
            start_at: finalStart,
            end_at: finalEnd,
            reason,
            allowed_species,
            created_by: user.id
        })

        if (error) {
            console.error('[CreateScheduleBlock] Insert Error:', error)
            return { message: `Erro ao salvar bloqueio: ${error.message} (Code: ${error.code})`, success: false }
        }

        revalidatePath('/owner/agenda')
        return { message: 'Horário bloqueado com sucesso.', success: true }
    } catch (e: any) {
        console.error('[CreateScheduleBlock] Global Catch:', e)
        return { message: `Erro inesperado: ${e.message || 'Erro interno'}`, success: false }
    }
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
        .lt('start_at', endStr)
        .gt('end_at', startStr)
        .order('start_at')

    return data || []
}
