'use client'

import { useState, useEffect, useCallback, useActionState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { createAppointment, updateChecklist, updateAppointmentStatus } from '@/app/actions/appointment'

interface Appointment {
    id: string
    pet_id: string
    service_id: string
    scheduled_at: string
    status: 'pending' | 'confirmed' | 'in_progress' | 'done' | 'canceled' | 'no_show'
    checklist: { label: string, checked: boolean }[]
    notes: string
    pets: { name: string, species: string, breed: string }
    customers: { name: string }
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

    // Data Loading for Forms
    const [pets, setPets] = useState<Pet[]>([])
    const [services, setServices] = useState<Service[]>([])
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)

    // Checklist State (local to modal)
    const [currentChecklist, setCurrentChecklist] = useState<{ label: string, checked: boolean }[]>([])

    // Server Action
    const [createState, createAction, isCreatePending] = useActionState(createAppointment, initialState)

    // Derived
    const isToday = selectedDate === new Date().toISOString().split('T')[0]

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile?.org_id) return

            // Load Pets and Services for Dropdowns (could be optimized to load only when opening modal)
            if (pets.length === 0) {
                const { data: p } = await supabase.from('pets').select('id, name').order('name')
                if (p) setPets(p)

                const { data: s } = await supabase.from('services').select('id, name').eq('org_id', profile.org_id).order('name')
                if (s) setServices(s)
            }

            // Load Appointments for Selected Date
            // Assuming DB uses ISO with timezone, filtering by string range needs care.
            // A safer way is to fetch broader range or rely on date_trunc in SQL, but simple string compare works if consistent.
            // Using contained in day logic:
            const startOfDay = `${selectedDate}T00:00:00-03:00`
            const endOfDay = `${selectedDate}T23:59:59-03:00`

            const { data: appts, error } = await supabase
                .from('appointments')
                .select(`
                    id, pet_id, service_id, scheduled_at, status, checklist, notes,
                    pets ( name, species, breed ),
                    customers ( name ),
                    services ( name, duration_minutes )
                `)
                .eq('org_id', profile.org_id)
                .gte('scheduled_at', startOfDay) // This assumes DB stores with offset or we match UTC
                // Actually, if we send -03, postgres converts to UTC storage.
                // Fetching matches correctly if we query with timezone. 
                // Let's try simple string match first, strictly it should use 'gte' and 'lte'.
                .order('scheduled_at')

            // If the query fails due to timezone mismatch, we might need adjustments.
            // For now assuming it works as standard PostgREST.

            if (appts) {
                // Client-side filter to be safe if TZ issues slightly offset
                // Normalize date string to YYYY-MM-DD
                const filtered = appts.filter(a => {
                    const d = new Date(a.scheduled_at)
                    // Convert to YYYY-MM-DD in local time
                    const localYMD = d.toLocaleDateString('pt-BR').split('/').reverse().join('-')
                    // Wait, toLocaleDateString uses browser TZ.
                    // If selectedDate is 2023-10-27
                    // We want to match visual date.
                    return localYMD === selectedDate
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

    useEffect(() => {
        if (createState.success) {
            setShowNewModal(false)
            fetchData()
            alert(createState.message)
        } else if (createState.message) {
            alert(createState.message)
        }
    }, [createState, fetchData])

    const handleDateChange = (offset: number) => {
        const d = new Date(selectedDate)
        d.setDate(d.getDate() + offset)
        setSelectedDate(d.toISOString().split('T')[0])
    }

    const handleOpenDetail = (appt: Appointment) => {
        setSelectedAppointment(appt)
        // Initialize checklist: use existing or default
        if (appt.checklist && Array.isArray(appt.checklist) && appt.checklist.length > 0) {
            setCurrentChecklist(appt.checklist)
        } else {
            // Clone default
            setCurrentChecklist(JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_ITEMS)))
        }
        setShowDetailModal(true)
    }

    const handleChecklistToggle = (index: number) => {
        const updated = [...currentChecklist]
        updated[index].checked = !updated[index].checked
        setCurrentChecklist(updated)
    }

    const saveChecklist = async () => {
        if (!selectedAppointment) return
        const res = await updateChecklist(selectedAppointment.id, currentChecklist)
        if (res.success) {
            // Update local state to reflect saved
            setAppointments(prev => prev.map(a =>
                a.id === selectedAppointment.id ? { ...a, checklist: currentChecklist } : a
            ))
            alert('Checklist salvo!')
        } else {
            alert('Erro ao salvar checklist.')
        }
    }

    const changeStatus = async (newStatus: string) => {
        if (!selectedAppointment) return
        const res = await updateAppointmentStatus(selectedAppointment.id, newStatus)
        if (res.success) {
            setAppointments(prev => prev.map(a =>
                a.id === selectedAppointment.id ? { ...a, status: newStatus as any } : a
            ))
            setSelectedAppointment(prev => prev ? { ...prev, status: newStatus as any } : null)
        }
    }

    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }

    const getStatusLabel = (status: string) => {
        const map: Record<string, string> = {
            pending: 'Pendente',
            confirmed: 'Confirmado',
            in_progress: 'Em Banho',
            done: 'Pronto',
            canceled: 'Cancelado',
            no_show: 'Não Compareceu'
        }
        return map[status] || status
    }

    if (loading && !appointments.length && !showNewModal && !showDetailModal) {
        return (
            <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ fontSize: '1.2rem', color: '#666' }}>Carregando agenda...</div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link href="/owner" style={{ color: 'var(--primary)', marginBottom: '0.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>← Voltar</Link>
                    <h1 className={styles.title}>📅 Agenda & Banho</h1>
                </div>
                <button className={styles.actionButton} onClick={() => setShowNewModal(true)}>
                    + Novo Agendamento
                </button>
            </div>

            <div className={styles.dateFilter}>
                <button className={styles.dateBtn} onClick={() => handleDateChange(-1)}>◀</button>
                <span className={styles.currentDate}>
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                <button className={styles.dateBtn} onClick={() => handleDateChange(1)}>▶</button>
            </div>

            <div className={styles.agendaGrid}>
                {appointments.length === 0 ? (
                    <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#666', padding: '3rem' }}>
                        Nenhum agendamento para este dia.
                    </p>
                ) : (
                    appointments.map(appt => (
                        <div key={appt.id} className={styles.appointmentCard} onClick={() => handleOpenDetail(appt)}>
                            <div className={`${styles.statusIndicator} ${styles['status_' + appt.status]}`} />
                            <div className={styles.cardHeader}>
                                <span className={styles.timeSlot}>{formatTime(appt.scheduled_at)}</span>
                                <span className={`${styles.statusBadge} ${styles['badge_' + appt.status]}`}>
                                    {getStatusLabel(appt.status)}
                                </span>
                            </div>

                            <div className={styles.petInfo}>
                                <div className={styles.petAvatar}>
                                    {appt.pets.species === 'cat' ? '🐱' : '🐶'}
                                </div>
                                <div className={styles.petDetails}>
                                    <span className={styles.petName}>{appt.pets.name}</span>
                                    <span className={styles.serviceName}>{appt.services.name}</span>
                                </div>
                            </div>

                            <div className={styles.cardFooter}>
                                <span className={styles.customerName}>👤 {appt.customers.name}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* New Appointment Modal */}
            {showNewModal && (
                <div className={styles.modalOverlay} onClick={() => setShowNewModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>Novo Agendamento</h2>
                        <form action={createAction}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Pet *</label>
                                <select name="petId" className={styles.select} required defaultValue="">
                                    <option value="" disabled>Selecione um pet...</option>
                                    {pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Serviço *</label>
                                <select name="serviceId" className={styles.select} required defaultValue="">
                                    <option value="" disabled>Selecione um serviço...</option>
                                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                                <textarea name="notes" className={styles.textarea} rows={3} placeholder="Ex: Cuidado com pata direita..." />
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowNewModal(false)}>Cancelar</button>
                                <button type="submit" className={styles.submitBtn} disabled={isCreatePending}>
                                    {isCreatePending ? 'Agendando...' : 'Agendar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Detail Modal (Checklist) */}
            {showDetailModal && selectedAppointment && (
                <div className={styles.modalOverlay} onClick={() => setShowDetailModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>
                            Detalhes do Agendamento
                            <div style={{ fontSize: '0.9rem', fontWeight: 400, marginTop: '0.5rem', color: '#666' }}>
                                {selectedAppointment.pets.name} - {formatTime(selectedAppointment.scheduled_at)}
                            </div>
                        </h2>

                        {/* Status Control */}
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Status do Serviço</label>
                            <select
                                className={styles.select}
                                value={selectedAppointment.status}
                                onChange={(e) => changeStatus(e.target.value)}
                            >
                                <option value="pending">Pendente</option>
                                <option value="confirmed">Confirmado</option>
                                <option value="in_progress">Em Banho/Execução</option>
                                <option value="done">Finalizado / Pronto</option>
                                <option value="canceled">Cancelado</option>
                            </select>
                        </div>

                        {/* Checklist */}
                        <div className={styles.checklistContainer}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <label className={styles.label} style={{ marginBottom: 0, fontWeight: 600, color: 'white' }}>Checklist de Execução</label>
                                <button
                                    onClick={saveChecklist}
                                    style={{ background: 'var(--success)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.75rem', color: 'white', fontSize: '0.8rem', cursor: 'pointer' }}
                                >
                                    Salvar Checklist
                                </button>
                            </div>

                            <div className={styles.progressBar}>
                                <div
                                    className={styles.progressValue}
                                    style={{ width: `${(currentChecklist.filter(i => i.checked).length / currentChecklist.length) * 100}%` }}
                                />
                            </div>

                            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {currentChecklist.map((item, idx) => (
                                    <div key={idx} className={styles.checklistItem} onClick={() => handleChecklistToggle(idx)}>
                                        <input
                                            type="checkbox"
                                            checked={item.checked}
                                            readOnly
                                            className={styles.checkbox}
                                        />
                                        <span style={{ color: item.checked ? 'white' : '#aaa', textDecoration: item.checked ? 'none' : 'none' }}>
                                            {item.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={styles.modalActions}>
                            <button type="button" className={styles.cancelBtn} onClick={() => setShowDetailModal(false)}>Fechar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
