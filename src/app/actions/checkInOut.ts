'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Check-in an appointment (mark actual arrival time)
 */
export async function checkInAppointment(appointmentId: string) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, message: 'Não autorizado.' }
        }

        const { error } = await supabase
            .from('appointments')
            .update({ actual_check_in: new Date().toISOString() })
            .eq('id', appointmentId)

        if (error) {
            console.error('[Check-in] Error:', error)
            return { success: false, message: 'Erro ao fazer check-in' }
        }

        revalidatePath('/owner/creche')
        revalidatePath('/owner/banho-tosa')
        revalidatePath('/owner/agenda')
        return { success: true, message: 'Check-in realizado com sucesso!' }

    } catch (error) {
        console.error('[Check-in] Unexpected error:', error)
        return { success: false, message: 'Erro inesperado' }
    }
}

/**
 * Check-out an appointment (mark actual departure time)
 * Automatically marks any linked package slot as 'done'
 */
export async function checkOutAppointment(appointmentId: string) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, message: 'Não autorizado.' }
        }

        const { error } = await supabase
            .from('appointments')
            .update({
                actual_check_out: new Date().toISOString(),
                status: 'done'
            })
            .eq('id', appointmentId)

        if (error) {
            console.error('[Check-out] Error:', error)
            return { success: false, message: 'Erro ao fazer check-out' }
        }

        // Marcar sessão do pacote como realizada automaticamente, se houver
        try {
            await supabase.rpc('complete_package_slot', {
                p_appointment_id: appointmentId
            })
        } catch (slotErr) {
            // Não bloqueia o checkout se a marcação de slot falhar
            console.warn('[Check-out] Slot update failed (non-critical):', slotErr)
        }

        revalidatePath('/owner/creche')
        revalidatePath('/owner/banho-tosa')
        revalidatePath('/owner/agenda')
        revalidatePath('/owner/pets')
        return { success: true, message: 'Check-out realizado com sucesso!' }

    } catch (error) {
        console.error('[Check-out] Unexpected error:', error)
        return { success: false, message: 'Erro inesperado' }
    }
}
