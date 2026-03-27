'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createVaccine(formData: FormData) {
    try {
        const supabase = await createClient()

        const pet_id = formData.get('pet_id') as string
        const name = formData.get('name') as string
        const expiry_date = formData.get('expiry_date') as string
        const application_date = formData.get('application_date') as string | null
        const batch_number = formData.get('batch_number') as string | null

        if (!pet_id || !name || !expiry_date) {
            return { success: false, message: 'Campos obrigatórios faltando.' }
        }

        const { error } = await supabase
            .from('pet_vaccines')
            .insert({
                pet_id,
                name,
                expiry_date,
                application_date: application_date || null,
                batch_number: batch_number || null
            })

        if (error) {
            console.error('Error creating vaccine:', error)
            return { success: false, message: 'Erro ao cadastrar vacina.' }
        }

        revalidatePath('/owner/pets')
        return { success: true, message: 'Vacina cadastrada com sucesso!' }
    } catch (error) {
        console.error('Unexpected error:', error)
        return { success: false, message: 'Erro inesperado.' }
    }
}

export async function deleteVaccine(id: string) {
    try {
        const supabase = await createClient()

        const { error } = await supabase
            .from('pet_vaccines')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Error deleting vaccine:', error)
            return { success: false, message: 'Erro ao excluir vacina.' }
        }

        revalidatePath('/owner/pets')
        return { success: true, message: 'Vacina removida.' }
    } catch (error) {
        return { success: false, message: 'Erro inesperado.' }
    }
}

export async function getPetVaccines(petId: string) {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('pet_vaccines')
            .select('id, name, expiry_date, application_date, batch_number')
            .eq('pet_id', petId)
            .order('expiry_date', { ascending: true })

        if (error) throw error
        return data || []
    } catch (error) {
        console.error('Error fetching vaccines:', error)
        return []
    }
}
