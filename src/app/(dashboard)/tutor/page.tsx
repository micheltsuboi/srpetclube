'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import PetRegistrationModal from '@/components/modules/PetRegistrationModal'

interface Pet {
    id: string
    name: string
    species: 'dog' | 'cat'
    breed: string
    photo_url: string | null
    weight_kg: number
}

interface TimelineEvent {
    id: string
    type: 'photo' | 'status' | 'feeding' | 'activity' | 'health' | 'bath_start' | 'bath_end' | 'general'
    observation: string
    photo_url: string | null
    created_at: string
    staff_name: string
}

interface CurrentAppointment {
    id: string
    service_name: string
    status: 'pending' | 'confirmed' | 'in_progress' | 'done'
    scheduled_at: string
    started_at: string | null
}

const statusLabels: Record<string, string> = {
    pending: 'Aguardando',
    confirmed: 'Confirmado',
    in_progress: 'Em Atendimento',
    done: 'Finalizado'
}

const statusColors: Record<string, string> = {
    pending: 'pending',
    confirmed: 'confirmed',
    in_progress: 'inProgress',
    done: 'done'
}

const eventIcons: Record<string, string> = {
    photo: '📸',
    status: '📋',
    feeding: '🍽️',
    activity: '🎾',
    health: '💊',
    bath_start: '🚿',
    bath_end: '✨',
    general: '📝'
}

export default function TutorPage() {
    const supabase = createClient()
    const [pets, setPets] = useState<Pet[]>([])
    const [selectedPet, setSelectedPet] = useState<Pet | null>(null)
    const [appointment, setAppointment] = useState<CurrentAppointment | null>(null)
    const [timeline, setTimeline] = useState<TimelineEvent[]>([])
    const [loading, setLoading] = useState(true)

    const [elapsedTime, setElapsedTime] = useState('')
    const [showPetModal, setShowPetModal] = useState(false)

    const fetchTutorAndPets = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // 1. Get Customer record linked to user
            const { data: customer } = await supabase
                .from('customers')
                .select('id')
                .eq('user_id', user.id)
                .single()

            if (!customer) {
                setLoading(false)
                return
            }

            // 2. Get Pets for this customer
            const { data: petData } = await supabase
                .from('pets')
                .select('*')
                .eq('customer_id', customer.id)
                .eq('is_active', true)

            if (petData && petData.length > 0) {
                setPets(petData)
                // Only set selected pet if it's not already set
                // or if the current selected pet is not in the list anymore
                setSelectedPet(prev => {
                    if (prev && petData.find(p => p.id === prev.id)) {
                        return prev;
                    }
                    return petData[0];
                })
            }
        } catch (error) {
            console.error('Error fetching tutor data:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase])

    const fetchAppointmentData = useCallback(async () => {
        if (!selectedPet?.id) return
        try {
            // Reset appointment and timeline before fetching new one
            setAppointment(null)
            setTimeline([])

            // 3. Get Today's Appointment for the selected pet
            const today = new Date().toISOString().split('T')[0]
            const { data: apptData } = await supabase
                .from('appointments')
                .select('id, scheduled_at, status, started_at, services(name)')
                .eq('pet_id', selectedPet.id)
                .gte('scheduled_at', `${today}T00:00:00`)
                .lte('scheduled_at', `${today}T23:59:59`)
                .order('scheduled_at', { ascending: false })
                .limit(1)
                .single()

            if (apptData) {
                setAppointment({
                    id: apptData.id,
                    service_name: (apptData.services as any)?.name || 'Serviço',
                    status: apptData.status as any,
                    scheduled_at: apptData.scheduled_at,
                    started_at: apptData.started_at
                })

                // 4. Get Daily Report Summary for this appointment
                const { data: reportData } = await supabase
                    .from('appointment_daily_reports')
                    .select('id, report_text, photos, created_at')
                    .eq('appointment_id', apptData.id)
                    .single()

                if (reportData) {
                    const events: TimelineEvent[] = []

                    // Add report text as a general event if it exists
                    if (reportData.report_text) {
                        events.push({
                            id: reportData.id + '_text',
                            type: 'general',
                            observation: reportData.report_text,
                            photo_url: null,
                            created_at: reportData.created_at,
                            staff_name: 'Equipe'
                        })
                    }

                    // Add each photo as a photo event
                    if (reportData.photos && reportData.photos.length > 0) {
                        reportData.photos.forEach((url: string, idx: number) => {
                            events.push({
                                id: reportData.id + '_photo_' + idx,
                                type: 'photo',
                                observation: idx === 0 ? 'Registro fotográfico do atendimento' : '',
                                photo_url: url,
                                created_at: reportData.created_at,
                                staff_name: 'Equipe'
                            })
                        })
                    }

                    setTimeline(events)
                }
            }
        } catch (error) {
            console.error('Error fetching appointment:', error)
        }
    }, [selectedPet?.id, supabase])

    useEffect(() => {
        fetchTutorAndPets()
    }, [fetchTutorAndPets])

    useEffect(() => {
        fetchAppointmentData()
    }, [fetchAppointmentData])

    // Real-time updates subscription
    useEffect(() => {
        if (!appointment?.id) return

        const channel = supabase
            .channel('tutor-updates')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'appointment_daily_reports',
                filter: `appointment_id=eq.${appointment.id}`
            }, () => {
                fetchAppointmentData() // Refresh on change
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'appointments',
                filter: `id=eq.${appointment.id}`
            }, () => {
                fetchAppointmentData()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [appointment?.id, fetchAppointmentData, supabase])

    useEffect(() => {
        if (!appointment?.started_at) return

        const calculateElapsed = () => {
            const start = new Date(appointment.started_at!)
            const now = new Date()
            const diff = now.getTime() - start.getTime()

            const hours = Math.floor(diff / (1000 * 60 * 60))
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

            if (hours > 0) {
                setElapsedTime(`${hours}h ${minutes}min`)
            } else {
                setElapsedTime(`${minutes} min`)
            }
        }

        calculateElapsed()
        const timer = setInterval(calculateElapsed, 60000)
        return () => clearInterval(timer)
    }, [appointment])

    const formatTime = (dateString: string) => {
        return new Date(dateString).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatRelativeTime = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        const minutes = Math.floor(diff / (1000 * 60))

        if (minutes < 1) return 'Agora'
        if (minutes < 60) return `Há ${minutes} min`
        const hours = Math.floor(minutes / 60)
        if (hours < 24) return `Há ${hours}h`
        return date.toLocaleDateString('pt-BR')
    }

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
                <p>Carregando as novidades do seu pet...</p>
            </div>
        )
    }

    if (!selectedPet) {
        return (
            <div className={styles.container}>
                <div className={styles.emptyState}>
                    <h1>Olá! 👋</h1>
                    <p>Parece que você ainda não tem pets cadastrados ou não foi vinculado a um pet. Entre em contato com a equipe da Sr Pet Clube para regularizar seu acesso.</p>
                    <Link href="/tutor/profile" className={styles.actionButton}>
                        Completar meu Perfil
                    </Link>
                    <button className={styles.actionButton} onClick={() => setShowPetModal(true)} style={{ marginTop: '1rem' }}>
                        Cadastrar Primeiro Pet
                    </button>
                </div>
                {showPetModal && (
                    <PetRegistrationModal
                        onClose={() => setShowPetModal(false)}
                        onSuccess={() => {
                            fetchTutorAndPets()
                            setShowPetModal(false)
                        }}
                    />
                )}
            </div>
        )
    }

    return (
        <div className={styles.container}>
            {/* Pet Header */}
            <div className={styles.petHeader}>
                <div className={styles.petAvatar}>
                    {selectedPet.photo_url ? (
                        <img src={selectedPet.photo_url} alt={selectedPet.name} />
                    ) : (
                        <span>{selectedPet.species === 'dog' ? '🐕' : '🐈'}</span>
                    )}
                </div>
                <div className={styles.petInfo}>
                    <h1 className={styles.petName}>{selectedPet.name}</h1>
                    <p className={styles.petBreed}>{selectedPet.breed} • {selectedPet.weight_kg}kg</p>
                </div>
                {pets.length > 1 && (
                    <select
                        className={styles.petSelector}
                        value={selectedPet.id}
                        onChange={(e) => {
                            const pet = pets.find(p => p.id === e.target.value)
                            if (pet) setSelectedPet(pet)
                        }}
                    >
                        {pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                )}
            </div>

            {/* Current Status Card */}
            {appointment ? (
                <div className={styles.statusCard}>
                    <div className={styles.statusHeader}>
                        <span className={`${styles.statusBadge} ${styles[statusColors[appointment.status]]}`}>
                            {appointment.status === 'in_progress' && '🛁 '}
                            {statusLabels[appointment.status]}
                        </span>
                        {appointment.status === 'in_progress' && elapsedTime && (
                            <span className={styles.elapsedTime}>⏱️ {elapsedTime}</span>
                        )}
                    </div>
                    <h2 className={styles.serviceName}>{appointment.service_name}</h2>
                    <p className={styles.scheduledTime}>
                        Agendado para hoje às {formatTime(appointment.scheduled_at)}
                    </p>

                    {appointment.status === 'in_progress' && (
                        <div className={styles.progressIndicator}>
                            <div className={styles.progressDots}>
                                <span className={styles.dot} />
                                <span className={styles.dot} />
                                <span className={styles.dot} />
                            </div>
                            <p>Seu pet está sendo cuidado com muito carinho!</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className={styles.noServiceCard}>
                    <h3>Nenhum serviço para hoje</h3>
                    <p>Que tal agendar um banho ou uma creche para {selectedPet.name}?</p>
                </div>
            )}

            {/* Timeline */}
            <div className={styles.timelineSection}>
                <h2 className={styles.sectionTitle}>📸 {appointment ? 'Timeline de Hoje' : 'Últimas Atualizações'}</h2>

                {timeline.length > 0 ? (
                    <div className={styles.timeline}>
                        {timeline.map((event, index) => (
                            <div key={event.id} className={styles.timelineItem}>
                                <div className={styles.timelineDot}>
                                    <span>{eventIcons[event.type] || '📋'}</span>
                                </div>
                                {index < timeline.length - 1 && (
                                    <div className={styles.timelineLine} />
                                )}

                                <div className={styles.timelineContent}>
                                    <div className={styles.timelineHeader}>
                                        <span className={styles.timelineTime}>
                                            {formatRelativeTime(event.created_at)}
                                        </span>
                                        <span className={styles.staffName}>por {event.staff_name}</span>
                                    </div>
                                    <p className={styles.timelineText}>{event.observation}</p>

                                    {event.photo_url && (
                                        <div className={styles.timelinePhoto}>
                                            <img src={event.photo_url} alt="Foto do atendimento" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.emptyTimeline}>
                        <p>Nenhuma atualização disponível no momento.</p>
                    </div>
                )}
            </div>


            {showPetModal && (
                <PetRegistrationModal
                    onClose={() => setShowPetModal(false)}
                    onSuccess={() => {
                        fetchTutorAndPets()
                        setShowPetModal(false)
                    }}
                />
            )}
        </div>
    )
}
