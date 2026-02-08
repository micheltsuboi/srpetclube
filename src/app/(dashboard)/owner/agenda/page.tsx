'use client'

import { useState, useEffect, useCallback, useActionState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import {
    createAppointment,
    updateChecklist,
    updateAppointmentStatus,
    seedServices,
    updateAppointment,
    deleteAppointment,
    updatePetPreferences
} from '@/app/actions/appointment'
import { createScheduleBlock, deleteScheduleBlock, getScheduleBlocks } from '@/app/actions/schedule'

interface Appointment {
    id: string
    pet_id: string
    service_id: string
    scheduled_at: string
    status: 'pending' | 'confirmed' | 'in_progress' | 'done' | 'canceled' | 'no_show'
    checklist: { label: string, checked: boolean }[]
    notes: string | null
    pets: {
        name: string
        species: string
        breed: string | null
        perfume_allowed: boolean
        accessories_allowed: boolean
        special_care: string | null
        customers?: { name: string }
    }
    services: {
        name: string,
        duration: number,
        category_id?: string,
        service_categories?: { name: string, color: string, icon: string }
    }
}

interface ScheduleBlock {
    id: string
    start_at: string
    end_at: string
    reason: string
}

interface Pet { id: string, name: string }
interface Service { id: string, name: string }

const initialState = { message: '', success: false }

const DEFAULT_CHECKLIST_ITEMS = [
    { label: 'Corte de Unhas', checked: false },
    { label: 'Limpeza de Ouvidos', checked: false },
    { label: 'Escovação de Dentes', checked: false },
    { label: 'Banho', checked: false },
    { label: 'Tosa Higiênica', checked: false },
    { label: 'Secagem', checked: false },
    { label: 'Perfume / Finalização', checked: false },
]

export default function AgendaPage() {
    const router = useRouter()
    const supabase = createClient()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
    const [loading, setLoading] = useState(true)
    const [categoryFilter, setCategoryFilter] = useState<string>('')

    // Modal States
    const [showNewModal, setShowNewModal] = useState(false)
    const [showDetailModal, setShowDetailModal] = useState(false)
    const [isEditing, setIsEditing] = useState(false)

    // Data Loading for Forms
    const [pets, setPets] = useState<Pet[]>([])
    const [services, setServices] = useState<Service[]>([])
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)

    // Pre-selection from URL
    const [preSelectedPetId, setPreSelectedPetId] = useState('')
    const [preSelectedServiceId, setPreSelectedServiceId] = useState('')
    const [returnUrl, setReturnUrl] = useState<string | null>(null)

    // Checklist State
    const [currentChecklist, setCurrentChecklist] = useState<{ label: string, checked: boolean }[]>([])

    // View & Blocks State
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')
    const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
    const [showBlockModal, setShowBlockModal] = useState(false)
    const [selectedHourSlot, setSelectedHourSlot] = useState<string | null>(null)

    // Actions
    const [createState, createAction, isCreatePending] = useActionState(createAppointment, initialState)
    const [updateState, updateAction, isUpdatePending] = useActionState(updateAppointment, initialState)

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search)
            const petId = params.get('petId')
            const serviceId = params.get('serviceId')
            const retUrl = params.get('returnUrl')

            if (retUrl) setReturnUrl(retUrl)

            if (petId || serviceId) {
                if (petId) setPreSelectedPetId(petId)
                if (serviceId) setPreSelectedServiceId(serviceId)
                setShowNewModal(true)
            }
        }
    }, [])

    // ... resto do código inalterado ...

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile?.org_id) return

            // Load Metadata
            if (pets.length === 0) {
                const { data: p } = await supabase.from('pets').select('id, name').order('name')
                if (p) setPets(p)
                const { data: s } = await supabase.from('services').select('id, name').eq('org_id', profile.org_id).order('name')
                if (s) setServices(s)
            }

            // Date Range Calculation
            let startDateStr, endDateStr
            const localDate = new Date(selectedDate + 'T00:00:00') // Force local midnight

            if (viewMode === 'day') {
                startDateStr = `${selectedDate}T00:00:00`
                endDateStr = `${selectedDate}T23:59:59`
            } else if (viewMode === 'week') {
                const start = new Date(localDate)
                start.setDate(localDate.getDate() - localDate.getDay()) // Domingo

                const end = new Date(start)
                end.setDate(start.getDate() + 6)
                end.setHours(23, 59, 59, 999)

                startDateStr = start.toISOString()
                endDateStr = end.toISOString()
            } else { // month
                const start = new Date(localDate.getFullYear(), localDate.getMonth(), 1)
                const end = new Date(localDate.getFullYear(), localDate.getMonth() + 1, 0)
                end.setHours(23, 59, 59, 999)

                startDateStr = start.toISOString()
                endDateStr = end.toISOString()
            }

            // Fetch Blocks
            try {
                const blks = await getScheduleBlocks(startDateStr, endDateStr)
                setBlocks(blks as unknown as ScheduleBlock[])
            } catch (e) {
                console.error('Error fetching blocks', e)
            }

            // Fetch Appointments
            const { data: appts } = await supabase
                .from('appointments')
                .select(`
                    id, pet_id, service_id, scheduled_at, status, checklist, notes,
                    pets ( 
                        name, species, breed, 
                        perfume_allowed, accessories_allowed, special_care,
                        customers ( name )
                    ),
                    services ( 
                        name, duration_minutes, category_id,
                        service_categories ( name, color, icon )
                    )
                `)
                .eq('org_id', profile.org_id)
                .gte('scheduled_at', startDateStr)
                .lte('scheduled_at', endDateStr)
                .order('scheduled_at')

            if (appts) {
                setAppointments(appts as unknown as Appointment[])
            }

        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }, [supabase, selectedDate, viewMode, pets.length])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Handle Success Effects
    useEffect(() => {
        if (createState.success) {
            setShowNewModal(false)
            fetchData()
            alert(createState.message)
            if (returnUrl) router.push(returnUrl)
        } else if (createState.message) {
            alert(createState.message)
        }
    }, [createState, fetchData, returnUrl, router])

    useEffect(() => {
        if (updateState.success) {
            setShowDetailModal(false)
            setIsEditing(false)
            setSelectedAppointment(null)
            fetchData()
            alert(updateState.message)
        } else if (updateState.message) {
            alert(updateState.message)
        }
    }, [updateState, fetchData])

    const handleDateChange = (offset: number) => {
        const d = new Date(selectedDate)
        d.setDate(d.getDate() + offset)
        setSelectedDate(d.toISOString().split('T')[0])
    }

    const handleOpenDetail = (appt: Appointment) => {
        setSelectedAppointment(appt)
        setIsEditing(false)
        if (appt.checklist && Array.isArray(appt.checklist) && appt.checklist.length > 0) {
            setCurrentChecklist(appt.checklist)
        } else {
            setCurrentChecklist(JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_ITEMS)))
        }
        setShowDetailModal(true)
    }

    const handleStartService = async (e: React.MouseEvent, appt: Appointment) => {
        e.stopPropagation()
        if (confirm(`Iniciar serviço para ${appt.pets?.name}?`)) {
            const res = await updateAppointmentStatus(appt.id, 'in_progress')
            if (res.success) {
                fetchData() // Refresh status
            }
        }
    }

    const handleDelete = async () => {
        if (!selectedAppointment) return
        if (confirm('Tem certeza que deseja excluir este agendamento?')) {
            const res = await deleteAppointment(selectedAppointment.id)
            if (res.success) {
                setShowDetailModal(false)
                setSelectedAppointment(null)
                fetchData()
                alert(res.message)
            } else {
                alert(res.message)
            }
        }
    }

    const handleSeed = async () => {
        if (!confirm('Deseja cadastrar os serviços padrão?')) return
        setLoading(true)
        const res = await seedServices()
        alert(res.message)
        window.location.reload()
    }

    const saveChecklist = async () => {
        if (!selectedAppointment) return
        const res = await updateChecklist(selectedAppointment.id, currentChecklist)
        if (res.success) {
            setAppointments(prev => prev.map(a =>
                a.id === selectedAppointment.id ? { ...a, checklist: currentChecklist } : a
            ))
            alert('Checklist salvo!')
        }
    }

    const handlePrefToggle = async (type: 'perfume' | 'accessories', value: boolean) => {
        if (!selectedAppointment) return
        const field = type === 'perfume' ? 'perfume_allowed' : 'accessories_allowed'

        // Optimistic Update
        const updatedAppt = {
            ...selectedAppointment,
            pets: { ...selectedAppointment.pets, [field]: value }
        }
        setSelectedAppointment(updatedAppt)

        // Update all cards for this pet
        setAppointments(prev => prev.map(a =>
            a.pet_id === selectedAppointment.pet_id ? { ...a, pets: { ...a.pets, [field]: value } } : a
        ))

        await updatePetPreferences(selectedAppointment.pet_id, { [field]: value })
    }

    const formatTime = (isoString: string) => {
        // Adjust display to BRT if needed, but browser locale usually handles it if system is BRT.
        // If system is UTC, we want to force BRT display.
        // Hack: parse as UTC, subtract 3h if we want specifically "Server Time"
        // But let's trust toLocaleTimeString first.
        return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }

    const getStatusLabel = (status: string) => {
        const map: Record<string, string> = {
            pending: 'Pendente',
            confirmed: 'Confirmado',
            in_progress: 'Em Andamento',
            done: 'Finalizado',
            canceled: 'Cancelado',
            no_show: 'Não Compareceu'
        }
        return map[status] || status
    }

    const handleCreateBlock = async (formData: FormData) => {
        const reason = formData.get('reason') as string
        if (!selectedHourSlot) return

        const d = new Date(`${selectedDate}T${selectedHourSlot}:00:00`)
        const e = new Date(d)
        e.setHours(d.getHours() + 1)

        setLoading(true)
        const res = await createScheduleBlock({
            start_at: d.toISOString(),
            end_at: e.toISOString(),
            reason
        })
        setLoading(false)
        if (res.success) {
            setShowBlockModal(false)
            fetchData()
        } else {
            alert(res.message)
        }
    }

    const handleBlockDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('Remover bloqueio?')) return
        setLoading(true)
        const res = await deleteScheduleBlock(id)
        setLoading(false)
        if (res.success) fetchData()
        else alert(res.message)
    }

    const renderAppointmentCard = (appt: Appointment) => {
        const categoryColor = appt.services?.service_categories?.color || '#2563EB'
        const categoryIcon = appt.services?.service_categories?.icon || '📋'

        return (
            <div
                key={appt.id}
                className={styles.appointmentCard}
                onClick={(e) => { e.stopPropagation(); handleOpenDetail(appt) }}
                style={{
                    minWidth: '300px',
                    borderLeft: `4px solid ${categoryColor}`,
                    backgroundColor: appt.status === 'done' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                    opacity: appt.status === 'done' ? 0.7 : 1
                }}
            >
                <div className={styles.timeDisplay}>{formatTime(appt.scheduled_at)}</div>
                <div className={styles.cardTop}>
                    <div className={styles.petInfoMain}>
                        <div className={styles.petAvatar}>{appt.pets?.species === 'cat' ? '🐱' : '🐶'}</div>
                        <div className={styles.petDetails}>
                            <div className={styles.petName}>
                                {appt.pets?.name}
                                <span className={styles.statusBadge}>{getStatusLabel(appt.status)}</span>
                            </div>
                            <span className={styles.petBreed}>{appt.pets?.breed}</span>
                            <span className={styles.tutorName}>👤 {appt.pets?.customers?.name}</span>
                        </div>
                    </div>
                    {(appt.status === 'pending' || appt.status === 'confirmed') && (
                        <button className={styles.startButton} onClick={(e) => handleStartService(e, appt)}>▶ Iniciar</button>
                    )}
                    {appt.status === 'in_progress' && (
                        <div style={{ color: '#fbbf24', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>⏳ Em andamento...</div>
                    )}
                </div>
                <div className={styles.serviceLine}>
                    <span style={{ marginRight: '0.5rem' }}>{categoryIcon}</span>
                    {appt.services?.name}
                </div>
            </div>
        )
    }

    const renderDayView = () => {
        const hours = Array.from({ length: 10 }, (_, i) => i + 8)
        return (
            <div className={styles.dayGrid}>
                {hours.map(h => {
                    const timeStr = `${h.toString().padStart(2, '0')}:00`
                    const slotAppts = appointments.filter(a => {
                        const d = new Date(a.scheduled_at)
                        // Consistent local hour check
                        const localH = new Date(d.getTime() - 3 * 3600 * 1000).getUTCHours()
                        const matchesHour = localH === h
                        const matchesCategory = !categoryFilter || a.services?.service_categories?.name === categoryFilter
                        return matchesHour && matchesCategory
                    })
                    const slotBlocks = blocks.filter(b => {
                        const start = new Date(new Date(b.start_at).getTime() - 3 * 3600 * 1000)
                        const end = new Date(new Date(b.end_at).getTime() - 3 * 3600 * 1000)
                        return h >= start.getUTCHours() && h < end.getUTCHours()
                    })

                    return (
                        <div key={h} className={styles.hourRow}>
                            <div className={styles.hourLabel}>{timeStr}</div>
                            <div className={styles.hourContent}>
                                {slotBlocks.map(b => (
                                    <div key={b.id} className={styles.blockedCard} title={b.reason}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style={{ flexShrink: 0 }}>
                                                <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                                            </svg>
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.reason || 'Bloqueado'}</span>
                                        </div>
                                        <button onClick={(e) => handleBlockDelete(b.id, e)} style={{ marginLeft: 'auto' }}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                {slotAppts.map(renderAppointmentCard)}
                                {slotBlocks.length === 0 && slotAppts.length === 0 && (
                                    <>
                                        <div className={styles.addSlotBtn} onClick={() => {
                                            setSelectedHourSlot(h.toString().padStart(2, '0'))
                                            setShowNewModal(true)
                                        }}>+</div>
                                        <button
                                            className={`${styles.addSlotBtn} ${styles.blockBtn}`}
                                            style={{ maxWidth: '50px', borderLeft: '1px dashed #334155' }}
                                            title="Bloquear Horário"
                                            onClick={() => {
                                                setSelectedHourSlot(h.toString().padStart(2, '0'))
                                                setShowBlockModal(true)
                                            }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" className={styles.lockIcon}>
                                                <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    const renderWeekView = () => {
        const d = new Date(selectedDate + 'T12:00:00')
        const dayOfWeek = d.getDay()
        const startOfWeek = new Date(d)
        startOfWeek.setDate(d.getDate() - dayOfWeek)

        const weekDays = Array.from({ length: 7 }, (_, i) => {
            const date = new Date(startOfWeek)
            date.setDate(startOfWeek.getDate() + i)
            return date
        })

        const hours = Array.from({ length: 10 }, (_, i) => i + 8)

        return (
            <div className={styles.weekGrid}>
                <div className={styles.weekHeaderCell}></div>
                {weekDays.map(day => {
                    const dateStr = day.toISOString().split('T')[0]
                    const isSelected = dateStr === selectedDate
                    return (
                        <div
                            key={dateStr}
                            className={`${styles.weekHeaderCell} ${isSelected ? styles.activeDay : ''}`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => { setSelectedDate(dateStr); setViewMode('day'); }}
                        >
                            {day.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' })}
                        </div>
                    )
                })}

                {hours.map(h => (
                    <div key={h} style={{ display: 'contents' }}>
                        <div className={styles.weekTimeCell}>{h}:00</div>
                        {weekDays.map(day => {
                            const dateStr = day.toISOString().split('T')[0]
                            const cellAppts = appointments.filter(a => {
                                const ad = new Date(a.scheduled_at)
                                const localH = new Date(ad.getTime() - 3 * 3600 * 1000).getUTCHours()
                                const localD = new Date(ad.getTime() - 3 * 3600 * 1000).toISOString().split('T')[0]
                                const matchesTime = localH === h && localD === dateStr
                                const matchesCategory = !categoryFilter || a.services?.service_categories?.name === categoryFilter
                                return matchesTime && matchesCategory
                            })
                            const isBlocked = blocks.some(b => {
                                const start = new Date(new Date(b.start_at).getTime() - 3 * 3600 * 1000)
                                const end = new Date(new Date(b.end_at).getTime() - 3 * 3600 * 1000)
                                const localD = start.toISOString().split('T')[0]
                                return localD === dateStr && h >= start.getUTCHours() && h < end.getUTCHours()
                            })

                            return (
                                <div key={`${dateStr}-${h}`} className={styles.weekCell} onClick={() => {
                                    setSelectedDate(dateStr)
                                    setViewMode('day')
                                }}>
                                    {isBlocked && <div className={styles.blockedOverlay} title="Bloqueado" />}
                                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {cellAppts.map(a => {
                                            const color = a.services?.service_categories?.color || '#2563EB'
                                            return (
                                                <div
                                                    key={a.id}
                                                    className={styles.weekEventPill}
                                                    title={`${a.pets?.name} - ${a.services.name}`}
                                                    style={{ backgroundColor: color, color: 'white' }}
                                                >
                                                    {a.pets?.name}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        )
    }

    const renderMonthView = () => {
        const d = new Date(selectedDate + 'T12:00:00')
        const year = d.getFullYear()
        const month = d.getMonth()
        const firstDay = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        const days = []
        for (let i = 0; i < firstDay; i++) days.push(null)
        for (let i = 1; i <= daysInMonth; i++) days.push(i)

        return (
            <div className={styles.monthGrid}>
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                    <div key={day} className={styles.monthHeader}>{day}</div>
                ))}

                {days.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className={styles.monthCell} style={{ background: 'var(--bg-tertiary)' }} />

                    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
                    const isToday = dateStr === selectedDate
                    const dayAppts = appointments.filter(a => {
                        const ad = new Date(new Date(a.scheduled_at).getTime() - 3 * 3600 * 1000)
                        const matchesDate = ad.toISOString().split('T')[0] === dateStr
                        const matchesCategory = !categoryFilter || a.services?.service_categories?.name === categoryFilter
                        return matchesDate && matchesCategory
                    })

                    return (
                        <div key={day} className={`${styles.monthCell} ${isToday ? styles.today : ''}`} onClick={() => {
                            setSelectedDate(dateStr)
                            setViewMode('day')
                        }}>
                            <span className={styles.monthDate}>{day}</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                                {dayAppts.slice(0, 3).map(a => {
                                    const color = a.services?.service_categories?.color || '#2563EB'
                                    return (
                                        <div
                                            key={a.id}
                                            className={styles.monthEventDot}
                                            title={a.services.name}
                                            style={{ backgroundColor: color, color: 'white' }}
                                        >
                                            {a.pets?.name}
                                        </div>
                                    )
                                })}
                                {dayAppts.length > 3 && (
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', paddingLeft: '4px' }}>
                                        +{dayAppts.length - 3} mais
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <button
                        onClick={() => router.push(returnUrl || '/owner')}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', marginBottom: '0.5rem', fontSize: '0.9rem', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                    >
                        ← Voltar
                    </button>
                    <h1 className={styles.title}>📅 Agenda</h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className={styles.viewSelector} style={{ margin: 0 }}>
                        <button className={`${styles.viewBtn} ${viewMode === 'day' ? styles.active : ''}`} onClick={() => setViewMode('day')}>Dia</button>
                        <button className={`${styles.viewBtn} ${viewMode === 'week' ? styles.active : ''}`} onClick={() => setViewMode('week')}>Semana</button>
                        <button className={`${styles.viewBtn} ${viewMode === 'month' ? styles.active : ''}`} onClick={() => setViewMode('month')}>Mês</button>
                    </div>

                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        <option value="">Todos Serviços</option>
                        <option value="Banho e Tosa">🚿 Banho e Tosa</option>
                        <option value="Creche">🎾 Creche</option>
                        <option value="Hospedagem">🏨 Hospedagem</option>
                    </select>

                    {!loading && services.length === 0 && (
                        <button onClick={handleSeed} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                            ⚠️ Inicializar Serviços
                        </button>
                    )}
                    <button className={styles.actionButton} onClick={() => {
                        setSelectedHourSlot(null)
                        setShowNewModal(true)
                    }}>
                        + Novo
                    </button>
                </div>
            </div>

            {/* Date Filter */}
            <div className={styles.dateFilter}>
                <button className={styles.dateBtn} onClick={() => handleDateChange(-1)}>◀</button>
                <span className={styles.currentDate}>
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                <button className={styles.dateBtn} onClick={() => handleDateChange(1)}>▶</button>
            </div>

            {viewMode === 'day' && renderDayView()}
            {viewMode === 'week' && renderWeekView()}
            {viewMode === 'month' && renderMonthView()}

            {/* Create Modal */}
            {showNewModal && (
                <div className={styles.modalOverlay} onClick={() => setShowNewModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>Novo Agendamento</h2>
                        <form action={createAction}>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Pet *</label>
                                    <select name="petId" className={styles.select} required defaultValue={preSelectedPetId || ""} key={preSelectedPetId}>
                                        <option value="" disabled>Selecione...</option>
                                        {pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Serviço *</label>
                                    <select name="serviceId" className={styles.select} required defaultValue={preSelectedServiceId || ""} key={preSelectedServiceId}>
                                        <option value="" disabled>Selecione...</option>
                                        {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Data *</label>
                                    <input name="date" type="date" className={styles.input} required defaultValue={selectedDate} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Horário *</label>
                                    <select name="time" className={styles.select} required defaultValue={selectedHourSlot ? `${selectedHourSlot}:00` : ""}>
                                        <option value="" disabled>Selecione...</option>
                                        {Array.from({ length: 10 }, (_, i) => i + 8).map(h => (
                                            <option key={h} value={`${h.toString().padStart(2, '0')}:00`}>{h}:00</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Observações</label>
                                <textarea name="notes" className={styles.textarea} rows={2} />
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowNewModal(false)}>Cancelar</button>
                                <button type="submit" className={styles.submitBtn} disabled={isCreatePending}>Agendar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Detail / Edit Modal */}
            {showDetailModal && selectedAppointment && (
                <div className={styles.modalOverlay} onClick={() => setShowDetailModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>
                                {isEditing ? 'Editar Agendamento' : 'Detalhes do Serviço'}
                                <div style={{ fontSize: '0.9rem', fontWeight: 400, marginTop: '0.5rem', color: '#666' }}>
                                    {selectedAppointment.pets?.name}
                                </div>
                            </h2>
                            {!isEditing && (
                                <button onClick={() => setIsEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>
                                    ✏️ Editar
                                </button>
                            )}
                        </div>

                        {isEditing ? (
                            /* Edit Form */
                            <form action={updateAction}>
                                <input type="hidden" name="id" value={selectedAppointment.id} />
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Serviço</label>
                                        <select name="serviceId" className={styles.select} defaultValue={selectedAppointment.service_id}>
                                            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Data</label>
                                        <input name="date" type="date" className={styles.input} defaultValue={new Date(selectedAppointment.scheduled_at).toISOString().split('T')[0]} />
                                        {/* Note: Naive split might be off due to UTC. Ideally specific format. */}
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>Horário</label>
                                        <select name="time" className={styles.select} defaultValue={new Date(selectedAppointment.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).slice(0, 5)}>
                                            {Array.from({ length: 10 }, (_, i) => i + 8).map(h => (
                                                <option key={h} value={`${h.toString().padStart(2, '0')}:00`}>{h}:00</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Observações</label>
                                    <textarea name="notes" className={styles.textarea} defaultValue={selectedAppointment.notes || ''} />
                                </div>

                                <div className={styles.modalActions} style={{ justifyContent: 'space-between' }}>
                                    <button type="button" className={styles.deleteBtn} onClick={handleDelete}>Excluir Agendamento</button>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button type="button" className={styles.cancelBtn} onClick={() => setIsEditing(false)}>Cancelar</button>
                                        <button type="submit" className={styles.submitBtn} disabled={isUpdatePending}>Salvar</button>
                                    </div>
                                </div>
                            </form>
                        ) : (
                            /* View Mode */
                            <>
                                <div className={styles.checklistContainer}>
                                    <div className={styles.modalHeader} style={{ marginBottom: '0.5rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '1rem', color: 'white' }}>Checklist</h3>
                                        <button onClick={saveChecklist} style={{ background: 'var(--success)', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', color: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>Salvar</button>
                                    </div>
                                    <div className={styles.progressBar}>
                                        <div className={styles.progressValue} style={{ width: `${(currentChecklist.filter(i => i.checked).length / currentChecklist.length) * 100}%` }} />
                                    </div>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {currentChecklist.map((item, idx) => (
                                            <div key={idx} className={styles.checklistItem} onClick={() => {
                                                const newL = [...currentChecklist]; newL[idx].checked = !newL[idx].checked; setCurrentChecklist(newL)
                                            }}>
                                                <input type="checkbox" checked={item.checked} readOnly style={{ marginRight: '0.5rem' }} />
                                                <span style={{ color: item.checked ? 'white' : '#94a3b8' }}>{item.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#cbd5e1' }}>Preferências do Pet</h3>
                                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedAppointment.pets.perfume_allowed || false}
                                                onChange={(e) => handlePrefToggle('perfume', e.target.checked)}
                                            />
                                            🌸 Permitir Perfume
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedAppointment.pets.accessories_allowed || false}
                                                onChange={(e) => handlePrefToggle('accessories', e.target.checked)}
                                            />
                                            🎀 Acessórios
                                        </label>
                                    </div>
                                </div>

                                <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                                    <label className={styles.label}>Status:</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {['pending', 'in_progress', 'done'].map(st => (
                                            <button
                                                key={st}
                                                onClick={async () => {
                                                    await updateAppointmentStatus(selectedAppointment.id, st)
                                                    setSelectedAppointment({ ...selectedAppointment, status: st as Appointment['status'] })
                                                    fetchData()
                                                }}
                                                style={{
                                                    background: selectedAppointment.status === st ? 'var(--primary)' : 'transparent',
                                                    border: '1px solid var(--border)',
                                                    color: selectedAppointment.status === st ? 'white' : 'var(--text-secondary)',
                                                    padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer'
                                                }}
                                            >
                                                {getStatusLabel(st)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className={styles.modalActions}>
                                    <button className={styles.cancelBtn} onClick={() => setShowDetailModal(false)}>Fechar</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Block Modal */}
            {showBlockModal && (
                <div className={styles.modalOverlay} onClick={() => setShowBlockModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <h2 className={styles.modalTitle}>Bloquear Horário</h2>
                        <p style={{ marginBottom: '1rem', color: '#cbd5e1' }}>Bloquear agenda às {selectedHourSlot}:00?</p>
                        <form action={handleCreateBlock}>
                            <input name="reason" placeholder="Motivo (opcional)" className={styles.input} style={{ marginBottom: '1rem' }} />
                            <div className={styles.modalActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowBlockModal(false)}>Cancelar</button>
                                <button type="submit" className={styles.submitBtn}>Confirmar Bloqueio</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
