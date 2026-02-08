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

    if (!email || !password || !fullName || !role) {
        return { message: 'Todos os campos são obrigatórios.', success: false }
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

    // 4. Update Profile with correct Role and Org ID
    // Note: The trigger might have created a profile already, so we should update it
    // Or if we need to insert manually if the trigger isn't set up for admin.createUser
    // Let's try update first, insert if not exists (upsert)

    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
            id: newUser.user.id,
            email: email,
            full_name: fullName,
            role: role as 'admin' | 'staff' | 'customer',
            org_id: profile.org_id,
            is_active: true
        })

    if (profileError) {
        // Rollback user creation if profile fails (optional but good practice)
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        return { message: `Erro ao criar perfil do usuário: ${profileError.message}`, success: false }
    }

    revalidatePath('/owner/usuarios')
    return { message: 'Usuário criado com sucesso!', success: true }
}
