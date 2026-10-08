'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

interface CreateUserState {
    message: string
    success: boolean
}

export async function createUser(prevState: CreateUserState, formData: FormData) {
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

    if (!profile || !['superadmin', 'admin'].includes(profile.role)) {
        return { message: 'Permissão negada. Apenas administradores podem criar usuários.', success: false }
    }

    // 2. Extract Data
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const fullName = formData.get('fullName') as string
    const role = formData.get('role') as string
    const birthDate = (formData.get('birthDate') as string) || null
    const workScheduleStr = formData.get('workSchedule') as string
    const permissionsStr = formData.get('permissions') as string

    if (!email || !password || !fullName || !role) {
        return { message: 'Todos os campos são obrigatórios.', success: false }
    }

    let workSchedule: any = []
    let permissions = []
    if (role === 'staff') {
        try {
            if (workScheduleStr) workSchedule = JSON.parse(workScheduleStr)
            if (permissionsStr) permissions = JSON.parse(permissionsStr)
        } catch (e) {
            return { message: 'Formato de horário ou permissões inválido.', success: false }
        }
    } else {
        workSchedule = [] // Not a staff member, no schedule needed
        permissions = []
    }

    // 3. Create User with Admin Client
    const supabaseAdmin = createAdminClient()

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto confirm email
        user_metadata: { full_name: fullName }
    })

    if (createError) {
        return { message: `Erro ao criar usuário: ${createError.message}`, success: false }
    }

    if (!newUser.user) {
        return { message: 'Erro inesperado ao criar usuário via Admin API.', success: false }
    }

    // 4. Update Profile with correct Role, Org ID and birth_date
    const profilePayload: any = {
        id: newUser.user.id,
        email: email,
        full_name: fullName,
        role: role as 'admin' | 'staff' | 'customer',
        org_id: profile.org_id,
        work_schedule: workSchedule,
        permissions: permissions,
        is_active: true
    }
    if (birthDate) {
        profilePayload.birth_date = birthDate
    }

    let { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert(profilePayload)

    // Fallback se a coluna birth_date ainda não tiver sido criada no banco
    if (profileError && profileError.message?.includes('birth_date')) {
        delete profilePayload.birth_date
        const retry = await supabaseAdmin.from('profiles').upsert(profilePayload)
        profileError = retry.error
    }

    if (profileError) {
        // Rollback user creation if profile fails (optional but good practice)
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        return { message: `Erro ao criar perfil do usuário: ${profileError.message}`, success: false }
    }

    revalidatePath('/owner/usuarios')
    return { message: 'Usuário criado com sucesso!', success: true }
}

export async function updateUser(prevState: any, formData: FormData) {
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

    if (!profile || !['superadmin', 'admin'].includes(profile.role)) {
        return { message: 'Permissão negada. Apenas administradores podem gerenciar usuários.', success: false }
    }

    // 2. Extract Data
    const userId = formData.get('userId') as string
    const fullName = formData.get('fullName') as string
    const role = formData.get('role') as string
    const birthDate = (formData.get('birthDate') as string) || null
    const workScheduleStr = formData.get('workSchedule') as string
    const permissionsStr = formData.get('permissions') as string
    const isActive = formData.get('isActive') === 'true'

    if (!userId || !fullName || !role) {
        return { message: 'Campos obrigatórios faltando.', success: false }
    }

    let workSchedule: any = null
    let permissions: any = null
    try {
        if (workScheduleStr) workSchedule = JSON.parse(workScheduleStr)
        if (permissionsStr) permissions = JSON.parse(permissionsStr)
    } catch (e) {
        return { message: 'Formato de horário ou permissões inválido.', success: false }
    }

    // 3. Update Profile with Admin Client
    const supabaseAdmin = createAdminClient()

    const updateData: any = {
        full_name: fullName,
        role: role as 'admin' | 'staff' | 'customer',
        is_active: isActive,
        birth_date: birthDate
    }

    if (role === 'staff' && workSchedule !== null) {
        updateData.work_schedule = workSchedule
    } else if (role !== 'staff') {
        updateData.work_schedule = [] // Clear schedule for non-staff
    }

    if (role === 'staff' && permissions !== null) {
        updateData.permissions = permissions
    } else if (role !== 'staff') {
        updateData.permissions = []
    }

    let { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(updateData)
        .eq('id', userId)
        .eq('org_id', profile.org_id) // Ensure we only update users in the same org

    if (updateError && updateError.message?.includes('birth_date')) {
        delete updateData.birth_date
        const retry = await supabaseAdmin
            .from('profiles')
            .update(updateData)
            .eq('id', userId)
            .eq('org_id', profile.org_id)
        updateError = retry.error
    }

    if (updateError) {
        return { message: `Erro ao atualizar usuário: ${updateError.message}`, success: false }
    }

    revalidatePath('/owner/usuarios')
    return { message: 'Usuário atualizado com sucesso!', success: true }
}
