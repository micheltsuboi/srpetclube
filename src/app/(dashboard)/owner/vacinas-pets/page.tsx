'use client'

import { useState, useEffect, useCallback } from 'react'
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

export default function PetVaccinesControlPage() {
    const supabase = createClient()
    const [vaccines, setVaccines] = useState<PetVaccine[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [filterType, setFilterType] = useState<'all' | 'today' | 'last_week' | 'next_week' | 'custom'>('all')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [searchTerm, setSearchTerm] = useState('')
    
    // Modalidades State
    type Modality = 'creche' | 'hotel' | 'banho_tosa'
    const [selectedModalities, setSelectedModalities] = useState<Modality[]>([])
    const [petModalitiesMap, setPetModalitiesMap] = useState<Record<string, Modality[]>>({})

    const toggleModality = (mod: Modality) => {
        setSelectedModalities(prev => 
            prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
        )
    }

    // Modal states
    const [updateModalOpen, setUpdateModalOpen] = useState(false)
    const [selectedVac, setSelectedVac] = useState<PetVaccine | null>(null)
    const [newAppDate, setNewAppDate] = useState('')
    const [newExpDate, setNewExpDate] = useState('')
    const [newBatch, setNewBatch] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const handleOpenUpdateModal = (vac: PetVaccine) => {
        setSelectedVac(vac)
        setNewAppDate(new Date().toISOString().split('T')[0])
        setNewExpDate('')
        setNewBatch('')
        setUpdateModalOpen(true)
    }

    const handleSaveUpdate = async () => {
        if (!selectedVac || !newAppDate || !newExpDate) {
            alert('Preencha as datas de aplicação e vencimento.')
            return
        }
        setIsSaving(true)
        const { data: { user } } = await supabase.auth.getUser()
        const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user?.id).single()

        if (!profile) {
            setIsSaving(false)
            return
        }

        const { error } = await supabase.from('pet_vaccines').insert({
            pet_id: selectedVac.pets?.id,
            name: selectedVac.name,
            batch_number: newBatch || null,
            application_date: newAppDate,
            expiry_date: newExpDate
        })

        setIsSaving(false)
        if (error) {
            console.error('Erro ao atualizar vacina', error)
            alert('Erro ao atualizar a vacina.')
        } else {
            alert('Vacina atualizada com sucesso! O histórico foi mantido.')
            setUpdateModalOpen(false)
            fetchData()
        }
    }

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        try {
            let query = supabase
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

            const today = new Date()
            const todayStr = today.toISOString().split('T')[0]

            if (filterType === 'today') {
                query = query.eq('expiry_date', todayStr)
            } else if (filterType === 'last_week') {
                const lastWeek = new Date()
                lastWeek.setDate(today.getDate() - 7)
                const lastWeekStr = lastWeek.toISOString().split('T')[0]
                query = query.gte('expiry_date', lastWeekStr).lte('expiry_date', todayStr)
            } else if (filterType === 'next_week') {
                const nextWeek = new Date()
                nextWeek.setDate(today.getDate() + 7)
                const nextWeekStr = nextWeek.toISOString().split('T')[0]
                query = query.gte('expiry_date', todayStr).lte('expiry_date', nextWeekStr)
            } else if (filterType === 'custom') {
                if (startDate) {
                    query = query.gte('expiry_date', startDate)
                }
                if (endDate) {
                    query = query.lte('expiry_date', endDate)
                }
            }

            // Ordena por data de vencimento mais próxima
            query = query.order('expiry_date', { ascending: true })

            // Buscar vacinas, agendamentos recentes e pacotes ativos em paralelo para mapear modalidades
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

            const rawVaccines = (data as unknown as PetVaccine[]) || []
            const latestVaccinesMap = new Map<string, PetVaccine>()
            
            rawVaccines.forEach(vac => {
                const key = `${vac.pets?.id}_${vac.name}`
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
            
            setVaccines(Array.from(latestVaccinesMap.values()))
        } catch (error) {
            console.error('Erro ao buscar vacinas dos pets:', error)
        } finally {
            setIsLoading(false)
        }
    }, [supabase, filterType, startDate, endDate])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Filtro textual e por modalidade
    const filteredVaccines = vaccines.filter(vac => {
        // Filtro por modalidade selecionada (se houver alguma selecionada)
        if (selectedModalities.length > 0) {
            if (!vac.pets?.id) return false
            const petMods = petModalitiesMap[vac.pets.id] || []
            const matchesModality = selectedModalities.some(m => petMods.includes(m))
            if (!matchesModality) return false
        }

        if (!searchTerm) return true
        const term = searchTerm.toLowerCase()
        const petName = vac.pets?.name?.toLowerCase() || ''
        const breed = vac.pets?.breed?.toLowerCase() || ''
        const tutorName = vac.pets?.customers?.name?.toLowerCase() || ''
        const vaccineName = vac.name?.toLowerCase() || ''
        const batch = vac.batch_number?.toLowerCase() || ''

        return (
            petName.includes(term) ||
            breed.includes(term) ||
            tutorName.includes(term) ||
            vaccineName.includes(term) ||
            batch.includes(term)
        )
    })

    const getVaccineStatus = (expiryDateStr: string) => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const expiryDate = new Date(expiryDateStr)
        expiryDate.setHours(0, 0, 0, 0)

        // Limiar de 7 dias para aviso (vencendo em breve)
        const warningDate = new Date()
        warningDate.setDate(today.getDate() + 7)
        warningDate.setHours(0, 0, 0, 0)

        if (expiryDate < today) {
            return {
                label: 'Vencida',
                class: styles.statusRed
            }
        } else if (expiryDate <= warningDate) {
            return {
                label: 'Vencendo',
                class: styles.statusYellow
            }
        } else {
            return {
                label: 'Em Dia',
                class: styles.statusGreen
            }
        }
    }

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-'
        // Previne problemas de timezone convertendo a data string pura (AAAA-MM-DD)
        const [year, month, day] = dateStr.split('-')
        return `${day}/${month}/${year}`
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <Link href="/owner" style={{ textDecoration: 'none', color: 'var(--primary)', fontWeight: '600', display: 'inline-block', marginBottom: '0.5rem' }}>
                        ← Voltar para o Dashboard
                    </Link>
                    <h1 className={styles.title}>💉 Vacinas dos Pets</h1>
                    <p className={styles.subtitle}>Gerencie e acompanhe o vencimento das vacinas aplicadas nos animais</p>
                </div>
            </div>

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
                    <span className={styles.filterLabel}>Filtrar Vencimento:</span>
                    <div className={styles.buttonGroup}>
                        <button
                            className={`${styles.filterBtn} ${filterType === 'all' ? styles.filterBtnActive : ''}`}
                            onClick={() => setFilterType('all')}
                        >
                            Todas
                        </button>
                        <button
                            className={`${styles.filterBtn} ${filterType === 'today' ? styles.filterBtnActive : ''}`}
                            onClick={() => setFilterType('today')}
                        >
                            Hoje
                        </button>
                        <button
                            className={`${styles.filterBtn} ${filterType === 'last_week' ? styles.filterBtnActive : ''}`}
                            onClick={() => setFilterType('last_week')}
                        >
                            Últimos 7 dias
                        </button>
                        <button
                            className={`${styles.filterBtn} ${filterType === 'next_week' ? styles.filterBtnActive : ''}`}
                            onClick={() => setFilterType('next_week')}
                        >
                            Próximos 7 dias
                        </button>
                        <button
                            className={`${styles.filterBtn} ${filterType === 'custom' ? styles.filterBtnActive : ''}`}
                            onClick={() => setFilterType('custom')}
                        >
                            Personalizado
                        </button>
                    </div>

                    {filterType === 'custom' && (
                        <div className={styles.customDateRange}>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className={styles.dateInput}
                            />
                            <span className={styles.dateSeparator}>até</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className={styles.dateInput}
                            />
                        </div>
                    )}
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

            {isLoading ? (
                <div className={styles.loadingWrapper}>
                    <span>Carregando vacinas...</span>
                </div>
            ) : filteredVaccines.length === 0 ? (
                <div className={styles.tableContainer}>
                    <div className={styles.noData}>
                        Nenhuma vacina encontrada para os filtros selecionados.
                    </div>
                </div>
            ) : (
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Pet</th>
                                <th>Tutor / Contato</th>
                                <th>Vacina</th>
                                <th>Aplicação</th>
                                <th>Vencimento</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVaccines.map((vac) => {
                                const status = getVaccineStatus(vac.expiry_date)
                                return (
                                    <tr key={vac.id}>
                                        <td data-label="Pet">
                                            <Link href={vac.pets?.id ? `/owner/pets?openPetId=${vac.pets.id}` : '#'} style={{ textDecoration: 'none', color: 'inherit' }}>
                                                <div className={styles.petCell}>
                                                    <div className={styles.avatar}>
                                                        {vac.pets?.photo_url ? (
                                                            <img
                                                                src={vac.pets.photo_url}
                                                                alt={vac.pets.name}
                                                                className={styles.avatarImg}
                                                            />
                                                        ) : (
                                                            vac.pets?.species === 'cat' ? '🐱' : '🐶'
                                                        )}
                                                    </div>
                                                    <div className={styles.petInfo}>
                                                        <span className={styles.petName} style={{ color: 'var(--primary)', cursor: 'pointer' }}>{vac.pets?.name || 'Pet desconhecido'}</span>
                                                        <span className={styles.petBreed}>{vac.pets?.breed || 'Sem raça'}</span>
                                                        {vac.pets?.id && (petModalitiesMap[vac.pets.id] || []).length > 0 && (
                                                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                                {petModalitiesMap[vac.pets.id].includes('creche') && (
                                                                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 600 }}>
                                                                        🎾 Creche
                                                                    </span>
                                                                )}
                                                                {petModalitiesMap[vac.pets.id].includes('hotel') && (
                                                                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(249, 115, 22, 0.15)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)', fontWeight: 600 }}>
                                                                        🏨 Hotel
                                                                    </span>
                                                                )}
                                                                {petModalitiesMap[vac.pets.id].includes('banho_tosa') && (
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
                                                <span className={styles.tutorName}>{vac.pets?.customers?.name || 'Sem tutor'}</span>
                                                {vac.pets?.customers?.phone_1 && (
                                                    <a
                                                        href={getWhatsAppLink(vac.pets.customers.phone_1) || undefined}
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
                                        <td data-label="Vacina">
                                            <span className={styles.vaccineName}>{vac.name}</span>
                                            {vac.batch_number && (
                                                <div className={styles.batchText}>Lote: {vac.batch_number}</div>
                                            )}
                                        </td>
                                        <td data-label="Aplicação">
                                            {formatDate(vac.application_date)}
                                        </td>
                                        <td data-label="Vencimento">
                                            {formatDate(vac.expiry_date)}
                                        </td>
                                        <td data-label="Status">
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <span className={`${styles.statusBadge} ${status.class}`}>
                                                    {status.label}
                                                </span>
                                                <button 
                                                    onClick={() => handleOpenUpdateModal(vac)}
                                                    style={{ padding: '6px 12px', fontSize: '0.75rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                                    title="Atualizar Vacina (Nova Aplicação)"
                                                >
                                                    Atualizar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {updateModalOpen && selectedVac && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '400px', border: '1px solid var(--border-color)' }}>
                        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem' }}>Atualizar Vacina</h2>
                        <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            Você está registrando uma nova aplicação de <strong>{selectedVac.name}</strong> para o pet <strong>{selectedVac.pets?.name}</strong>. O registro anterior será mantido no histórico.
                        </p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Data da Aplicação *</label>
                                <input type="date" value={newAppDate} onChange={e => setNewAppDate(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Data de Vencimento *</label>
                                <input type="date" value={newExpDate} onChange={e => setNewExpDate(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Lote (Opcional)</label>
                                <input type="text" value={newBatch} onChange={e => setNewBatch(e.target.value)} placeholder="Ex: L12345" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                            <button onClick={() => setUpdateModalOpen(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                            <button onClick={handleSaveUpdate} disabled={isSaving} style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                                {isSaving ? 'Salvando...' : 'Salvar Nova Aplicação'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
