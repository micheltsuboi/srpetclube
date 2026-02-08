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
        // ... (resto do corpo da função fetchData)

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

            // Load Appointments
            // Query logic assumes matching date portion string or range
            // For robust range:
            // const startOfDay = ...

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
                .order('scheduled_at')

            if (appts) {
                // Client side filtering for date precision
                const filtered = appts.filter(a => {
                    // Convert UTC scheduled_at to YYYY-MM-DD in -03:00
                    const dateObj = new Date(a.scheduled_at)
                    // Adjust to BRT manually for comparison
                    // getTime() returns UTC ms. -3h = -10800000ms
                    // Actually simpler:
                    const localISO = new Date(dateObj.getTime() - 3 * 3600 * 1000).toISOString()
                    return localISO.startsWith(selectedDate)
                })
                setAppointments(filtered as unknown as Appointment[])
            }

        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }, [supabase, selectedDate, pets.length])

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

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link href="/owner" style={{ color: 'var(--primary)', marginBottom: '0.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>← Voltar</Link>
                    <h1 className={styles.title}>🛁 Banho e Tosa</h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    {!loading && services.length === 0 && (
                        <button onClick={handleSeed} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                            ⚠️ Inicializar Serviços
                        </button>
                    )}
                    <button className={styles.actionButton} onClick={() => setShowNewModal(true)}>
                        + Novo Agendamento
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

            {/* Grid */}
            <div className={styles.agendaGrid}>
                {appointments.map(appt => (
                    <div key={appt.id} className={styles.appointmentCard} onClick={() => handleOpenDetail(appt)}>
                        <div className={styles.timeDisplay}>{formatTime(appt.scheduled_at)}</div>

                        <div className={styles.cardTop}>
                            <div className={styles.petInfoMain}>
                                <div className={styles.petAvatar}>
                                    {appt.pets?.species === 'cat' ? '🐱' : '🐶'}
                                </div>
                                <div className={styles.petDetails}>
                                    <div className={styles.petName}>
                                        {appt.pets?.name || 'Pet'}
                                        <span className={styles.statusBadge}>{getStatusLabel(appt.status)}</span>
                                    </div>
                                    <span className={styles.petBreed}>{appt.pets?.breed || 'Sem raça'}</span>
                                    <span className={styles.tutorName}>👤 {appt.pets?.customers?.name || 'Tutor não identificado'}</span>
                                </div>
                            </div>

                            {/* Actions on Card */}
                            {(appt.status === 'pending' || appt.status === 'confirmed') && (
                                <button className={styles.startButton} onClick={(e) => handleStartService(e, appt)}>
                                    ▶ Iniciar
                                </button>
                            )}
                            {appt.status === 'in_progress' && (
                                <div style={{ color: '#fbbf24', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    ⏳ Em andamento...
                                </div>
                            )}
                        </div>

                        <div className={styles.serviceLine}>
                            ✂️ {appt.services?.name}
                        </div>

                        {/* Notes Box */}
                        {(appt.notes || appt.pets?.special_care) && (
                            <div className={styles.notesBox}>
                                📝 {appt.notes || ''} {appt.pets?.special_care ? `(Cuidado: ${appt.pets.special_care})` : ''}
                            </div>
                        )}

                        {/* Tags */}
                        <div className={styles.prefContainer}>
                            {appt.pets?.perfume_allowed && (
                                <span className={styles.prefTag}>🌸 Perfume OK</span>
                            )}
                            {appt.pets?.accessories_allowed && (
                                <span className={styles.prefTag}>🎀 Acessórios OK</span>
                            )}
                            {!appt.pets?.perfume_allowed && (
                                <span className={styles.prefTag} style={{ filter: 'grayscale(1)', opacity: 0.7 }}>🚫 Sem Perfume</span>
                            )}
                        </div>
                    </div>
                ))}
                {!loading && appointments.length === 0 && (
                    <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#666', padding: '3rem' }}>
                        Nenhum agendamento para este dia.
                    </p>
                )}
            </div>

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
                                    <input name="time" type="time" className={styles.input} required />
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
                                        <input name="time" type="time" className={styles.input} defaultValue={new Date(selectedAppointment.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} />
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
        </div>
    )
}
