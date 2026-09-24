'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { getWhatsAppLink } from '@/utils/mask'

interface Customer {
    id: string
    name: string
    phone_1: string | null
}

interface Pet {
    id: string
    name: string
    breed: string | null
    photo_url: string | null
    species: 'dog' | 'cat' | 'other'
    customers: Customer | null
}

interface PetVaccine {
    id: string
    name: string
    batch_number: string | null
    application_date: string | null
    expiry_date: string
    pets: Pet | null
}

interface PetVaccineSummary {
    pet: Pet
    vaccines: PetVaccine[]
    status: 'expired' | 'warning' | 'ok'
    statusLabel: string
    statusClass: string
    expiredCount: number
    warningCount: number
    okCount: number
    earliestExpiry: string
}

type StatusFilterType = 'all' | 'expired' | 'warning' | 'ok'
type Modality = 'creche' | 'hotel' | 'banho_tosa'

export default function PetVaccinesControlPage() {
    const supabase = createClient()
    const [rawVaccines, setRawVaccines] = useState<PetVaccine[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all')
    const [searchTerm, setSearchTerm] = useState('')
    
    // Modalidades State
    const [selectedModalities, setSelectedModalities] = useState<Modality[]>([])
    const [petModalitiesMap, setPetModalitiesMap] = useState<Record<string, Modality[]>>({})

    const toggleModality = (mod: Modality) => {
        setSelectedModalities(prev => 
            prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
        )
    }

    const getVaccineStatusType = (expiryDateStr: string): 'expired' | 'warning' | 'ok' => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const expiryDate = new Date(expiryDateStr)
        expiryDate.setHours(0, 0, 0, 0)

        // Limiar de 7 dias para aviso (vencendo em breve)
        const warningDate = new Date()
        warningDate.setDate(today.getDate() + 7)
        warningDate.setHours(0, 0, 0, 0)

        if (expiryDate < today) {
            return 'expired'
        } else if (expiryDate <= warningDate) {
            return 'warning'
        } else {
            return 'ok'
        }
    }

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-'
        const [year, month, day] = dateStr.split('-')
        return `${day}/${month}/${year}`
    }

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        try {
            // Buscar todas as vacinas
            const query = supabase
                .from('pet_vaccines')
                .select(`
                    id,
                    name,
                    batch_number,
                    application_date,
                    expiry_date,
                    pets (
                        id,
                        name,
                        breed,
                        photo_url,
                        species,
                        customers (
                            id,
                            name,
                            phone_1
                        )
                    )
                `)
                .order('expiry_date', { ascending: true })

            // Buscar agendamentos recentes e pacotes ativos em paralelo para mapear modalidades
            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
            const [{ data, error }, apptsRes, pkgsRes] = await Promise.all([
                query,
                supabase
                    .from('appointments')
                    .select('pet_id, services(name, service_categories(name))')
                    .gte('scheduled_at', ninetyDaysAgo)
                    .neq('status', 'cancelled'),
                supabase
                    .from('customer_packages')
                    .select('pet_id, service_packages(name)')
                    .eq('is_active', true)
            ])

            if (error) throw error

            // Mapear modalidades de cada pet
            const map: Record<string, Set<Modality>> = {}
            const addMod = (petId: string, mod: Modality) => {
                if (!map[petId]) map[petId] = new Set()
                map[petId].add(mod)
            }

            ;(apptsRes.data || []).forEach((a: any) => {
                if (!a.pet_id) return
                const cat = (a.services as any)?.service_categories?.name || a.services?.name || ''
                if (cat.includes('Creche')) addMod(a.pet_id, 'creche')
                else if (cat.includes('Hospedagem') || cat.includes('Hotel')) addMod(a.pet_id, 'hotel')
                else if (cat.includes('Banho') || cat.includes('Tosa')) addMod(a.pet_id, 'banho_tosa')
            })

            ;(pkgsRes.data || []).forEach((p: any) => {
                if (!p.pet_id) return
                const name = p.service_packages?.name?.toUpperCase() || ''
                if (name.includes('CRECHE')) addMod(p.pet_id, 'creche')
                else if (name.includes('HOTEL') || name.includes('HOSPEDAGEM')) addMod(p.pet_id, 'hotel')
                else if (name.includes('BANHO') || name.includes('TOSA') || name.includes('ESSENCIAL') || name.includes('PREMIUM')) addMod(p.pet_id, 'banho_tosa')
            })

            const finalMap: Record<string, Modality[]> = {}
            Object.entries(map).forEach(([petId, set]) => {
                finalMap[petId] = Array.from(set)
            })
            setPetModalitiesMap(finalMap)

            setRawVaccines((data as unknown as PetVaccine[]) || [])
        } catch (error) {
            console.error('Erro ao buscar vacinas dos pets:', error)
        } finally {
            setIsLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Agrupamento por Pet com consolidação do status de vacinação
    const petSummaries = useMemo(() => {
        // 1. Manter a dose mais recente de cada vacina por pet
        const latestVaccinesMap = new Map<string, PetVaccine>()
        rawVaccines.forEach(vac => {
            if (!vac.pets?.id) return
            const key = `${vac.pets.id}_${vac.name.trim().toLowerCase()}`
            const existing = latestVaccinesMap.get(key)
            if (!existing) {
                latestVaccinesMap.set(key, vac)
            } else {
                const currentExp = new Date(vac.expiry_date).getTime()
                const existingExp = new Date(existing.expiry_date).getTime()
                if (currentExp > existingExp) {
                    latestVaccinesMap.set(key, vac)
                }
            }
        })

        // 2. Agrupar vacinas por pet
        const petGroupsMap = new Map<string, { pet: Pet, vaccines: PetVaccine[] }>()
        Array.from(latestVaccinesMap.values()).forEach(vac => {
            if (!vac.pets?.id) return
            const existing = petGroupsMap.get(vac.pets.id)
            if (!existing) {
                petGroupsMap.set(vac.pets.id, {
                    pet: vac.pets,
                    vaccines: [vac]
                })
            } else {
                existing.vaccines.push(vac)
            }
        })

        // 3. Gerar sumário de cada pet com regras de status
        const list: PetVaccineSummary[] = Array.from(petGroupsMap.values()).map(group => {
            let expiredCount = 0
            let warningCount = 0
            let okCount = 0
            let earliestExpiry = group.vaccines[0]?.expiry_date || ''

            group.vaccines.forEach(v => {
                const st = getVaccineStatusType(v.expiry_date)
                if (st === 'expired') expiredCount++
                else if (st === 'warning') warningCount++
                else okCount++

                if (v.expiry_date && (!earliestExpiry || v.expiry_date < earliestExpiry)) {
                    earliestExpiry = v.expiry_date
                }
            })

            let status: 'expired' | 'warning' | 'ok' = 'ok'
            let statusLabel = 'Em Dia'
            let statusClass = styles.statusGreen

            if (expiredCount > 0) {
                status = 'expired'
                statusLabel = expiredCount === 1 ? 'Vencida' : `${expiredCount} Vencidas`
                statusClass = styles.statusRed
            } else if (warningCount > 0) {
                status = 'warning'
                statusLabel = warningCount === 1 ? 'Vencendo' : `${warningCount} Vencendo`
                statusClass = styles.statusYellow
            }

            // Ordenar vacinas do pet pela data de vencimento mais próxima
            group.vaccines.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime())

            return {
                pet: group.pet,
                vaccines: group.vaccines,
                status,
                statusLabel,
                statusClass,
                expiredCount,
                warningCount,
                okCount,
                earliestExpiry
            }
        })

        // 4. Ordenar pets: primeiro os com vacinas vencidas, depois vencendo, depois em dia
        list.sort((a, b) => {
            const priority = { expired: 0, warning: 1, ok: 2 }
            if (priority[a.status] !== priority[b.status]) {
                return priority[a.status] - priority[b.status]
            }
            return new Date(a.earliestExpiry).getTime() - new Date(b.earliestExpiry).getTime()
        })

        return list
    }, [rawVaccines])

    // Métricas dos contadores
    const stats = useMemo(() => {
        let totalPets = petSummaries.length
        let expiredPets = 0
        let warningPets = 0
        let okPets = 0

        petSummaries.forEach(s => {
            if (s.status === 'expired') expiredPets++
            else if (s.status === 'warning') warningPets++
            else okPets++
        })

        return { totalPets, expiredPets, warningPets, okPets }
    }, [petSummaries])

    // Filtros aplicados
    const filteredPets = useMemo(() => {
        return petSummaries.filter(summary => {
            // Filtro por status
            if (statusFilter === 'expired' && summary.status !== 'expired') return false
            if (statusFilter === 'warning' && summary.status !== 'warning') return false
            if (statusFilter === 'ok' && summary.status !== 'ok') return false

            // Filtro por modalidade selecionada
            if (selectedModalities.length > 0) {
                const petMods = petModalitiesMap[summary.pet.id] || []
                const matchesModality = selectedModalities.some(m => petMods.includes(m))
                if (!matchesModality) return false
            }

            // Filtro textual
            if (!searchTerm) return true
            const term = searchTerm.toLowerCase()
            const petName = summary.pet.name?.toLowerCase() || ''
            const breed = summary.pet.breed?.toLowerCase() || ''
            const tutorName = summary.pet.customers?.name?.toLowerCase() || ''
            const vacNames = summary.vaccines.map(v => v.name.toLowerCase()).join(' ')

            return (
                petName.includes(term) ||
                breed.includes(term) ||
                tutorName.includes(term) ||
                vacNames.includes(term)
            )
        })
    }, [petSummaries, statusFilter, selectedModalities, petModalitiesMap, searchTerm])

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <Link href="/owner" style={{ textDecoration: 'none', color: 'var(--primary)', fontWeight: '600', display: 'inline-block', marginBottom: '0.5rem' }}>
                        ← Voltar para o Dashboard
                    </Link>
                    <h1 className={styles.title}>💉 Vacinas dos Pets</h1>
                    <p className={styles.subtitle}>Visão consolidada por pet com acompanhamento e alerta de vencimento</p>
                </div>
            </div>

            {/* Cards de Resumo Rápido */}
            <div className={styles.statsRow}>
                <div 
                    className={`${styles.statCard} ${statusFilter === 'all' ? styles.statCardActive : ''}`}
                    onClick={() => setStatusFilter('all')}
                >
                    <span className={styles.statLabel}>Total de Pets</span>
                    <span className={styles.statValue}>{stats.totalPets}</span>
                </div>
                <div 
                    className={`${styles.statCard} ${statusFilter === 'expired' ? styles.statCardActive : ''}`}
                    onClick={() => setStatusFilter('expired')}
                >
                    <span className={styles.statLabel}>⚠️ Vacina Vencida</span>
                    <span className={`${styles.statValue} ${styles.statValueRed}`}>{stats.expiredPets}</span>
                </div>
                <div 
                    className={`${styles.statCard} ${statusFilter === 'warning' ? styles.statCardActive : ''}`}
                    onClick={() => setStatusFilter('warning')}
                >
                    <span className={styles.statLabel}>⏳ Vencendo (7 dias)</span>
                    <span className={`${styles.statValue} ${styles.statValueYellow}`}>{stats.warningPets}</span>
                </div>
                <div 
                    className={`${styles.statCard} ${statusFilter === 'ok' ? styles.statCardActive : ''}`}
                    onClick={() => setStatusFilter('ok')}
                >
                    <span className={styles.statLabel}>✅ Todas em Dia</span>
                    <span className={`${styles.statValue} ${styles.statValueGreen}`}>{stats.okPets}</span>
                </div>
            </div>

            {/* Controles de Filtro */}
            <div className={styles.filterControls}>
                <div className={styles.searchRow}>
                    <input
                        type="text"
                        placeholder="🔍 Buscar por pet, tutor, raça ou vacina..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.input}
                    />
                </div>

                <div className={styles.filterRow}>
                    <span className={styles.filterLabel}>Filtrar Status:</span>
                    <div className={styles.buttonGroup}>
                        <button
                            type="button"
                            className={`${styles.filterBtn} ${statusFilter === 'all' ? styles.filterBtnActive : ''}`}
                            onClick={() => setStatusFilter('all')}
                        >
                            Todos ({stats.totalPets})
                        </button>
                        <button
                            type="button"
                            className={`${styles.filterBtn} ${statusFilter === 'expired' ? styles.filterBtnActive : ''}`}
                            onClick={() => setStatusFilter('expired')}
                        >
                            ⚠️ Vencidas ({stats.expiredPets})
                        </button>
                        <button
                            type="button"
                            className={`${styles.filterBtn} ${statusFilter === 'warning' ? styles.filterBtnActive : ''}`}
                            onClick={() => setStatusFilter('warning')}
                        >
                            ⏳ Vencendo ({stats.warningPets})
                        </button>
                        <button
                            type="button"
                            className={`${styles.filterBtn} ${statusFilter === 'ok' ? styles.filterBtnActive : ''}`}
                            onClick={() => setStatusFilter('ok')}
                        >
                            ✅ Em Dia ({stats.okPets})
                        </button>
                    </div>
                </div>

                <div className={styles.filterRow} style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className={styles.filterLabel}>Filtrar por Modalidade:</span>
                    <div className={styles.buttonGroup}>
                        <button
                            type="button"
                            className={`${styles.filterBtn} ${selectedModalities.length === 0 ? styles.filterBtnActive : ''}`}
                            onClick={() => setSelectedModalities([])}
                        >
                            Todas as Modalidades
                        </button>
                        <button
                            type="button"
                            className={`${styles.filterBtn} ${selectedModalities.includes('creche') ? styles.filterBtnActive : ''}`}
                            onClick={() => toggleModality('creche')}
                            style={selectedModalities.includes('creche') ? { background: '#10b981', borderColor: '#10b981', color: 'white' } : {}}
                        >
                            🎾 Creche
                        </button>
                        <button
                            type="button"
                            className={`${styles.filterBtn} ${selectedModalities.includes('hotel') ? styles.filterBtnActive : ''}`}
                            onClick={() => toggleModality('hotel')}
                            style={selectedModalities.includes('hotel') ? { background: '#f97316', borderColor: '#f97316', color: 'white' } : {}}
                        >
                            🏨 Hotel / Hospedagem
                        </button>
                        <button
                            type="button"
                            className={`${styles.filterBtn} ${selectedModalities.includes('banho_tosa') ? styles.filterBtnActive : ''}`}
                            onClick={() => toggleModality('banho_tosa')}
                            style={selectedModalities.includes('banho_tosa') ? { background: '#2563eb', borderColor: '#2563eb', color: 'white' } : {}}
                        >
                            🛁 Banho e Tosa
                        </button>
                    </div>
                </div>
            </div>

            {/* Listagem de Pets */}
            {isLoading ? (
                <div className={styles.loadingWrapper}>
                    <span>Carregando vacinas dos pets...</span>
                </div>
            ) : filteredPets.length === 0 ? (
                <div className={styles.tableContainer}>
                    <div className={styles.noData}>
                        Nenhum pet encontrado para os filtros selecionados.
                    </div>
                </div>
            ) : (
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Pet</th>
                                <th>Tutor / Contato</th>
                                <th>Vacinas Cadastradas</th>
                                <th>Status Geral</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPets.map((summary) => {
                                const petUrl = `/owner/pets?openPetId=${summary.pet.id}&section=vaccines&returnTo=%2Fowner%2Fvacinas-pets`

                                return (
                                    <tr key={summary.pet.id}>
                                        <td data-label="Pet">
                                            <Link href={petUrl} style={{ textDecoration: 'none', color: 'inherit' }}>
                                                <div className={styles.petCell}>
                                                    <div className={styles.avatar}>
                                                        {summary.pet.photo_url ? (
                                                            <img
                                                                src={summary.pet.photo_url}
                                                                alt={summary.pet.name}
                                                                className={styles.avatarImg}
                                                            />
                                                        ) : (
                                                            summary.pet.species === 'cat' ? '🐱' : '🐶'
                                                        )}
                                                    </div>
                                                    <div className={styles.petInfo}>
                                                        <span className={styles.petName} style={{ color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}>
                                                            {summary.pet.name}
                                                        </span>
                                                        <span className={styles.petBreed}>{summary.pet.breed || 'Sem raça'}</span>
                                                        {(petModalitiesMap[summary.pet.id] || []).length > 0 && (
                                                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                                {petModalitiesMap[summary.pet.id].includes('creche') && (
                                                                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 600 }}>
                                                                        🎾 Creche
                                                                    </span>
                                                                )}
                                                                {petModalitiesMap[summary.pet.id].includes('hotel') && (
                                                                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(249, 115, 22, 0.15)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)', fontWeight: 600 }}>
                                                                        🏨 Hotel
                                                                    </span>
                                                                )}
                                                                {petModalitiesMap[summary.pet.id].includes('banho_tosa') && (
                                                                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(37, 99, 235, 0.15)', color: '#60a5fa', border: '1px solid rgba(37, 99, 235, 0.3)', fontWeight: 600 }}>
                                                                        🛁 Banho
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </Link>
                                        </td>
                                        <td data-label="Tutor / Contato">
                                            <div className={styles.tutorCell}>
                                                <span className={styles.tutorName}>{summary.pet.customers?.name || 'Sem tutor'}</span>
                                                {summary.pet.customers?.phone_1 && (
                                                    <a
                                                        href={getWhatsAppLink(summary.pet.customers.phone_1) || undefined}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={styles.whatsAppBtn}
                                                    >
                                                        <svg className={styles.whatsAppIcon} viewBox="0 0 24 24" fill="currentColor">
                                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
                                                        </svg>
                                                        WhatsApp
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                        <td data-label="Vacinas Cadastradas">
                                            <div className={styles.vaccinesList}>
                                                {summary.vaccines.length === 0 ? (
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Nenhuma vacina registrada</span>
                                                ) : (
                                                    summary.vaccines.map((v) => {
                                                        const st = getVaccineStatusType(v.expiry_date)
                                                        const chipClass = st === 'expired' 
                                                            ? styles.vacChipExpired 
                                                            : st === 'warning' 
                                                            ? styles.vacChipWarning 
                                                            : styles.vacChipOk

                                                        return (
                                                            <span 
                                                                key={v.id} 
                                                                className={`${styles.vacChip} ${chipClass}`}
                                                                title={`Vencimento: ${formatDate(v.expiry_date)}`}
                                                            >
                                                                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'currentColor', marginRight: '6px', flexShrink: 0 }} />
                                                                {v.name}
                                                            </span>
                                                        )
                                                    })
                                                )}
                                            </div>
                                        </td>
                                        <td data-label="Status Geral">
                                            <span className={`${styles.statusBadge} ${summary.statusClass}`}>
                                                {summary.statusLabel}
                                            </span>
                                        </td>
                                        <td data-label="Ações">
                                            <Link 
                                                href={petUrl}
                                                className={styles.iconActionBtn}
                                                title="Ver ficha do pet"
                                            >
                                                👁️
                                            </Link>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
