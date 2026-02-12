'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

interface CreateTutorState {
    message: string
    success: boolean
}

export async function createTutor(prevState: CreateTutorState, formData: FormData) {
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
        return { message: 'Permissão negada. Apenas staff e administradores podem cadastrar tutores.', success: false }
    }

    // 2. Extract Data
    const name = formData.get('name') as string
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const phone = formData.get('phone') as string
    const birthDate = formData.get('birthDate') as string
    const address = formData.get('address') as string
    const neighborhood = formData.get('neighborhood') as string
    const city = formData.get('city') as string
    const instagram = formData.get('instagram') as string

    if (!name || !email || !password || !phone) {
        return { message: 'Nome, Email, Senha e Telefone são obrigatórios.', success: false }
    }

    // 3. Create User with Admin Client
    const supabaseAdmin = createAdminClient()

    // Create Auth User
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto confirm email for immediate login
        user_metadata: { full_name: name, phone: phone }
    })

    if (createError) {
        return { message: `Erro ao criar usuário: ${createError.message}`, success: false }
    }

    if (!newUser.user) {
        return { message: 'Erro inesperado ao criar usuário via Admin API.', success: false }
    }

    // 4. Update Profile (created by trigger)
    // We update role to 'customer' explicitly and add phone
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
            role: 'customer',
            phone: phone,
            full_name: name
        })
        .eq('id', newUser.user.id)

    if (profileError) {
        // Rollback user creation
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        return { message: `Erro ao atualizar perfil do tutor: ${profileError.message}`, success: false }
    }

    // 5. Create Customer Record
    // 5. Create Customer Record
    const customerData: Record<string, string | null> = {
        user_id: newUser.user.id,
        org_id: profile.org_id,
        name: name,
        email: email,
        phone_1: phone,
        address: address || null,
        neighborhood: neighborhood || null,
        city: city || 'São Paulo',
        instagram: instagram || null,
    }

    if (birthDate) {
        customerData.birth_date = birthDate
    }

    const { error: customerError } = await supabaseAdmin
        .from('customers')
        .insert(customerData)

    if (customerError) {
        // Rollback user creation (and profile update implicitly if rolled back user)
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        return { message: `Erro ao criar ficha do tutor: ${customerError.message}`, success: false }
    }

    revalidatePath('/owner/tutors')
    return { message: 'Tutor cadastrado com sucesso!', success: true }
}

export async function updateTutor(prevState: CreateTutorState, formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const supabaseAdmin = createAdminClient()

    // Extract Data
    const id = formData.get('id') as string
    const name = formData.get('name') as string
    const email = formData.get('email') as string
    const password = formData.get('password') as string // Optional
    const phone = formData.get('phone') as string
    const birthDate = formData.get('birthDate') as string
    const address = formData.get('address') as string
    const neighborhood = formData.get('neighborhood') as string
    const city = formData.get('city') as string
    const instagram = formData.get('instagram') as string

    if (!id) return { message: 'ID do tutor não fornecido.', success: false }

    // 1. Get current tutor data to check user_id
    const { data: currentTutor } = await supabaseAdmin
        .from('customers')
        .select('user_id, email')
        .eq('id', id)
        .single()

    let userId = currentTutor?.user_id

    // 2. Handle Portal Access / Password
    if (password) {
        if (!userId) {
            // Create NEW Auth User for existing customer
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { full_name: name, phone: phone }
            })

            if (createError) {
                return { message: `Erro ao criar acesso: ${createError.message}`, success: false }
            }

            userId = newUser.user?.id

            // Sync Profile
            await supabaseAdmin.from('profiles').update({
                role: 'customer',
                phone: phone,
                full_name: name
            }).eq('id', userId)
        } else {
            // Update existing user password
            const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                password: password
            })
            if (pwdError) {
                return { message: `Erro ao atualizar senha: ${pwdError.message}`, success: false }
            }
        }
    }

    // 3. Update Customer Record
    const customerData: Record<string, string | null> = {
        name,
        email,
        phone_1: phone,
        address: address || null,
        neighborhood: neighborhood || null,
        city: city || 'São Paulo',
        instagram: instagram || null,
        user_id: userId || currentTutor?.user_id // Keep or link new userId
    }

    if (birthDate) customerData.birth_date = birthDate

    const { error } = await supabaseAdmin
        .from('customers')
        .update(customerData)
        .eq('id', id)

    if (error) {
        return { message: `Erro ao atualizar tutor: ${error.message}`, success: false }
    }

    // Sync Profile name/phone if connected
    if (userId) {
        await supabaseAdmin.from('profiles').update({
            full_name: name,
            phone: phone,
            email: email
        }).eq('id', userId)
    }

    revalidatePath('/owner/tutors')
    return { message: 'Tutor atualizado com sucesso!', success: true }
}

export async function deleteTutor(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { message: 'Não autorizado.', success: false }

    const supabaseAdmin = createAdminClient()

    // Get user_id before deleting to clean up Auth user if desired
    // For now, we only delete the Customer card. Deleting Auth User is risky if they have other access.
    // But since "Tutor" is usually a role, maybe we should? 
    // Let's stick to deleting the business record 'customers'. RLS rules will handle visibility.

    const { error } = await supabaseAdmin
        .from('customers')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Erro ao excluir tutor:', error)
        return { message: `Erro ao excluir: ${error.message}`, success: false }
    }

    revalidatePath('/owner/tutors')
    return { message: 'Tutor excluído com sucesso!', success: true }
}
