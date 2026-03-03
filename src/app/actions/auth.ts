'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

interface RegisterState {
    message: string
    success: boolean
}

export async function registerClient(prevState: RegisterState, formData: FormData) {
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
        return { message: 'Todos os campos são obrigatórios.', success: false }
    }

    const supabaseAdmin = createAdminClient()

    // 1. Get Default Organization
    const { data: orgs } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .limit(1)
        .single()

    if (!orgs) {
        return { message: 'Erro de configuração do sistema (Organização não encontrada).', success: false }
    }

    const orgId = orgs.id

    // 2. Create Auth User
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm
        user_metadata: { full_name: name, phone: phone }
    })

    if (createError) {
        return { message: `Erro ao criar conta: ${createError.message}`, success: false }
    }

    if (!newUser.user) {
        return { message: 'Erro inesperado ao criar usuário.', success: false }
    }

    // 3. Update Profile Logic (Role & Org) - The trigger creates the profile, we just update it
    // Wait for a moment or just update. Since we are admin, we can update immediately.
    // However, the trigger might run in parallel.
    // Safe way: Upsert or Update.
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
            role: 'customer',
            org_id: orgId,
            full_name: name,
            phone: phone
        })
        .eq('id', newUser.user.id)

    if (profileError) {
        // Cleanup
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        return { message: `Erro ao configurar perfil: ${profileError.message}`, success: false }
    }

    // 4. Create Customer Record
    const { error: customerError } = await supabaseAdmin
        .from('customers')
        .insert({
            user_id: newUser.user.id,
            org_id: orgId,
            name: name,
            email: email,
            phone_1: phone,
            birth_date: birthDate ? new Date(birthDate).toISOString() : null,
            address: address || null,
            neighborhood: neighborhood || null,
            city: city || 'São Paulo',
            instagram: instagram || null
        })

    if (customerError) {
        // Cleanup
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        return { message: `Erro ao criar ficha do cliente: ${customerError.message}`, success: false }
    }

    // Success
    return { message: 'Cadastro realizado com sucesso! Faça login para continuar.', success: true }
}
