'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface CreateServiceState {
    message: string
    success: boolean
}

export async function createService(prevState: CreateServiceState, formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) return { message: 'Erro de organização.', success: false }

    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const base_price = parseFloat(formData.get('base_price') as string)
    // Legacy category field - we can set a default or try to get name from ID if needed. 
    // For now, let's allow the frontend to send a fallback string or just use 'other'.
    // Better: let's try to pass the category name if possible, or just ignore if DB allows null.
    // Assuming DB 'category' column might be NOT NULL, let's keep sending a value.
    // Legacy category mapping
    const rawCategoryName = (formData.get('category_name') as string || '').toLowerCase()
    let legacyCategory = 'outro'

    if (rawCategoryName.includes('banho') && rawCategoryName.includes('tosa')) legacyCategory = 'banho_tosa'
    else if (rawCategoryName.includes('banho')) legacyCategory = 'banho'
    else if (rawCategoryName.includes('tosa')) legacyCategory = 'tosa'
    else if (rawCategoryName.includes('creche')) legacyCategory = 'creche'
    else if (rawCategoryName.includes('hospedagem') || rawCategoryName.includes('hotel')) legacyCategory = 'hotel'
    else if (rawCategoryName.includes('veterinario') || rawCategoryName.includes('consulta')) legacyCategory = 'veterinario'

    const category_id = formData.get('category_id') as string

    // Duration Logic
    const rawHours = formData.get('duration_hours') as string
    const rawMinutes = formData.get('duration_minutes_part') as string

    let duration_minutes: number | null = null

    if (rawHours !== '' || rawMinutes !== '') {
        const h = parseInt(rawHours) || 0
        const m = parseInt(rawMinutes) || 0
        duration_minutes = (h * 60) + m
    }

    const { error } = await supabase.from('services').insert({
        org_id: profile.org_id,
        name,
        description,
        base_price,
        category: legacyCategory, // Legacy support
        category_id,
        duration_minutes
    })

    if (error) return { message: error.message, success: false }
    revalidatePath('/owner/services')
    return { message: 'Serviço criado!', success: true }
}

export async function updateService(prevState: CreateServiceState, formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const id = formData.get('id') as string
    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const base_price = parseFloat(formData.get('base_price') as string)

    // Legacy mapping
    const rawCategoryName = (formData.get('category_name') as string || '').toLowerCase()
    let legacyCategory = 'outro'

    if (rawCategoryName.includes('banho') && rawCategoryName.includes('tosa')) legacyCategory = 'banho_tosa'
    else if (rawCategoryName.includes('banho')) legacyCategory = 'banho'
    else if (rawCategoryName.includes('tosa')) legacyCategory = 'tosa'
    else if (rawCategoryName.includes('creche')) legacyCategory = 'creche'
    else if (rawCategoryName.includes('hospedagem') || rawCategoryName.includes('hotel')) legacyCategory = 'hotel'
    else if (rawCategoryName.includes('veterinario') || rawCategoryName.includes('consulta')) legacyCategory = 'veterinario'

    const category_id = formData.get('category_id') as string

    // Duration Logic
    const rawHours = formData.get('duration_hours') as string
    const rawMinutes = formData.get('duration_minutes_part') as string

    let duration_minutes: number | null = null

    if (rawHours !== '' || rawMinutes !== '') {
        const h = parseInt(rawHours) || 0
        const m = parseInt(rawMinutes) || 0
        duration_minutes = (h * 60) + m
    }

    const { error } = await supabase.from('services').update({
        name,
        description,
        base_price,
        category: legacyCategory,
        category_id,
        duration_minutes
    }).eq('id', id)

    if (error) return { message: error.message, success: false }
    revalidatePath('/owner/services')
    return { message: 'Serviço atualizado!', success: true }
}

export async function deleteService(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase.from('services').delete().eq('id', id)
    if (error) return { message: error.message, success: false }
    revalidatePath('/owner/services')
    return { message: 'Serviço excluído.', success: true }
}

// Pricing Rules Actions
export async function createPricingRule(prevState: CreateServiceState | null, formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const service_id = formData.get('service_id') as string
    const price = parseFloat(formData.get('price') as string)
    // Optional filters
    const weight_min = formData.get('weight_min') ? parseFloat(formData.get('weight_min') as string) : null
    const weight_max = formData.get('weight_max') ? parseFloat(formData.get('weight_max') as string) : null
    const size = formData.get('size') as string || null
    const day_of_week = formData.get('day_of_week') ? parseInt(formData.get('day_of_week') as string) : null

    const { error } = await supabase.from('pricing_matrix').insert({
        service_id,
        fixed_price: price, // Mapping 'price' input to 'fixed_price' column
        weight_min,
        weight_max,
        size,
        day_of_week
    })

    if (error) return { message: error.message, success: false }
    revalidatePath('/owner/services')
    return { message: 'Regra de preço adicionada!', success: true }
}

export async function deletePricingRule(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const { error } = await supabase.from('pricing_matrix').delete().eq('id', id)
    if (error) return { message: error.message, success: false }
    revalidatePath('/owner/services')
    return { message: 'Regra removida.', success: true }
}
