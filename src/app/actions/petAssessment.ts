'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface PetAssessmentData {
    // Socialização
    sociable_with_humans?: boolean
    sociable_with_dogs?: boolean
    socialized_early?: boolean
    desensitized?: boolean
    is_reactive?: boolean
    reactive_description?: string
    shows_escape_signs?: boolean
    has_bitten_person?: boolean
    has_been_bitten?: boolean

    // Rotina e comportamento
    has_routine?: boolean
    regular_walks?: boolean
    stays_alone_ok?: boolean
    daily_routine_description?: string
    separation_anxiety?: boolean
    has_phobias?: boolean
    phobia_description?: string
    possessive_behavior?: boolean
    humanization_traits?: boolean
    obeys_basic_commands?: boolean
    professionally_trained?: boolean

    // Saúde
    is_brachycephalic?: boolean
    age_health_restrictions?: boolean
    has_health_issues?: boolean
    health_issues_description?: string
    food_restrictions?: boolean
    food_restrictions_description?: string
    has_dermatitis?: boolean
    activity_restrictions?: boolean
    patellar_orthopedic_issues?: boolean
    other_health_notes?: string

    // Cuidados específicos
    water_reaction?: string
    pool_authorized?: boolean
    food_brand?: string

    // Declaração
    owner_declaration_accepted: boolean
}

export async function createPetAssessment(petId: string, formData: FormData) {
    try {
        const supabase = await createClient()

        // Get current user and org
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, message: 'Usuário não autenticado' }
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()

        if (!profile?.org_id) {
            return { success: false, message: 'Organização não encontrada' }
        }

        // Parse form data
        const assessmentData: any = {
            pet_id: petId,
            org_id: profile.org_id,

            // Socialização
            sociable_with_humans: formData.get('sociable_with_humans') === 'true',
            sociable_with_dogs: formData.get('sociable_with_dogs') === 'true',
            socialized_early: formData.get('socialized_early') === 'true',
            desensitized: formData.get('desensitized') === 'true',
            is_reactive: formData.get('is_reactive') === 'true',
            reactive_description: formData.get('reactive_description') || null,
            shows_escape_signs: formData.get('shows_escape_signs') === 'true',
            has_bitten_person: formData.get('has_bitten_person') === 'true',
            has_been_bitten: formData.get('has_been_bitten') === 'true',

            // Rotina
            has_routine: formData.get('has_routine') === 'true',
            regular_walks: formData.get('regular_walks') === 'true',
            stays_alone_ok: formData.get('stays_alone_ok') === 'true',
            daily_routine_description: formData.get('daily_routine_description') || null,
            separation_anxiety: formData.get('separation_anxiety') === 'true',
            has_phobias: formData.get('has_phobias') === 'true',
            phobia_description: formData.get('phobia_description') || null,
            possessive_behavior: formData.get('possessive_behavior') === 'true',
            humanization_traits: formData.get('humanization_traits') === 'true',
            obeys_basic_commands: formData.get('obeys_basic_commands') === 'true',
            professionally_trained: formData.get('professionally_trained') === 'true',

            // Saúde
            is_brachycephalic: formData.get('is_brachycephalic') === 'true',
            age_health_restrictions: formData.get('age_health_restrictions') === 'true',
            has_health_issues: formData.get('has_health_issues') === 'true',
            health_issues_description: formData.get('health_issues_description') || null,
            food_restrictions: formData.get('food_restrictions') === 'true',
            food_restrictions_description: formData.get('food_restrictions_description') || null,
            has_dermatitis: formData.get('has_dermatitis') === 'true',
            activity_restrictions: formData.get('activity_restrictions') === 'true',
            patellar_orthopedic_issues: formData.get('patellar_orthopedic_issues') === 'true',
            other_health_notes: formData.get('other_health_notes') || null,

            // Cuidados específicos
            water_reaction: formData.get('water_reaction') || null,
            pool_authorized: formData.get('pool_authorized') === 'true',
            food_brand: formData.get('food_brand') || null,

            // Declaração
            owner_declaration_accepted: formData.get('owner_declaration_accepted') === 'true',
            declaration_accepted_at: new Date().toISOString()
        }

        const { error } = await supabase
            .from('pet_assessments')
            .insert(assessmentData)

        if (error) {
            console.error('Error creating assessment:', error)
            return { success: false, message: 'Erro ao salvar avaliação' }
        }

        revalidatePath('/owner/pets')
        return { success: true, message: 'Avaliação salva com sucesso!' }

    } catch (error) {
        console.error('Unexpected error:', error)
        return { success: false, message: 'Erro inesperado ao salvar avaliação' }
    }
}

export async function getPetAssessment(petId: string) {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('pet_assessments')
            .select('*')
            .eq('pet_id', petId)
            .single()

        if (error) {
            if (error.code !== 'PGRST116') { // PGRST116 = not found
                console.error('Error fetching assessment:', error)
            }
            return null
        }

        return data

    } catch (error) {
        console.error('Unexpected error:', error)
        return null
    }
}

export async function updatePetAssessment(petId: string, formData: FormData) {
    try {
        const supabase = await createClient()

        // Parse form data (same as create)
        const assessmentData: any = {
            // Socialização
            sociable_with_humans: formData.get('sociable_with_humans') === 'true',
            sociable_with_dogs: formData.get('sociable_with_dogs') === 'true',
            socialized_early: formData.get('socialized_early') === 'true',
            desensitized: formData.get('desensitized') === 'true',
            is_reactive: formData.get('is_reactive') === 'true',
            reactive_description: formData.get('reactive_description') || null,
            shows_escape_signs: formData.get('shows_escape_signs') === 'true',
            has_bitten_person: formData.get('has_bitten_person') === 'true',
            has_been_bitten: formData.get('has_been_bitten') === 'true',

            // Rotina
            has_routine: formData.get('has_routine') === 'true',
            regular_walks: formData.get('regular_walks') === 'true',
            stays_alone_ok: formData.get('stays_alone_ok') === 'true',
            daily_routine_description: formData.get('daily_routine_description') || null,
            separation_anxiety: formData.get('separation_anxiety') === 'true',
            has_phobias: formData.get('has_phobias') === 'true',
            phobia_description: formData.get('phobia_description') || null,
            possessive_behavior: formData.get('possessive_behavior') === 'true',
            humanization_traits: formData.get('humanization_traits') === 'true',
            obeys_basic_commands: formData.get('obeys_basic_commands') === 'true',
            professionally_trained: formData.get('professionally_trained') === 'true',

            // Saúde
            is_brachycephalic: formData.get('is_brachycephalic') === 'true',
            age_health_restrictions: formData.get('age_health_restrictions') === 'true',
            has_health_issues: formData.get('has_health_issues') === 'true',
            health_issues_description: formData.get('health_issues_description') || null,
            food_restrictions: formData.get('food_restrictions') === 'true',
            food_restrictions_description: formData.get('food_restrictions_description') || null,
            has_dermatitis: formData.get('has_dermatitis') === 'true',
            activity_restrictions: formData.get('activity_restrictions') === 'true',
            patellar_orthopedic_issues: formData.get('patellar_orthopedic_issues') === 'true',
            other_health_notes: formData.get('other_health_notes') || null,

            // Cuidados específicos
            water_reaction: formData.get('water_reaction') || null,
            pool_authorized: formData.get('pool_authorized') === 'true',
            food_brand: formData.get('food_brand') || null,

            // Declaração
            owner_declaration_accepted: formData.get('owner_declaration_accepted') === 'true',
        }

        const { error } = await supabase
            .from('pet_assessments')
            .update(assessmentData)
            .eq('pet_id', petId)

        if (error) {
            console.error('Error updating assessment:', error)
            return { success: false, message: 'Erro ao atualizar avaliação' }
        }

        revalidatePath('/owner/pets')
        return { success: true, message: 'Avaliação atualizada com sucesso!' }

    } catch (error) {
        console.error('Unexpected error:', error)
        return { success: false, message: 'Erro inesperado ao atualizar avaliação' }
    }
}
