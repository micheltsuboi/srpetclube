'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface AssessmentQuestion {
    id: string
    org_id: string
    category: 'social' | 'routine' | 'health' | 'care'
    question_text: string
    question_type: 'boolean' | 'text' | 'select'
    options?: any
    is_active: boolean
    order_index: number
    system_key?: string
}

export interface AssessmentAnswer {
    id: string
    pet_id: string
    question_id: string
    answer_boolean?: boolean
    answer_text?: string
}

// ----------------------------------------------------------------------------
// Questions Management (For Owner/Staff)
// ----------------------------------------------------------------------------

export async function getAssessmentQuestions(orgId: string) {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('assessment_questions')
            .select('*')
            .eq('org_id', orgId)
            .order('category', { ascending: true })
            .order('order_index', { ascending: true })

        if (error) {
            console.error('Error fetching questions:', error)
            return []
        }

        return data as AssessmentQuestion[]
    } catch (error) {
        console.error('Unexpected error:', error)
        return []
    }
}

export async function getActiveQuestionsForContext() {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return []

        // If tutor, their pets belong to an org_id, but usually tutors themselves are associated with an org.
        // Or tutors belong to multiple orgs? Tutors are just users.
        // Wait, 'profiles' table has org_id
        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()

        if (!profile?.org_id) return []

        const { data, error } = await supabase
            .from('assessment_questions')
            .select('*')
            .eq('org_id', profile.org_id)
            .eq('is_active', true)
            .order('category', { ascending: true })
            .order('order_index', { ascending: true })

        if (error) return []
        return data as AssessmentQuestion[]
    } catch (error) {
        return []
    }
}

export async function getActiveQuestionsForPet(petId: string) {
    try {
        const supabase = await createClient()

        const { data: pet } = await supabase
            .from('pets')
            .select('customers!inner(org_id)')
            .eq('id', petId)
            .single()

        // Handle the possibility of customers being an array or object depending on Supabase's type inference
        const orgId = pet?.customers && Array.isArray(pet.customers) ? pet.customers[0]?.org_id : (pet?.customers as any)?.org_id
        if (!orgId) return []

        const { data, error } = await supabase
            .from('assessment_questions')
            .select('*')
            .eq('org_id', orgId)
            .eq('is_active', true)
            .order('category', { ascending: true })
            .order('order_index', { ascending: true })

        if (error) return []
        return data as AssessmentQuestion[]
    } catch (error) {
        return []
    }
}

export async function createAssessmentQuestion(formData: FormData) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, message: 'Não autenticado' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id, role')
            .eq('id', user.id)
            .single()

        if (!profile?.org_id || !['owner', 'staff', 'superadmin'].includes(profile.role)) {
            return { success: false, message: 'Sem autorização ou organização não encontrada' }
        }

        const category = formData.get('category') as string
        const question_text = formData.get('question_text') as string
        const question_type = formData.get('question_type') as string
        const order_index = Number(formData.get('order_index') || 0)

        // Handle options array for 'select' questions
        let options = null
        const optionsStr = formData.get('options') as string
        if (optionsStr && question_type === 'select') {
            try {
                options = JSON.parse(optionsStr)
            } catch (e) {
                options = optionsStr.split(',').map(s => s.trim()).filter(Boolean)
            }
        }

        const questionData = {
            org_id: profile.org_id,
            category,
            question_text,
            question_type,
            options,
            order_index,
            is_active: true
        }

        const adminClient = createAdminClient()
        const { error } = await adminClient
            .from('assessment_questions')
            .insert(questionData)

        if (error) {
            console.error('Error creating question:', error)
            return { success: false, message: 'Erro ao criar pergunta: ' + error.message }
        }

        revalidatePath('/owner/assessment')
        revalidatePath('/staff/assessment')
        return { success: true, message: 'Pergunta criada com sucesso!' }
    } catch (error) {
        console.error('Unexpected error:', error)
        return { success: false, message: 'Erro inesperado ao criar pergunta' }
    }
}

export async function updateAssessmentQuestion(id: string, formData: FormData) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, message: 'Não autenticado' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id, role')
            .eq('id', user.id)
            .single()

        if (!profile?.org_id || !['owner', 'staff', 'superadmin'].includes(profile.role)) {
            return { success: false, message: 'Sem autorização' }
        }

        const category = formData.get('category') as string
        const question_text = formData.get('question_text') as string
        const question_type = formData.get('question_type') as string
        const order_index = Number(formData.get('order_index') || 0)

        let options = null
        const optionsStr = formData.get('options') as string
        if (optionsStr && question_type === 'select') {
            try {
                options = JSON.parse(optionsStr)
            } catch (e) {
                options = optionsStr.split(',').map(s => s.trim()).filter(Boolean)
            }
        }

        const questionData = {
            category,
            question_text,
            question_type,
            options,
            order_index,
        }

        const adminClient = createAdminClient()
        const { error } = await adminClient
            .from('assessment_questions')
            .update(questionData)
            .eq('id', id)

        if (error) {
            console.error('Error updating question:', error)
            return { success: false, message: 'Erro ao atualizar pergunta' }
        }

        revalidatePath('/owner/assessment')
        revalidatePath('/staff/assessment')
        return { success: true, message: 'Pergunta atualizada!' }
    } catch (error) {
        console.error('Unexpected error:', error)
        return { success: false, message: 'Erro inesperado ao atualizar pergunta' }
    }
}

export async function toggleAssessmentQuestionStatus(id: string, currentStatus: boolean) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, message: 'Não autenticado' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!profile || !['owner', 'staff', 'superadmin'].includes(profile.role)) {
            return { success: false, message: 'Sem autorização' }
        }

        const adminClient = createAdminClient()
        const { error } = await adminClient
            .from('assessment_questions')
            .update({ is_active: !currentStatus })
            .eq('id', id)

        if (error) return { success: false, message: 'Erro ao alterar status' }

        revalidatePath('/owner/assessment')
        revalidatePath('/staff/assessment')
        return { success: true, message: 'Status atualizado com sucesso!' }
    } catch (error) {
        return { success: false, message: 'Erro inesperado' }
    }
}

// ----------------------------------------------------------------------------
// Answers Management (For Tutors)
// ----------------------------------------------------------------------------

export async function createPetAssessment(petId: string, formData: FormData) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, message: 'Usuário não autenticado' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()

        if (!profile?.org_id) return { success: false, message: 'Organização não encontrada' }

        const orgId = profile.org_id
        const isOwnerOrStaff = ['owner', 'staff'].includes(formData.get('user_role') as string || '') // Optionally passed by the client if we want to change behavior (like auto-approve)

        // 1. First upsert the base pet_assessment record (to track declaration, status)
        const ownerDeclarationAccepted = formData.get('owner_declaration_accepted') === 'true'

        const assessmentData = {
            pet_id: petId,
            org_id: orgId,
            owner_declaration_accepted: ownerDeclarationAccepted,
            declaration_accepted_at: new Date().toISOString(),
            status: isOwnerOrStaff ? 'approved' : 'pending' // pending review unless filled by staff
        }

        const { error: assessmentError } = await supabase
            .from('pet_assessments')
            .upsert(assessmentData, { onConflict: 'pet_id' })

        if (assessmentError) {
            console.error('[Assessment] Error creating base assessment:', assessmentError)
            return { success: false, message: 'Erro ao salvar declaração de avaliação' }
        }

        // 2. Fetch active questions for this org to process answers dynamically
        const { data: questions, error: qError } = await supabase
            .from('assessment_questions')
            .select('id, question_type')
            .eq('org_id', orgId)
        // .eq('is_active', true) // We could only process active questions, or just process whatever arrived in formData

        if (qError || !questions) {
            console.error('[Assessment] Error fetching questions for answers logic:', qError)
            return { success: false, message: 'Erro ao processar respostas da avaliação' }
        }

        // 3. Build answers array based on the formData fields keys structured as question_{id}
        const answersToInsert = []

        for (const question of questions) {
            const fieldName = `question_${question.id}`
            const hasFieldValue = formData.has(fieldName)
            const fieldValue = formData.get(fieldName)

            // Some boolean fields might not be present if unchecked, but we want to register false if they were part of the form
            // Or maybe for checkboxes we just handle 'true'
            if (question.question_type === 'boolean') {
                const isTrue = String(fieldValue) === 'true'
                answersToInsert.push({
                    pet_id: petId,
                    question_id: question.id,
                    answer_boolean: isTrue,
                    answer_text: null
                })
            } else if ((question.question_type === 'text' || question.question_type === 'select') && hasFieldValue) {
                answersToInsert.push({
                    pet_id: petId,
                    question_id: question.id,
                    answer_boolean: null,
                    answer_text: String(fieldValue)
                })
            }
        }

        if (answersToInsert.length > 0) {
            const { error: answersError } = await supabase
                .from('assessment_answers')
                .upsert(answersToInsert, { onConflict: 'pet_id, question_id' })

            if (answersError) {
                console.error('[Assessment] Error upserting dynamic answers:', answersError)
                return { success: false, message: 'Erro ao salvar as respostas detalhadas' }
            }
        }

        revalidatePath('/owner/pets')
        revalidatePath('/tutor/pets')
        return { success: true, message: 'Avaliação salva com sucesso!' }
    } catch (error) {
        console.error('Unexpected error:', error)
        return { success: false, message: 'Erro inesperado ao salvar avaliação' }
    }
}

export async function getPetAssessment(petId: string) {
    try {
        const supabase = await createClient()

        // 1. Get base assessment
        const { data: assessment, error: assessmentError } = await supabase
            .from('pet_assessments')
            .select('*')
            .eq('pet_id', petId)
            .single()

        // 2. Get dynamic answers (if any exist)
        const { data: answers, error: answersError } = await supabase
            .from('assessment_answers')
            .select('*')
            .eq('pet_id', petId)

        // Map answers for easy UI consumption: answersMap[question_id] = { answer_boolean, answer_text }
        const answersMap: Record<string, any> = {}
        if (answers) {
            answers.forEach(ans => {
                answersMap[ans.question_id] = {
                    boolean: ans.answer_boolean,
                    text: ans.answer_text
                }
            })
        }

        // Only return if at least the base exists
        if (!assessment && (!answers || answers.length === 0)) return null

        return {
            ...assessment,
            answers: answersMap,
            rawAnswers: answers || []
        }
    } catch (error) {
        console.error('Unexpected error:', error)
        return null
    }
}

export async function updatePetAssessment(petId: string, formData: FormData) {
    // Both create and update do upsert logic implicitly if we just reuse create logic
    return createPetAssessment(petId, formData)
}
