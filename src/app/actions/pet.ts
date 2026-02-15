'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

interface CreatePetState {
    message: string
    success: boolean
}

export async function createPet(prevState: CreatePetState, formData: FormData) {
    const supabase = await createClient()

    // 1. Verify Authentication & Authorization
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { message: 'Não autorizado. Faça login primeiro.', success: false }
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, org_id')
        .eq('id', user.id)
        .single()

    if (!profile || !['superadmin', 'admin', 'staff'].includes(profile.role)) {
        return { message: 'Permissão negada.', success: false }
    }

    // 2. Extract Data
    const customerId = formData.get('customerId') as string
    const name = formData.get('name') as string
    const species = formData.get('species') as string
    const breed = formData.get('breed') as string
    const gender = formData.get('gender') as string
    const size = formData.get('size') as string
    const weight = formData.get('weight') ? parseFloat(formData.get('weight') as string) : null
    const birthDateStr = formData.get('birthDate') as string
    const isNeutered = formData.get('isNeutered') === 'on'
    const existing_conditions = formData.get('existing_conditions') as string
    const vaccination_up_to_date = formData.get('vaccination_up_to_date') === 'on'

    if (!customerId || !name || !species || !gender || !size) {
        return { message: 'Campos obrigatórios faltando (Tutor, Nome, Espécie, Sexo, Porte).', success: false }
    }

    // 3. Create Pet Record (Using Admin Client to bypass complex policies if needed, though standard client should work for staff)
    const supabaseAdmin = createAdminClient()

    // Validate if customer belongs to org
    const { data: customer } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('id', customerId)
        .eq('org_id', profile.org_id)
        .single()

    if (!customer) {
        return { message: 'Tutor inválido ou não pertence à sua organização.', success: false }
    }

    const photo_url = formData.get('photo_url') as string

    const { error } = await supabaseAdmin
        .from('pets')
        .insert({
            customer_id: customerId,
            name: name,
            species: species as 'dog' | 'cat' | 'other',
            breed: breed || null,
            gender: gender as 'male' | 'female',
            size: size as 'small' | 'medium' | 'large' | 'giant',
            weight_kg: weight,
            birth_date: birthDateStr ? new Date(birthDateStr).toISOString() : null,
            is_neutered: isNeutered,
            existing_conditions: existing_conditions || null,
            vaccination_up_to_date: vaccination_up_to_date,
            photo_url: photo_url || null
        })

    if (error) {
        return { message: `Erro ao cadastrar pet: ${error.message}`, success: false }
    }

    revalidatePath('/owner/pets')
    return { message: 'Pet cadastrado com sucesso!', success: true }
}

export async function updatePet(prevState: CreatePetState, formData: FormData) {
    const supabase = await createClient()

    // Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const id = formData.get('id') as string
    if (!id) return { message: 'ID não fornecido.', success: false }

    const name = formData.get('name') as string
    const species = formData.get('species') as string
    const breed = formData.get('breed') as string
    const gender = formData.get('gender') as string
    const size = formData.get('size') as string
    const weight = formData.get('weight') ? parseFloat(formData.get('weight') as string) : null
    const birthDateStr = formData.get('birthDate') as string
    const isNeutered = formData.get('isNeutered') === 'on'
    const customerId = formData.get('customerId') as string
    const existing_conditions = formData.get('existing_conditions') as string
    const vaccination_up_to_date = formData.get('vaccination_up_to_date') === 'on'
    const photo_url = formData.get('photo_url') as string

    const supabaseAdmin = createAdminClient()

    // Update
    const { error } = await supabaseAdmin
        .from('pets')
        .update({
            name,
            species: species as 'dog' | 'cat' | 'other',
            breed: breed || null,
            gender: gender as 'male' | 'female',
            size: size as 'small' | 'medium' | 'large' | 'giant',
            weight_kg: weight,
            birth_date: birthDateStr ? new Date(birthDateStr).toISOString() : null,
            is_neutered: isNeutered,
            customer_id: customerId,
            existing_conditions: existing_conditions || null,
            vaccination_up_to_date: vaccination_up_to_date,
            photo_url: photo_url || null
        })
        .eq('id', id)

    if (error) {
        return { message: `Erro ao atualizar pet: ${error.message}`, success: false }
    }

    revalidatePath('/owner/pets')
    return { message: 'Pet atualizado com sucesso!', success: true }
}

export async function deletePet(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const supabaseAdmin = createAdminClient()
    const { error } = await supabaseAdmin.from('pets').delete().eq('id', id)

    if (error) {
        return { message: `Erro ao excluir: ${error.message}`, success: false }
    }

    revalidatePath('/owner/pets')
    return { message: 'Pet excluído com sucesso!', success: true }
}
