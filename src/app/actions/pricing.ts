'use server'

import { createClient } from '@/lib/supabase/server'

export async function calculateDynamicPrice(petId: string, serviceId: string, date: string): Promise<number | null> {
    try {
        const results = await calculateManyDynamicPrices(petId, [serviceId], date)
        return results[serviceId] ?? null
    } catch (err) {
        console.error('Action error calculating dynamic price:', err)
        return null
    }
}

export async function calculateManyDynamicPrices(
    petId: string,
    serviceIds: string[],
    date: string
): Promise<Record<string, number | null>> {
    try {
        if (!petId || !serviceIds || serviceIds.length === 0) return {}

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return {}

        // 1. Tenta RPC get_price como base rápida
        const priceMap: Record<string, number | null> = {}
        const rpcPromises = serviceIds.map(async (id) => {
            const { data } = await supabase.rpc('get_price', {
                p_pet_id: petId,
                p_service_id: id,
                p_date: date
            })
            return { id, price: typeof data === 'number' ? data : null }
        })

        const rpcResults = await Promise.all(rpcPromises)
        rpcResults.forEach(res => {
            if (res.price !== null) priceMap[res.id] = res.price
        })

        // 2. Busca dados do pet e da matriz de preços para garantir correspondência exata de peso e dia
        const { data: pet } = await supabase
            .from('pets')
            .select('id, weight_kg, size')
            .eq('id', petId)
            .single()

        if (!pet) return priceMap

        const targetDate = date ? new Date(`${date}T12:00:00`) : new Date()
        const dayOfWeek = targetDate.getDay() // 0 = Domingo, 6 = Sábado

        const { data: rules } = await supabase
            .from('pricing_matrix')
            .select('*')
            .in('service_id', serviceIds)
            .eq('is_active', true)

        const { data: services } = await supabase
            .from('services')
            .select('id, base_price')
            .in('id', serviceIds)

        const serviceBaseMap: Record<string, number> = {}
        ;(services || []).forEach(s => {
            serviceBaseMap[s.id] = s.base_price
        })

        for (const serviceId of serviceIds) {
            const sRules = (rules || []).filter(r => r.service_id === serviceId)
            if (sRules.length === 0) {
                if (priceMap[serviceId] === undefined) {
                    priceMap[serviceId] = serviceBaseMap[serviceId] ?? null
                }
                continue
            }

            const matching = sRules.filter(r => {
                if (r.day_of_week !== null && r.day_of_week !== dayOfWeek) return false
                const hasWeight = r.weight_min !== null || r.weight_max !== null
                if (hasWeight && pet.weight_kg !== null && pet.weight_kg !== undefined) {
                    if (r.weight_min !== null && pet.weight_kg < r.weight_min) return false
                    if (r.weight_max !== null && pet.weight_kg > r.weight_max) return false
                    return true
                }
                if (!hasWeight && r.size && pet.size) {
                    return r.size === pet.size
                }
                if (pet.weight_kg === null && r.size && pet.size && r.size === pet.size) {
                    return true
                }
                return !hasWeight && !r.size
            }).sort((a, b) => {
                const aDowWeight = (a.day_of_week !== null && (a.weight_min !== null || a.weight_max !== null)) ? 1 : 0
                const bDowWeight = (b.day_of_week !== null && (b.weight_min !== null || b.weight_max !== null)) ? 1 : 0
                if (aDowWeight !== bDowWeight) return bDowWeight - aDowWeight

                const aDow = a.day_of_week !== null ? 1 : 0
                const bDow = b.day_of_week !== null ? 1 : 0
                if (aDow !== bDow) return bDow - aDow

                const aWeight = (a.weight_min !== null || a.weight_max !== null) ? 1 : 0
                const bWeight = (b.weight_min !== null || b.weight_max !== null) ? 1 : 0
                if (aWeight !== bWeight) return bWeight - aWeight

                return (b.fixed_price || 0) - (a.fixed_price || 0)
            })

            if (matching.length > 0 && matching[0].fixed_price !== null) {
                priceMap[serviceId] = matching[0].fixed_price
            } else if (priceMap[serviceId] === undefined) {
                priceMap[serviceId] = serviceBaseMap[serviceId] ?? null
            }
        }

        return priceMap
    } catch (err) {
        console.error('Action error calculating many dynamic prices:', err)
        return {}
    }
}
