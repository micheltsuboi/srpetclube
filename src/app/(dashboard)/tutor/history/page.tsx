'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './page.module.css'
import TutorServiceDetailsModal from '@/components/TutorServiceDetailsModal'

interface Pet {
    id: string
    name: string
}

interface Appointment {
    id: string
    scheduled_at: string
    status: string
    pet_id: string
    services: {
        name: string
        category: string
    } | null
    pets: {
        name: string
    } | null
}

const categories = [
    { id: 'all', name: 'Todos' },
    { id: 'banho', name: 'Banho e Tosa' },
    { id: 'hotel', name: 'Hospedagem' },
    { id: 'creche', name: 'Creche' }
]

const categoryIcons: Record<string, string> = {
    banho: '🛁',
    tosa: '✂️',
    banho_tosa: '🛁',
    hotel: '🏨',
    creche: '🎾',
    combo: '✨',
    veterinario: '🩺',
    outro: '📝'
}

export default function HistoryPage() {
    const supabase = createClient()
    const [pets, setPets] = useState<Pet[]>([])
    const [selectedPetId, setSelectedPetId] = useState<string>('all')
    const [activeCategory, setActiveCategory] = useState('all')
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null)

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // 1. Get Customer
            const { data: customer } = await supabase
                .from('customers')
                .select('id')
                .eq('user_id', user.id)
                .single()

            if (!customer) return

            // 2. Get Pets
            const { data: petData } = await supabase
                .from('pets')
                .select('id, name')
                .eq('customer_id', customer.id)

            if (petData) setPets(petData)

            // 3. Get Appointments
            let query = supabase
                .from('appointments')
                .select('id, scheduled_at, status, pet_id, services(name, category), pets(name)')
                .order('scheduled_at', { ascending: false })

            if (selectedPetId !== 'all') {
                query = query.eq('pet_id', selectedPetId)
            }

            const { data: apptData, error } = await query

            if (error) throw error

            if (apptData) {
                let filtered = apptData as unknown as Appointment[]
                if (activeCategory !== 'all') {
                    filtered = filtered.filter(a => {
                        const cat = a.services?.category
                        if (activeCategory === 'banho') {
                            return ['banho', 'tosa', 'banho_tosa', 'combo'].includes(cat || '')
                        }
                        return cat === activeCategory
                    })
                }
                setAppointments(filtered)
            }
        } catch (error) {
            console.error('Error fetching history:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase, selectedPetId, activeCategory])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        })
    }

    const statusLabels: Record<string, string> = {
        pending: 'Agendado',
        confirmed: 'Confirmado',
        in_progress: 'Em Atendimento',
        done: 'Concluído',
        canceled: 'Cancelado',
        no_show: 'Faltou'
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Histórico</h1>
                <div className={styles.filters}>
                    {pets.length > 1 && (
                        <select
                            className={styles.petSelector}
                            value={selectedPetId}
                            onChange={(e) => setSelectedPetId(e.target.value)}
                        >
                            <option value="all">Todos os Pets</option>
                            {pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    )}

                    <div className={styles.categoryTabs}>
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                className={`${styles.tab} ${activeCategory === cat.id ? styles.active : ''}`}
                                onClick={() => setActiveCategory(cat.id)}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {loading ? (
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <p>Buscando histórico...</p>
                </div>
            ) : appointments.length > 0 ? (
                <div className={styles.historyList}>
                    {appointments.map(appt => (
                        <div
                            key={appt.id}
                            className={styles.serviceCard}
                            onClick={() => setSelectedAppointmentId(appt.id)}
                        >
                            <div className={styles.cardIcon}>
                                {categoryIcons[appt.services?.category || 'outro']}
                            </div>
                            <div className={styles.cardInfo}>
                                <h3 className={styles.serviceName}>{appt.services?.name}</h3>
                                <span className={styles.serviceDate}>
                                    {appt.pets?.name} • {formatDate(appt.scheduled_at)}
                                </span>
                                <span className={`${styles.serviceStatus} ${styles['status_' + appt.status]}`}>
                                    {statusLabels[appt.status] || appt.status}
                                </span>
                            </div>
                            <div style={{ alignSelf: 'center', opacity: 0.5 }}>
                                ❯
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className={styles.emptyHistory}>
                    <p>Nenhum serviço encontrado para este filtro.</p>
                </div>
            )}

            {selectedAppointmentId && (
                <TutorServiceDetailsModal
                    appointmentId={selectedAppointmentId}
                    onClose={() => setSelectedAppointmentId(null)}
                />
            )}
        </div>
    )
}
