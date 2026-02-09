'use client'
/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useEffect, useCallback, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import {
    createAppointment,
    updateAppointment,
    deleteAppointment,
    checkInAppointment,
    checkOutAppointment,
    updateChecklist,
    updateAppointmentStatus,
    updatePetPreferences
} from '@/app/actions/appointment'
import {
    createScheduleBlock,
    deleteScheduleBlock
} from '@/app/actions/schedule'
import { format } from 'date-fns'

interface Customer {
    name: string
}

interface Pet {
    id: string
    name: string
    species: string
    breed: string | null
    customers: Customer | null
    perfume_allowed: boolean
    accessories_allowed: boolean
    special_care: string | null
}

interface ServiceCategory {
    id: string
    name: string
    color: string
    icon: string
}

interface Service {
    id: string
    name: string
    duration_minutes?: number
    base_price: number
    category_id: string
    service_categories?: ServiceCategory
    scheduling_rules?: { day: number, species: string[] }[]
}

interface Appointment {
    id: string
    pet_id: string
    service_id: string
    scheduled_at: string
    status: 'pending' | 'confirmed' | 'in_progress' | 'done' | 'cancelled'
    checklist: any
    notes: string | null
    actual_check_in: string | null
    actual_check_out: string | null
    pets: Pet | null
    services: Service | null
}

interface ScheduleBlock {
    id: string
    start_at: string
    end_at: string
    reason: string
}

const DEFAULT_CHECKLIST_ITEMS = [
    { item: 'Corte de Unha', done: false },
    { item: 'Limpeza de Ouvido', done: false },
    { item: 'Escovação de Dentes', done: false },
    { item: 'Tosa Higiênica', done: false }
]

const initialState = { message: '', success: false }

export default function AgendaPage() {
    const supabase = createClient()
    const router = useRouter()

    // Data State
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
    const [pets, setPets] = useState<Pet[]>([])
    const [services, setServices] = useState<Service[]>([])

    // UI State
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')
    const [loading, setLoading] = useState(true)
    const [categoryFilter, setCategoryFilter] = useState<string>('')

    // Modal State
    const [showNewModal, setShowNewModal] = useState(false)
    const [showDetailModal, setShowDetailModal] = useState(false)
    const [showBlockModal, setShowBlockModal] = useState(false)

    // Selection State
    const [selectedHourSlot, setSelectedHourSlot] = useState<string | null>(null)
    const [preSelectedPetId, setPreSelectedPetId] = useState<string | null>(null)
    const [preSelectedServiceId, setPreSelectedServiceId] = useState<string | null>(null)
    const [selectedServiceId, setSelectedServiceId] = useState<string>('')
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [isEditing, setIsEditing] = useState(false)

    // Checklist State
    const [currentChecklist, setCurrentChecklist] = useState<any[]>(DEFAULT_CHECKLIST_ITEMS)

    // Validation State
    const [bookingError, setBookingError] = useState<string | null>(null)

    // Actions
    const [createState, createAction, isCreatePending] = useActionState(createAppointment, initialState)
    const [updateState, updateAction, isUpdatePending] = useActionState(updateAppointment, initialState)

    const fetchData = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile?.org_id) return

            // Load Metadata
            if (pets.length === 0) {
                const { data: p } = await supabase.from('pets').select('id, name, species, breed, customers(name), perfume_allowed, accessories_allowed, special_care').order('name')
                if (p) setPets(p as any)

                const { data: s } = await supabase
                    .from('services')
                    .select('id, name, duration_minutes, base_price, category_id, scheduling_rules, service_categories (id, name, color, icon)')
                    .eq('org_id', profile.org_id)
                    .order('name')

                if (s) setServices(s as unknown as Service[])
            }

            // Calculate Date Range based on viewMode
            let start = new Date(selectedDate)
            let end = new Date(selectedDate)

            if (viewMode === 'day') {
                end.setHours(23, 59, 59)
            } else if (viewMode === 'week') {
                const day = start.getDay()
                const diff = start.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
                start.setDate(diff)
                end = new Date(start)
                end.setDate(start.getDate() + 6)
                end.setHours(23, 59, 59)
            } else {
                start.setDate(1)
                end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
                end.setHours(23, 59, 59)
            }

            const startDateStr = start.toISOString()
            const endDateStr = end.toISOString()

            // Fetch Blocks
            const { data: blks } = await supabase
                .from('schedule_blocks')
                .select('*')
                .eq('org_id', profile.org_id)
                .or(`start_at.gte.${startDateStr},end_at.lte.${endDateStr}`)

            if (blks) setBlocks(blks)

            // Fetch Appointments
            const { data: appts, error } = await supabase
                .from('appointments')
                .select(`
                    id, pet_id, service_id, scheduled_at, status, checklist, notes,
                    actual_check_in, actual_check_out,
                    pets ( 
                        name, species, breed, 
                        perfume_allowed, accessories_allowed, special_care,
                        customers ( name )
                    ),
                    services ( 
                        name, duration_minutes, base_price, category_id,
                        service_categories ( name, color, icon )
                    )
                `)
                .eq('org_id', profile.org_id)
                .gte('scheduled_at', startDateStr)
                .lte('scheduled_at', endDateStr)
                .neq('status', 'cancelled')

            if (error) console.error(error)
            if (appts) setAppointments(appts as unknown as Appointment[])

        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }, [selectedDate, viewMode, supabase]) // Simplified deps

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        if (createState.success) {
            setShowNewModal(false)
            fetchData()
            // Reset selection
            setSelectedServiceId('')
            setPreSelectedPetId(null)
            setBookingError(null)
        }
    }, [createState, fetchData])

    const validateScheduling = (dateStr: string, svcId: string, pId: string) => {
        if (!dateStr || !svcId || !pId) return true

        const svc = services.find(s => s.id === svcId)
        const pet = pets.find(p => p.id === pId)

        if (!svc || !pet || !svc.scheduling_rules || svc.scheduling_rules.length === 0) {
            setBookingError(null)
            return true
        }

        const [y, m, d] = dateStr.split('-').map(Number)
        // Note: New Date(y, m-1, d) creates a local date. getDay() returns 0-6 (Sun-Sat)
        const dayOfWeek = new Date(y, m - 1, d).getDay()

        const rule = svc.scheduling_rules.find(r => r.day === dayOfWeek)

        if (rule) {
            const petSpecies = pet.species.toLowerCase() === 'cão' || pet.species.toLowerCase() === 'dog' ? 'dog' : 'cat'

            if (!rule.species.includes(petSpecies)) {
                const allowed = rule.species.map(s => s === 'dog' ? 'Cães' : 'Gatos').join(' ou ')
                const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
                setBookingError(`Este serviço só é permitido para ${allowed} às ${days[dayOfWeek]}s.`)
                return false
            }
        }

        setBookingError(null)
        return true
    }

    const handleNewAppointment = (date?: string, hour?: number, petId?: string, serviceId?: string) => {
        let finalDate = date || selectedDate
        let finalSvcId = serviceId || ''
        let finalPetId = petId || ''

        setSelectedDate(finalDate)
        if (hour) setSelectedHourSlot(hour.toString().padStart(2, '0'))
        if (petId) setPreSelectedPetId(petId)
        if (serviceId) setSelectedServiceId(serviceId)
        else setSelectedServiceId('')

        validateScheduling(finalDate, finalSvcId, finalPetId)
        setShowNewModal(true)
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

    const handleDelete = async () => {
        if (!selectedAppointment) return
        if (confirm('Tem certeza que deseja cancelar este agendamento?')) {
            const res = await deleteAppointment(selectedAppointment.id)
            if (res.success) {
                setShowDetailModal(false)
                fetchData()
            } else {
                alert(res.message)
            }
        }
    }

    const handleSmartAction = async (appt: Appointment, action: 'checkin' | 'checkout' | 'start') => {
        let res
        if (action === 'checkin') res = await checkInAppointment(appt.id)
        else if (action === 'checkout') res = await checkOutAppointment(appt.id)
        else if (action === 'start') res = await updateAppointmentStatus(appt.id, 'in_progress')

        if (res?.success) fetchData()
        else alert(res?.message || 'Erro ao atualizar status')
    }

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return '⏳ Pendente'
            case 'confirmed': return '✅ Confirmado'
            case 'in_progress': return '🔥 Em Andamento'
            case 'done': return '🏁 Finalizado'
            case 'cancelled': return '❌ Cancelado'
            default: return status
        }
    }

    const handleBlockDelete = async (id: string) => {
        if (confirm('Remover bloqueio?')) {
            await deleteScheduleBlock(id)
            fetchData()
        }
    }

    const handleCreateBlock = async (formData: FormData) => {
        const res = await createScheduleBlock(null, formData)
        if (res.success) {
            setShowBlockModal(false)
            fetchData()
        } else {
            alert(res.message)
        }
    }

    const formatTime = (isoString: string) => {
        const date = new Date(isoString)
        // Adjust for timezone offset manually if needed, or rely on browser
        // Simple formatter:
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }

    const renderAppointmentCard = (appt: Appointment) => {
        const categoryColor = appt.services?.service_categories?.color || '#2563EB'
        const categoryIcon = appt.services?.service_categories?.icon || '📋'
        const isCrecheOrBanho = appt.services?.service_categories?.name === 'Creche' || appt.services?.service_categories?.name === 'Banho e Tosa'

        return (
            <div
                key={appt.id}
                className={styles.appointmentCard}
                onClick={(e) => { e.stopPropagation(); isCrecheOrBanho ? setSelectedAppointment(appt) : handleOpenDetail(appt) }}
                style={{
                    minWidth: '300px',
                    borderLeft: `4px solid ${categoryColor} `,
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
                                <span className={styles.statusBadge}>
                                    {appt.actual_check_in && !appt.actual_check_out ? '🟢 Em Andamento' :
                                        appt.actual_check_out ? '🏁 Finalizado' :
                                            getStatusLabel(appt.status)}
                                </span>
                            </div>
                            <span className={styles.petBreed}>{appt.pets?.breed}</span>
                            <span className={styles.tutorName}>👤 {appt.pets?.customers?.name}</span>
                        </div>
                    </div>
                </div>

                <div className={styles.serviceLine}>
                    <span style={{ marginRight: '0.25rem' }}>{categoryIcon}</span>
                    {appt.services?.name}
                    {/* Price Display */}
                    {(appt.services as any).base_price && (
                        <span className={styles.priceTag}>
                            R$ {(appt.services as any).base_price.toFixed(2)}
                        </span>
                    )}
                </div>

                {isCrecheOrBanho && (
                    <div className={styles.quickActions}>
                        {!appt.actual_check_in && (
                            <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); handleSmartAction(appt, 'checkin') }}>Entrada ➡️</button>
                        )}
                        {appt.actual_check_in && !appt.actual_check_out && (
                            <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); handleSmartAction(appt, 'checkout') }}>Saída ⬅️</button>
                        )}
                        <button className={styles.detailBtn} onClick={(e) => { e.stopPropagation(); handleOpenDetail(appt) }}>Detalhes</button>
                    </div>
                )}
            </div>
        )
    }

    const renderDayView = () => {
        const hours = Array.from({ length: 13 }, (_, i) => i + 7) // 7h to 19h
        return (
            <div className={styles.dayGrid}>
                {hours.map(h => {
                    const timeStr = `${h.toString().padStart(2, '0')}:00`
                    const slotAppts = appointments.filter(a => {
                        const d = new Date(a.scheduled_at)
                        const localH = d.getHours()
                        const matchesHour = localH === h
                        const matchesCategory = !categoryFilter || a.services?.service_categories?.name === categoryFilter
                        return matchesHour && matchesCategory
                    })

                    const slotBlocks = blocks.filter(b => {
                        const start = new Date(b.start_at).getHours()
                        return start === h
                    })

                    return (
                        <div key={h} className={styles.hourRow}>
                            <div className={styles.hourLabel}>{timeStr}</div>
                            <div className={styles.hourContent}>
                                {slotBlocks.map(b => (
                                    <div key={b.id} className={styles.blockItem}>
                                        🔒 {b.reason}
                                        <button onClick={() => handleBlockDelete(b.id)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer' }}>×</button>
                                    </div>
                                ))}
                                {slotAppts.map(renderAppointmentCard)}
                                <button className={styles.addSlotBtn} onClick={() => handleNewAppointment(selectedDate, h)}>
                                    +
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    const renderWeekView = () => {
        const weekDays = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(selectedDate)
            const day = d.getDay()
            const diff = d.getDate() - day + (day === 0 ? -6 : 1) + i
            d.setDate(diff)
            return d
        })
        const hours = Array.from({ length: 13 }, (_, i) => i + 7)

        return (
            <div className={styles.weekGrid}>
                <div className={styles.weekHeaderCell}>Hora</div>
                {weekDays.map(d => (
                    <div key={d.toISOString()} className={styles.weekHeaderCell} style={{ fontWeight: d.toISOString().split('T')[0] === selectedDate ? 'bold' : 'normal', color: d.toISOString().split('T')[0] === selectedDate ? 'var(--primary)' : 'inherit' }}>
                        <div>{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                        <div>{d.getDate()}</div>
                    </div>
                ))}

                {hours.map(h => (
                    <div key={h} style={{ display: 'contents' }}>
                        <div className={styles.weekTimeCell}>{h}:00</div>
                        {weekDays.map(d => {
                            const dateStr = d.toISOString().split('T')[0]
                            const slotAppts = appointments.filter(a => {
                                const ad = new Date(a.scheduled_at)
                                return ad.toISOString().split('T')[0] === dateStr && ad.getHours() === h
                            })
                            return (
                                <div key={`${dateStr}-${h}`} className={styles.weekCell} onClick={() => { setSelectedDate(dateStr); setViewMode('day') }}>
                                    {slotAppts.length > 0 ? (
                                        <div className={styles.weekPill} style={{ backgroundColor: slotAppts[0].services?.service_categories?.color || '#ccc' }}>
                                            {slotAppts.length} agend.
                                        </div>
                                    ) : (
                                        <span className={styles.emptySlot}>-</span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        )
    }

    const renderMonthView = () => {
        // Simple month view implementation
        const year = new Date(selectedDate).getFullYear()
        const month = new Date(selectedDate).getMonth()
        const firstDay = new Date(year, month, 1)
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

        return (
            <div className={styles.monthGrid}>
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className={styles.monthHeader}>{d}</div>)}
                {Array.from({ length: firstDay.getDay() }).map((_, i) => <div key={`empty-${i}`} />)}
                {days.map(day => {
                    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
                    const count = appointments.filter(a => a.scheduled_at.startsWith(dateStr)).length
                    return (
                        <div key={day} className={styles.monthCell} onClick={() => { setSelectedDate(dateStr); setViewMode('day') }}>
                            <div className={styles.monthDate}>{day}</div>
                            {count > 0 && <div className={styles.monthBadge}>{count}</div>}
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Agenda</h1>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <select className={styles.select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: '150px' }}>
                        <option value="">Filtro...</option>
                        {Array.from(new Set(services.flatMap(s => s.service_categories ? [s.service_categories.name] : []))).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button className={styles.actionButton} onClick={() => handleNewAppointment()}>+ Agendar</button>
                    <button className={styles.secondaryButton} onClick={() => setShowBlockModal(true)}>Bloquear</button>
                </div>
            </div>

            <div className={styles.toolbar}>
                <div className={styles.viewToggle}>
                    <button className={viewMode === 'day' ? styles.activeView : ''} onClick={() => setViewMode('day')}>Dia</button>
                    <button className={viewMode === 'week' ? styles.activeView : ''} onClick={() => setViewMode('week')}>Semana</button>
                    <button className={viewMode === 'month' ? styles.activeView : ''} onClick={() => setViewMode('month')}>Mês</button>
                </div>
                <div className={styles.dateNav}>
                    <button onClick={() => {
                        const d = new Date(selectedDate)
                        d.setDate(d.getDate() - 1)
                        setSelectedDate(d.toISOString().split('T')[0])
                    }}>◀</button>
                    <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={styles.dateInput} />
                    <button onClick={() => {
                        const d = new Date(selectedDate)
                        d.setDate(d.getDate() + 1)
                        setSelectedDate(d.toISOString().split('T')[0])
                    }}>▶</button>
                </div>
            </div>

            {loading ? <div className={styles.loading}>Carregando agenda...</div> : (
                <>
                    {viewMode === 'day' && renderDayView()}
                    {viewMode === 'week' && renderWeekView()}
                    {viewMode === 'month' && renderMonthView()}
                </>
            )}

            {/* New Appointment Modal */}
            {showNewModal && (
                <div className={styles.modalOverlay} onClick={() => setShowNewModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>Novo Agendamento</h2>
                        <form action={createAction}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Pet *</label>
                                <select
                                    name="petId"
                                    className={styles.select}
                                    required
                                    defaultValue={preSelectedPetId || ""}
                                    key={preSelectedPetId}
                                    onChange={(e) => {
                                        setPreSelectedPetId(e.target.value)
                                        validateScheduling(selectedDate, selectedServiceId, e.target.value)
                                    }}
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Serviço *</label>
                                <select
                                    name="serviceId"
                                    className={styles.select}
                                    required
                                    value={selectedServiceId}
                                    onChange={(e) => {
                                        setSelectedServiceId(e.target.value)
                                        validateScheduling(selectedDate, e.target.value, preSelectedPetId || "")
                                    }}
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {services.map(s => <option key={s.id} value={s.id}>{s.name} (R$ {s.base_price.toFixed(2)})</option>)}
                                </select>
                                {/* Preset Category hidden field if needed for logic, but usually we just need serviceId */}
                            </div>
                            <div className={styles.row}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Data *</label>
                                    <input
                                        name="date"
                                        type="date"
                                        className={styles.input}
                                        required
                                        defaultValue={selectedDate}
                                        onChange={(e) => {
                                            setSelectedDate(e.target.value)
                                            validateScheduling(e.target.value, selectedServiceId, preSelectedPetId || "")
                                        }}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Hora *</label>
                                    <input name="time" type="time" className={styles.input} required defaultValue={selectedHourSlot ? `${selectedHourSlot}:00` : ''} />
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Observações</label>
                                <textarea name="notes" className={styles.textarea} rows={3} />
                            </div>

                            {bookingError && (
                                <div style={{ color: '#ef4444', padding: '0.5rem', background: '#fee2e2', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                    ⚠️ {bookingError}
                                </div>
                            )}

                            <div className={styles.modalActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowNewModal(false)}>Cancelar</button>
                                <button type="submit" className={styles.submitBtn} disabled={isCreatePending || !!bookingError}>Agendar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Detail/Edit Modal */}
            {showDetailModal && selectedAppointment && (
                <div className={styles.modalOverlay} onClick={() => setShowDetailModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>{isEditing ? 'Editar Agendamento' : 'Detalhes do Agendamento'}</h2>
                            {!isEditing && (
                                <div className={styles.modalTools}>
                                    <button onClick={() => setIsEditing(true)}>✏️ Editar</button>
                                    <button onClick={handleDelete} style={{ color: '#ef4444' }}>🗑️ Cancelar</button>
                                </div>
                            )}
                        </div>

                        {isEditing ? (
                            <form action={updateAction}>
                                <input type="hidden" name="id" value={selectedAppointment.id} />
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Data</label>
                                    <input name="date" type="date" className={styles.input} defaultValue={new Date(selectedAppointment.scheduled_at).toISOString().split('T')[0]} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Hora</label>
                                    <input name="time" type="time" className={styles.input} defaultValue={new Date(selectedAppointment.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Serviço</label>
                                    <select name="serviceId" className={styles.select} defaultValue={selectedAppointment.services?.id}>
                                        {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Notas</label>
                                    <textarea name="notes" className={styles.textarea} defaultValue={selectedAppointment.notes || ''} />
                                </div>
                                <div className={styles.modalActions}>
                                    <button type="button" className={styles.cancelBtn} onClick={() => setIsEditing(false)}>Cancelar</button>
                                    <button type="submit" className={styles.submitBtn} disabled={isUpdatePending}>Salvar</button>
                                </div>
                            </form>
                        ) : (
                            <div className={styles.detailContent}>
                                <div className={styles.detailRow}>
                                    <strong>Pet:</strong> {selectedAppointment.pets?.name} ({selectedAppointment.pets?.species === 'cat' ? 'Gato' : 'Cão'})
                                </div>
                                <div className={styles.detailRow}>
                                    <strong>Serviço:</strong> {selectedAppointment.services?.name}
                                </div>
                                <div className={styles.detailRow}>
                                    <strong>Valor:</strong> R$ {(selectedAppointment.services as any)?.base_price?.toFixed(2)}
                                </div>
                                <div className={styles.detailRow}>
                                    <strong>Data:</strong> {new Date(selectedAppointment.scheduled_at).toLocaleString('pt-BR')}
                                </div>
                                <div className={styles.detailRow}>
                                    <strong>Status:</strong> {getStatusLabel(selectedAppointment.status)}
                                </div>
                                {selectedAppointment.notes && (
                                    <div className={styles.detailRow}>
                                        <strong>Notas:</strong> {selectedAppointment.notes}
                                    </div>
                                )}

                                {/* Checklist Section */}
                                <div className={styles.checklistSection}>
                                    <h3>Checklist de Atendimento</h3>
                                    {currentChecklist.map((item, idx) => (
                                        <div key={idx} className={styles.checklistItem}>
                                            <input
                                                type="checkbox"
                                                checked={item.done}
                                                onChange={async (e) => {
                                                    const newList = [...currentChecklist]
                                                    newList[idx].done = e.target.checked
                                                    setCurrentChecklist(newList)
                                                    // Auto-save logic could go here or require a save button
                                                    await updateChecklist(selectedAppointment.id, newList)
                                                    fetchData()
                                                }}
                                            />
                                            <span>{item.item}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Preferences Section */}
                                <div className={styles.preferencesParams}>
                                    <h3>Preferências do Pet</h3>
                                    <div className={styles.prefToggle}>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={selectedAppointment.pets?.perfume_allowed}
                                                onChange={async () => {
                                                    const val = !selectedAppointment.pets?.perfume_allowed
                                                    await updatePetPreferences(selectedAppointment.pets!.id, { perfume_allowed: val })
                                                    fetchData()
                                                }}
                                            /> Perfume
                                        </label>
                                    </div>
                                    <div className={styles.prefToggle}>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={selectedAppointment.pets?.accessories_allowed}
                                                onChange={async () => {
                                                    const val = !selectedAppointment.pets?.accessories_allowed
                                                    await updatePetPreferences(selectedAppointment.pets!.id, { accessories_allowed: val })
                                                    fetchData()
                                                }}
                                            /> Acessórios/Laços
                                        </label>
                                    </div>
                                </div>

                                <div className={styles.detailActions}>
                                    {selectedAppointment.status === 'pending' && (
                                        <button className={styles.confirmBtn} onClick={async () => { await updateAppointmentStatus(selectedAppointment.id, 'confirmed'); fetchData() }}>Confirmar Agendamento</button>
                                    )}
                                    <button className={styles.closeBtn} onClick={() => setShowDetailModal(false)}>Fechar</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Block Modal */}
            {showBlockModal && (
                <div className={styles.modalOverlay} onClick={() => setShowBlockModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>Novo Bloqueio</h2>
                        <form action={handleCreateBlock}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Motivo</label>
                                <input name="reason" className={styles.input} required placeholder="Ex: Almoço, Feriado..." />
                            </div>
                            <div className={styles.row}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Início</label>
                                    <input name="start_at" type="datetime-local" className={styles.input} required defaultValue={`${selectedDate}T08:00`} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Fim</label>
                                    <input name="end_at" type="datetime-local" className={styles.input} required defaultValue={`${selectedDate}T18:00`} />
                                </div>
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowBlockModal(false)}>Cancelar</button>
                                <button type="submit" className={styles.submitBtn}>Bloquear</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
