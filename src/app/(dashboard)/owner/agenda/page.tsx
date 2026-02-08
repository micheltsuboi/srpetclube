'use client'

import { useState, useEffect, useCallback, useActionState } from 'react'
import Link from 'next/link'
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
    services: { name: string, duration: number }
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
    const supabase = createClient()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
    const [loading, setLoading] = useState(true)

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
                    services ( name, duration_minutes )
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
        } else if (createState.message) {
            alert(createState.message)
        }
    }, [createState, fetchData])

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

    const renderAppointmentCard = (appt: Appointment) => (
        <div key={appt.id} className={styles.appointmentCard} onClick={(e) => { e.stopPropagation(); handleOpenDetail(appt) }} style={{ minWidth: '300px' }}>
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
            <div className={styles.serviceLine}>{appt.services?.name}</div>
        </div>
    )

    const renderDayView = () => {
        const hours = Array.from({ length: 10 }, (_, i) => i + 8)
        return (
            <div className={styles.dayGrid}>
                {hours.map(h => {
                    const timeStr = `${h.toString().padStart(2, '0')}:00`
                    const slotAppts = appointments.filter(a => {
                        const d = new Date(a.scheduled_at)
                        return d.getHours() === h
                    })
                    const slotBlocks = blocks.filter(b => {
                        const start = new Date(b.start_at)
                        const end = new Date(b.end_at)
                        return h >= start.getHours() && h < end.getHours()
                    })

                    return (
                        <div key={h} className={styles.hourRow}>
                            <div className={styles.hourLabel}>{timeStr}</div>
                            <div className={styles.hourContent}>
                                {slotBlocks.map(b => (
                                    <div key={b.id} className={styles.blockedCard}>
                                        <span>🚫 {b.reason || 'Bloqueado'}</span>
                                        <button onClick={(e) => handleBlockDelete(b.id, e)}>×</button>
                                    </div>
                                ))}
                                {slotAppts.map(renderAppointmentCard)}
                                {slotBlocks.length === 0 && slotAppts.length === 0 && (
                                    <>
                                        <div className={styles.addSlotBtn} onClick={() => setShowNewModal(true)}>+</div>
                                        <button className={styles.addSlotBtn} style={{ maxWidth: '50px', borderLeft: '1px dashed #334155' }} onClick={() => {
                                            setSelectedHourSlot(h.toString().padStart(2, '0'))
                                            setShowBlockModal(true)
                                        }}>🔒</button>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    const renderWeekView = () => (
        <div style={{ padding: '2rem', color: '#cbd5e1', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
            Visualização semanal em desenvolvimento.
        </div>
    )

    const renderMonthView = () => (
        <div style={{ padding: '2rem', color: '#cbd5e1', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
            Visualização mensal em desenvolvimento.
        </div>
    )

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link href="/owner" style={{ color: 'var(--primary)', marginBottom: '0.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>← Voltar</Link>
                    <h1 className={styles.title}>🛁 Banho e Tosa</h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div className={styles.viewSelector} style={{ margin: 0 }}>
                        <button className={`${styles.viewBtn} ${viewMode === 'day' ? styles.active : ''}`} onClick={() => setViewMode('day')}>Dia</button>
                        <button className={`${styles.viewBtn} ${viewMode === 'week' ? styles.active : ''}`} onClick={() => setViewMode('week')}>Semana</button>
                        <button className={`${styles.viewBtn} ${viewMode === 'month' ? styles.active : ''}`} onClick={() => setViewMode('month')}>Mês</button>
                    </div>
                    {!loading && services.length === 0 && (
                        <button onClick={handleSeed} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                            ⚠️ Inicializar Serviços
                        </button>
                    )}
                    <button className={styles.actionButton} onClick={() => setShowNewModal(true)}>
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
