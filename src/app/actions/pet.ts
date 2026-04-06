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
    const responsible2_name = formData.get('responsible2_name') as string
    const responsible2_phone = formData.get('responsible2_phone') as string
    const color = formData.get('color') as string
    const characteristics = formData.get('characteristics') as string
    // const vaccination_up_to_date = formData.get('vaccination_up_to_date') === 'on' (Remover de UI)

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
    const vaccine_card_urls = formData.get('vaccine_card_urls') ? JSON.parse(formData.get('vaccine_card_urls') as string) : []
    const isAdapted = formData.get('is_adapted') === 'on'

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
            responsible2_name: responsible2_name || null,
            responsible2_phone: responsible2_phone || null,
            photo_url: photo_url || null,
            vaccine_card_urls: vaccine_card_urls,
            is_adapted: isAdapted,
            color: color || null,
            characteristics: characteristics || null
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
    const responsible2_name = formData.get('responsible2_name') as string
    const responsible2_phone = formData.get('responsible2_phone') as string
    const photo_url = formData.get('photo_url') as string
    const vaccine_card_urls = formData.get('vaccine_card_urls') ? JSON.parse(formData.get('vaccine_card_urls') as string) : []
    const isAdapted = formData.get('is_adapted') === 'on'
    const color = formData.get("color") as string;
    const characteristics = formData.get("characteristics") as string;

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
            responsible2_name: responsible2_name || null,
            responsible2_phone: responsible2_phone || null,
            photo_url: photo_url || null,
            vaccine_card_urls: vaccine_card_urls,
            is_adapted: isAdapted,
            color: color || null,
            characteristics: characteristics || null
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

export async function createPetByTutor(prevState: CreatePetState, formData: FormData) {
    const supabase = await createClient()

    // 1. Verify Authentication & Authorization (Customer)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { message: 'Não autorizado. Faça login primeiro.', success: false }
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, org_id')
        .eq('id', user.id)
        .single()

    if (!profile) {
        return { message: 'Erro ao verificar permissão.', success: false }
    }

    // 2. Get Customer Record
    const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!customer) {
        return { message: 'Cadastro de tutor incompleto.', success: false }
    }

    // 3. Extract Data
    const name = formData.get('name') as string
    const species = formData.get('species') as string
    const breed = formData.get('breed') as string
    const gender = formData.get('gender') as string
    const size = formData.get('size') as string
    const weight = formData.get('weight') ? parseFloat(formData.get('weight') as string) : null
    const birthDateStr = formData.get('birthDate') as string
    const isNeutered = formData.get('isNeutered') === 'on'
    const existing_conditions = formData.get('existing_conditions') as string
    const responsible2_name = formData.get('responsible2_name') as string
    const responsible2_phone = formData.get('responsible2_phone') as string
    const photo_url = formData.get('photo_url') as string
    const vaccine_card_urls = formData.get('vaccine_card_urls') ? JSON.parse(formData.get('vaccine_card_urls') as string) : []
    const color = formData.get("color") as string;
    const characteristics = formData.get("characteristics") as string;

    if (!name || !species || !gender || !size) {
        return { message: 'Nome, Espécie, Sexo e Porte são obrigatórios.', success: false }
    }

    const supabaseAdmin = createAdminClient()

    // 4. Create Pet
    const { error } = await supabaseAdmin
        .from('pets')
        .insert({
            customer_id: customer.id,
            name: name,
            species: species as 'dog' | 'cat' | 'other',
            breed: breed || null,
            gender: gender as 'male' | 'female',
            size: size as 'small' | 'medium' | 'large' | 'giant',
            weight_kg: weight,
            birth_date: birthDateStr ? new Date(birthDateStr).toISOString() : null,
            is_neutered: isNeutered,
            existing_conditions: existing_conditions || null,
            responsible2_name: responsible2_name || null,
            responsible2_phone: responsible2_phone || null,
            photo_url: photo_url || null,
            vaccine_card_urls: vaccine_card_urls,
            color: color || null,
            characteristics: characteristics || null
        })

    if (error) {
        return { message: `Erro ao cadastrar pet: ${error.message}`, success: false }
    }

    revalidatePath('/tutor')
    return { message: 'Seu pet foi cadastrado com sucesso!', success: true }
}

export async function togglePetAdaptation(petId: string, isAdapted: boolean) {
    const supabase = await createClient()

    // Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || !['superadmin', 'admin', 'staff'].includes(profile.role)) {
        return { message: 'Permissão negada.', success: false }
    }

    const supabaseAdmin = createAdminClient()

    // Verify pet exists
    const { data: pet } = await supabaseAdmin
        .from('pets')
        .select('id')
        .eq('id', petId)
        .single()

    if (!pet) return { message: 'Pet não encontrado.', success: false }

    const { error } = await supabaseAdmin
        .from('pets')
        .update({ is_adapted: isAdapted })
        .eq('id', petId)

    if (error) {
        return { message: `Erro ao atualizar adaptação: ${error.message}`, success: false }
    }

    revalidatePath('/owner/pets')
    revalidatePath('/tutor/booking')

    return { message: 'Status de adaptação atualizado!', success: true }
}

export async function updatePetVaccineCard(petId: string, urls: string[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const supabaseAdmin = createAdminClient()
    const { error } = await supabaseAdmin
        .from('pets')
        .update({ vaccine_card_urls: urls })
        .eq('id', petId)

    if (error) {
        return { message: `Erro ao atualizar carteira: ${error.message}`, success: false }
    }

    revalidatePath('/owner/pets')
    return { message: 'Carteira de vacinação atualizada!', success: true }
}

export async function searchPets(query: string, limit = 50) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

    if (!profile?.org_id) return []

    // Usar o novo RPC que suporta unaccent
    const { data: results, error } = await supabase
        .rpc('search_pets_rpc', {
            search_term: query,
            organization_id: profile.org_id,
            p_limit: limit
        })

    if (error) {
        console.error('SERVER ACTION: Error searching pets via RPC:', error)
        return []
    }

    // Remapear para o formato esperado pela UI (especialmente o objeto customers)
    return (results || []).map((p: any) => ({
        ...p,
        customers: {
            id: p.customer_id,
            name: p.customer_name,
            phone_1: p.customer_phone
        }
    }))
}
