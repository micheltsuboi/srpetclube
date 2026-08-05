import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
    // Verificar autenticação do cron (Vercel injeta o header automaticamente com CRON_SECRET)
    const authHeader = request.headers.get('Authorization')
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const supabase = createAdminClient()
        const now = new Date().toISOString()

        // Buscar pacotes ativos com auto_renew onde expires_at já passou
        const { data: packagesToRenew, error } = await supabase
            .from('customer_packages')
            .select(`
                id, customer_id, package_id, org_id, pet_id,
                preferred_weekdays, preferred_time, is_auto_schedule,
                has_taxi, taxi_fee, auto_renew,
                service_packages(validity_days, total_price, name, package_items(service_id, quantity))
            `)
            .eq('is_active', true)
            .eq('auto_renew', true)
            .lte('expires_at', now)

        if (error) {
            console.error('[CRON auto-renew] Erro ao buscar pacotes:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!packagesToRenew || packagesToRenew.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'Nenhum pacote para renovar.',
                renewed: 0
            })
        }

        console.log(`[CRON auto-renew] Renovando ${packagesToRenew.length} pacotes...`)
        let successCount = 0
        const errors: string[] = []

        for (const pkg of packagesToRenew) {
            try {
                const sp = pkg.service_packages as any
                const validityDays = sp?.validity_days
                let new_expires_at: string | null = null
                if (validityDays) {
                    const expiry = new Date()
                    expiry.setDate(expiry.getDate() + validityDays)
                    new_expires_at = expiry.toISOString()
                }

                // Criar novo pacote
                const { data: newPackage, error: newPkgErr } = await supabase
                    .from('customer_packages')
                    .insert({
                        customer_id: pkg.customer_id,
                        package_id: pkg.package_id,
                        org_id: pkg.org_id,
                        pet_id: pkg.pet_id,
                        preferred_weekdays: pkg.preferred_weekdays,
                        preferred_time: pkg.preferred_time,
                        is_auto_schedule: pkg.is_auto_schedule,
                        has_taxi: pkg.has_taxi,
                        taxi_fee: pkg.taxi_fee,
                        auto_renew: true,
                        calculated_price: sp?.total_price || 0,
                        total_paid: 0,
                        payment_status: 'pending',
                        payment_method: 'other',
                        notes: 'Renovação automática',
                        expires_at: new_expires_at
                    })
                    .select()
                    .single()

                if (newPkgErr || !newPackage) {
                    errors.push(`Pacote ${pkg.id}: ${newPkgErr?.message || 'erro desconhecido'}`)
                    continue
                }

                // Criar créditos
                const items = sp?.package_items || []
                if (items.length > 0) {
                    const credits = items.map((item: any) => ({
                        customer_package_id: newPackage.id,
                        service_id: item.service_id,
                        total_quantity: item.quantity,
                        used_quantity: 0,
                        remaining_quantity: item.quantity
                    }))
                    await supabase.from('package_credits').insert(credits)
                }

                // Desativar pacote antigo
                await supabase
                    .from('customer_packages')
                    .update({ is_active: false })
                    .eq('id', pkg.id)

                // Gerar slots automáticos
                await supabase.rpc('generate_package_slots', {
                    p_customer_package_id: newPackage.id
                })

                successCount++
                console.log(`[CRON auto-renew] Pacote ${pkg.id} renovado → ${newPackage.id}`)
            } catch (err: any) {
                errors.push(`Pacote ${pkg.id}: ${err.message}`)
                console.error(`[CRON auto-renew] Falha no pacote ${pkg.id}:`, err)
            }
        }

        return NextResponse.json({
            success: true,
            message: `${successCount} de ${packagesToRenew.length} pacotes renovados.`,
            renewed: successCount,
            total: packagesToRenew.length,
            errors: errors.length > 0 ? errors : undefined
        })
    } catch (error: any) {
        console.error('[CRON auto-renew] Erro crítico:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
