'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function syncNotifications() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
            .from('profiles')
            .select('org_id')
            .eq('id', user.id)
            .single()

        if (!profile?.org_id) return

        const orgId = profile.org_id

        // 1. Check Expiring Vaccines (7 days)
        const today = new Date()
        const sevenDaysLater = new Date(today)
        sevenDaysLater.setDate(today.getDate() + 7)
        // Normalize time part for accurate date comparison
        const todayStr = today.toISOString().split('T')[0]
        const sevenDaysLaterStr = sevenDaysLater.toISOString().split('T')[0]

        console.log(`[Sync] Checking vaccines expiring between ${todayStr} and ${sevenDaysLaterStr}`)

        const { data: expiringVaccines, error: vacError } = await supabase
            .from('pet_vaccines')
            .select(`
                id, 
                name, 
                expiry_date, 
                pets ( id, name, customer_id, customers ( org_id ) )
            `)
            .lte('expiry_date', sevenDaysLaterStr)
        // .gte('expiry_date', todayStr) // Keep allowing expired ones to be notified if not yet notified

        if (vacError) {
            console.error('[Sync] Error fetching vaccines:', vacError)
        }

        if (expiringVaccines && expiringVaccines.length > 0) {
            console.log(`[Sync] Found ${expiringVaccines.length} potential expiring vaccines.`)

            for (const vac of expiringVaccines) {
                // Safely extract pet and customer data
                // @ts-ignore
                const petData = Array.isArray(vac.pets) ? vac.pets[0] : vac.pets
                if (!petData) continue

                // @ts-ignore
                const customerData = Array.isArray(petData.customers) ? petData.customers[0] : petData.customers

                const petOrgId = customerData?.org_id
                const orgMatch = petOrgId === orgId

                if (orgMatch) {
                    const expiry = new Date(vac.expiry_date)
                    // Create date objects without time for comparison to avoid timezone issues affecting "isExpired" today
                    const expiryStr = vac.expiry_date
                    const isExpired = expiryStr < todayStr

                    const title = isExpired ? 'Vacina Vencida ⚠️' : 'Vacina Vencendo 💉'
                    const [vYear, vMonth, vDay] = vac.expiry_date.split('-')
                    const formattedExpiry = `${vDay}/${vMonth}/${vYear}`
                    const message = `A vacina ${vac.name} do pet ${petData.name} ${isExpired ? 'venceu' : 'vence'} em ${formattedExpiry}.`

                    // Check if exists
                    const { data: existing } = await supabase
                        .from('notifications')
                        .select('id')
                        .eq('reference_id', vac.id)
                        .eq('type', 'vaccine_expiry')
                        .single()

                    if (!existing) {
                        console.log(`[Sync] Creating notification for vaccine ${vac.id} (Pet: ${petData.name})`)
                        await supabase.from('notifications').insert({
                            org_id: orgId,
                            type: 'vaccine_expiry',
                            title,
                            message,
                            reference_id: vac.id,
                            link: `/owner/pets?openPetId=${petData.id}`
                        })
                    }
                }
            }
        } else {
            console.log('[Sync] No expiring vaccines found.')
        }

        // 2. Check Expiring Products (30 days)
        const thirtyDaysLater = new Date(today)
        thirtyDaysLater.setDate(today.getDate() + 30)

        const { data: expiringProducts } = await supabase
            .from('products')
            .select('id, name, expiration_date')
            .eq('org_id', orgId)
            .lte('expiration_date', thirtyDaysLater.toISOString().split('T')[0])

        if (expiringProducts) {
            for (const prod of expiringProducts) {
                if (prod.expiration_date) {
                    const expiry = new Date(prod.expiration_date)
                    const isExpired = expiry < today
                    const title = isExpired ? 'Produto Vencido ⚠️' : 'Produto Vencendo 📦'
                    const [pYear, pMonth, pDay] = prod.expiration_date.split('-')
                    const formattedExpiry = `${pDay}/${pMonth}/${pYear}`
                    const message = `O produto ${prod.name} ${isExpired ? 'venceu' : 'vence'} em ${formattedExpiry}.`

                    // Check if exists
                    const { data: existing } = await supabase
                        .from('notifications')
                        .select('id')
                        .eq('reference_id', prod.id)
                        .eq('type', 'product_expiry')
                        .single()

                    if (!existing) {
                        await supabase.from('notifications').insert({
                            org_id: orgId,
                            type: 'product_expiry',
                            title,
                            message,
                            reference_id: prod.id,
                            link: `/owner/petshop` // ideally specific product but link to stock
                        })
                    }
                }
            }
        }

        // 3. Check Expiring Packages (7 days)
        const { data: expiringPackages } = await supabase
            .from('customer_packages')
            .select(`
                id, expires_at, is_active, 
                pets(name), customers(name), service_packages(name)
            `)
            .eq('org_id', orgId)
            .eq('is_active', true)
            .not('expires_at', 'is', null)
            .lte('expires_at', sevenDaysLaterStr)

        if (expiringPackages) {
            for (const pkg of expiringPackages) {
                const expiry = new Date(pkg.expires_at)
                const isExpired = expiry < today
                const title = isExpired ? 'Pacote Vencido ⚠️' : 'Pacote Vencendo 📦'
                const targetName = (pkg.pets as any)?.name || (pkg.customers as any)?.name || 'Cliente'
                const packageName = (pkg.service_packages as any)?.name || 'Pacote'
                
                const [pYear, pMonth, pDay] = pkg.expires_at.split('T')[0].split('-')
                const formattedExpiry = `${pDay}/${pMonth}/${pYear}`
                const message = `O ${packageName} de ${targetName} ${isExpired ? 'venceu' : 'vence'} em ${formattedExpiry}.`

                // Check if exists
                const { data: existing } = await supabase
                    .from('notifications')
                    .select('id')
                    .eq('reference_id', pkg.id)
                    .eq('type', 'package_expiry')
                    .single()

                if (!existing) {
                    await supabase.from('notifications').insert({
                        org_id: orgId,
                        type: 'package_expiry',
                        title,
                        message,
                        reference_id: pkg.id,
                        link: `/owner/packages`
                    })
                }
            }
        }

        revalidatePath('/owner')
        return { success: true }
    } catch (error) {
        console.error('Error syncing notifications:', error)
        return { success: false }
    }
}

export async function getNotifications() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return []

        const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
        if (!profile?.org_id) return []

        const { data: notifs, error } = await supabase
            .from('notifications')
            .select(`
                *,
                notification_reads!left ( user_id )
            `)
            .eq('org_id', profile.org_id)
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) {
            console.error('[Notifications] Database error:', error)
            throw error
        }

        console.log(`[Notifications] Found ${notifs.length} notifications for org ${profile.org_id}`)

        // Transform to add 'read' boolean
        return notifs.map(n => ({
            ...n,
            read: n.notification_reads.some((r: any) => r.user_id === user.id)
        }))
    } catch (error) {
        console.error('Error fetching notifications:', error)
        return []
    }
}

export async function markAsRead(notificationId: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        await supabase
            .from('notification_reads')
            .upsert(
                { notification_id: notificationId, user_id: user.id },
                { onConflict: 'notification_id,user_id', ignoreDuplicates: true }
            )

        revalidatePath('/owner')
        return { success: true }
    } catch (error) {
        return { success: false }
    }
}

export async function markAllAsRead() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false }

        // Get all unread notification IDs for the current user's org
        // We track reads in notification_reads. 
        // We want to insert a read record for every notification in the user's org that doesn't have one yet.

        const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
        if (!profile?.org_id) return { success: false }

        const { data: unreadNotifs } = await supabase
            .from('notifications')
            .select(`
                id,
                notification_reads!left ( user_id )
            `)
            .eq('org_id', profile.org_id)
            .is('notification_reads.user_id', null)

        if (unreadNotifs && unreadNotifs.length > 0) {
            const inserts = unreadNotifs.map(n => ({
                notification_id: n.id,
                user_id: user.id
            }))

            await supabase
                .from('notification_reads')
                .upsert(inserts, { onConflict: 'notification_id,user_id', ignoreDuplicates: true })
        }

        revalidatePath('/owner')
        return { success: true }
    } catch (error) {
        console.error('Error marking all as read:', error)
        return { success: false }
    }
}

export async function createNotification(data: {
    org_id: string,
    type: string,
    title: string,
    message: string,
    reference_id?: string,
    link?: string
}) {
    try {
        console.log('[Notifications] Creating notification:', data)
        const supabase = await createClient()
        const { error } = await supabase.from('notifications').insert(data)
        if (error) {
            console.error('[Notifications] Error inserting into DB:', error)
            throw error
        }

        revalidatePath('/owner')
        revalidatePath('/')
        return { success: true }
    } catch (error) {
        console.error('[Notifications] Error creating notification:', error)
        return { success: false }
    }
}
