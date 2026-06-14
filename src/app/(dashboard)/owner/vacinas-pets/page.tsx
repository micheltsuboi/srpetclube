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

            const { data, error } = await query
            if (error) throw error

            setVaccines((data as unknown as PetVaccine[]) || [])
        } catch (error) {
            console.error('Erro ao buscar vacinas dos pets:', error)
        } finally {
            setIsLoading(false)
        }
    }, [supabase, filterType, startDate, endDate])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Filtro textual local para busca em tempo real sem sobrecarregar o banco
    const filteredVaccines = vaccines.filter(vac => {
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
                                                    <span className={styles.petName}>{vac.pets?.name || 'Pet desconhecido'}</span>
                                                    <span className={styles.petBreed}>{vac.pets?.breed || 'Sem raça'}</span>
                                                </div>
                                            </div>
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
                                            <span className={`${styles.statusBadge} ${status.class}`}>
                                                {status.label}
                                            </span>
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
