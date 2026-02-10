'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from '../agenda/page.module.css' // Reuse agenda styles for consistency
import Link from 'next/link'
import DateRangeFilter, { DateRange, getDateRange } from '@/components/DateRangeFilter'
import { checkInAppointment, checkOutAppointment } from '@/app/actions/checkInOut'
import { deleteAppointment, createAppointment } from '@/app/actions/appointment'
import ServiceExecutionModal from '@/components/ServiceExecutionModal'
import DailyReportModal from '@/components/DailyReportModal'
import EditAppointmentModal from '@/components/EditAppointmentModal'

interface Appointment {
    id: string
    pet_id: string
    service_id: string
    scheduled_at: string
    check_in_date: string | null
    check_out_date: string | null
    actual_check_in: string | null
    actual_check_out: string | null
    status: 'pending' | 'confirmed' | 'in_progress' | 'done' | 'completed' | 'canceled' | 'no_show'
    notes: string | null
    calculated_price: number | null
    pets: {
        name: string
        species: string
        breed: string | null
        customers: { name: string }
    }
    services: {
        name: string
        base_price: number | null
        service_categories: { name: string, color: string, icon: string }
    }
}

export default function HospedagemPage() {
    const supabase = createClient()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)
    const [dateRange, setDateRange] = useState<DateRange>('month') // Default to month for hospedagem
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
    const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
    const [searchTerm, setSearchTerm] = useState('')
    const [showNewModal, setShowNewModal] = useState(false)

    const fetchHospedagemData = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile?.org_id) return

            // Get Date Range based on filter
            const { start, end } = getDateRange(dateRange)
            const startISO = start.toISOString().split('T')[0]
            const endISO = end.toISOString().split('T')[0]

            // Status Filter based on viewMode
            const statusFilter = viewMode === 'active'
                ? ['pending', 'confirmed', 'in_progress']
                : ['done', 'completed']

            // Fetch Appointments

            let query = supabase
                .from('appointments')
                .select(`
                    id, pet_id, service_id, scheduled_at, status, notes,
                    calculated_price,
                    check_in_date, check_out_date,
                    actual_check_in, actual_check_out,
                    pets ( name, species, breed, customers ( name ) ),
                    services ( 
                        name, 
                        base_price,
                        service_categories!inner ( name, color, icon )
                    )
                `)
                .eq('org_id', profile.org_id)
                .eq('services.service_categories.name', 'Hospedagem')
                .in('status', statusFilter)
                .order('check_in_date', { ascending: viewMode === 'active' })

            const { data: appts, error } = await query

            if (error) {
                console.error('Error fetching hospedagem:', error)
            } else if (appts) {
                // Client-side filtering for better overlap logic
                const filtered = appts.filter((a: any) => {
                    // Always show if in_progress (currently hosted)
                    if (a.status === 'in_progress' && viewMode === 'active') return true

                    // Otherwise check date overlap
                    const checkIn = a.check_in_date || a.scheduled_at.split('T')[0]
                    const checkOut = a.check_out_date || checkIn // Fallback to single day if no checkout

                    // Check if the appointment interval [checkIn, checkOut] overlaps with [startISO, endISO]
                    return checkIn <= endISO && checkOut >= startISO
                })
                setAppointments(filtered as unknown as Appointment[])
            }

        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }, [supabase, dateRange, viewMode])

    useEffect(() => {
        fetchHospedagemData()
    }, [fetchHospedagemData])

    const handleCheckIn = async (appointmentId: string) => {
        const result = await checkInAppointment(appointmentId)
        if (result.success) {
            alert(result.message)
            fetchHospedagemData()
        } else {
            alert(result.message)
        }
    }

    const handleCheckOut = async (appointmentId: string) => {
        const result = await checkOutAppointment(appointmentId)
        if (result.success) {
            alert(result.message)
            fetchHospedagemData()
        } else {
            alert(result.message)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este agendamento?')) return
        const result = await deleteAppointment(id)
        if (result.success) {
            alert(result.message)
            fetchHospedagemData()
        } else {
            alert(result.message)
        }
    }

    const filteredAppointments = appointments.filter(appt => {
        if (!searchTerm) return true
        const lowerSearch = searchTerm.toLowerCase()
        const petName = appt.pets?.name?.toLowerCase() || ''
        const tutorName = appt.pets?.customers?.name?.toLowerCase() || ''
        return petName.includes(lowerSearch) || tutorName.includes(lowerSearch)
    })

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>🏨 Hospedagem - {viewMode === 'active' ? 'Hóspedes' : 'Histórico'}</h1>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="🔍 Buscar pet ou tutor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: '1px solid #334155',
                            background: 'var(--bg-secondary)',
                            color: 'white',
                            minWidth: '250px'
                        }}
                    />
                    <button
                        className={styles.actionButton}
                        onClick={() => setShowNewModal(true)}
                        style={{ background: 'var(--primary)', color: 'white' }}
                    >
                        + Novo Agendamento
                    </button>
                    <button className={styles.actionButton} onClick={fetchHospedagemData}>↻ Atualizar</button>
                </div>
            </div>

            {/* View Mode Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                <button
                    onClick={() => setViewMode('active')}
                    style={{
                        background: 'none', border: 'none', padding: '0.5rem 1rem',
                        color: viewMode === 'active' ? '#3B82F6' : '#94a3b8',
                        fontWeight: viewMode === 'active' ? 700 : 500,
                        borderBottom: viewMode === 'active' ? '2px solid #3B82F6' : '2px solid transparent',
                        cursor: 'pointer', fontSize: '1rem'
                    }}
                >
                    Hóspedes Ativos / Futuros
                </button>
                <button
                    onClick={() => setViewMode('history')}
                    style={{
                        background: 'none', border: 'none', padding: '0.5rem 1rem',
                        color: viewMode === 'history' ? '#3B82F6' : '#94a3b8',
                        fontWeight: viewMode === 'history' ? 700 : 500,
                        borderBottom: viewMode === 'history' ? '2px solid #3B82F6' : '2px solid transparent',
                        cursor: 'pointer', fontSize: '1rem'
                    }}
                >
                    📜 Histórico
                </button>
            </div>

            {/* Date Range Filter */}
            <DateRangeFilter value={dateRange} onChange={setDateRange} />

            {loading ? (
                <div style={{ padding: '2rem', color: '#94a3b8' }}>Carregando...</div>
            ) : filteredAppointments.length === 0 ? (
                <div style={{ padding: '2rem', color: '#94a3b8', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    {searchTerm ? 'Nenhum resultado encontrado para a busca.' : (viewMode === 'active' ? 'Nenhum hóspede encontrado neste período.' : 'Nenhum histórico encontrado para o período.')}
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                    {filteredAppointments.map(appt => {
                        const checkInDate = appt.check_in_date ? new Date(appt.check_in_date + 'T12:00:00') : new Date(appt.scheduled_at)
                        const checkOutDate = appt.check_out_date ? new Date(appt.check_out_date + 'T12:00:00') : null

                        // Calculate days
                        const days = checkOutDate
                            ? Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))
                            : 1

                        // Price calc (rough estimate based on base price * days if not set otherwise)
                        const totalEstimate = ((appt.calculated_price ?? appt.services?.base_price) || 0) * (days || 1)

                        return (
                            <div
                                key={appt.id}
                                className={styles.appointmentCard}
                                onClick={() => setSelectedAppointment(appt)}
                                style={{
                                    borderLeft: `4px solid ${appt.services?.service_categories?.color || '#3B82F6'}`,
                                    background: 'var(--bg-secondary)',
                                    opacity: 1,
                                    cursor: 'pointer',
                                    position: 'relative' // Ensure relative positioning
                                }}>
                                {/* Date Badge - Enhanced for visibility */}
                                <div style={{
                                    position: 'absolute',
                                    top: '-12px',
                                    right: '16px',
                                    background: appt.services?.service_categories?.color || '#F97316', // Fallback to Orange
                                    color: 'white',
                                    padding: '6px 12px',
                                    borderRadius: '12px',
                                    textAlign: 'center',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
                                    zIndex: 10,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    lineHeight: 1,
                                    border: '3px solid var(--bg-primary, #0f172a)', // Thicker border
                                    minWidth: '54px'
                                }}>
                                    <span style={{ fontSize: '1.4rem', fontWeight: '900', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                        {checkInDate.getDate()}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginTop: '2px', opacity: 0.95 }}>
                                        {checkInDate.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                                    </span>
                                </div>

                                {/* Content with Top Padding to clear badge area */}
                                <div className={styles.cardTop} style={{ marginTop: '1rem', paddingTop: '0.5rem' }}>
                                    <div className={styles.petInfoMain} style={{ flex: 1, minWidth: 0 }}>
                                        <div className={styles.petAvatar}>{appt.pets?.species === 'cat' ? '🐱' : '🐶'}</div>
                                        <div className={styles.petDetails} style={{ minWidth: 0, paddingRight: '1rem' }}>
                                            <div className={styles.petName} style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {appt.pets?.name || 'Pet'}
                                                <span className={styles.statusBadge} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                                                    {appt.status === 'in_progress' ? '🏠 Hospedado' :
                                                        (appt.status === 'done' || appt.status === 'completed') ? '🏁 Finalizado' :
                                                            '📅 Reservado'}
                                                </span>
                                            </div>

                                            {/* Action Buttons (Flex Row) */}
                                            {viewMode === 'active' && (
                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setEditingAppointment(appt)
                                                        }}
                                                        style={{
                                                            background: 'rgba(255,255,255,0.1)',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            padding: '4px 8px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            fontSize: '0.85rem',
                                                            color: '#e2e8f0'
                                                        }}
                                                    >
                                                        ✏️ Editar
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleDelete(appt.id)
                                                        }}
                                                        style={{
                                                            background: 'rgba(239, 68, 68, 0.15)',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            padding: '4px 8px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            fontSize: '0.85rem',
                                                            color: '#fca5a5'
                                                        }}
                                                    >
                                                        🗑️ Excluir
                                                    </button>
                                                </div>
                                            )}
                                            <span className={styles.tutorName}>👤 {appt.pets?.customers?.name || 'Cliente'}</span>

                                            <div style={{ fontSize: '0.85rem', color: '#e2e8f0', marginTop: '0.5rem' }}>
                                                📅 <strong>Entrada:</strong> {checkInDate.toLocaleDateString('pt-BR')}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>
                                                📅 <strong>Saída:</strong> {checkOutDate ? checkOutDate.toLocaleDateString('pt-BR') : '?'}
                                            </div>

                                            <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                                                <span>{appt.services?.name} ({days} dias)</span>
                                                {appt.services?.base_price && (
                                                    <span style={{
                                                        fontSize: '0.8rem',
                                                        fontWeight: 700,
                                                        color: '#10b981',
                                                        background: 'rgba(16, 185, 129, 0.1)',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px'
                                                    }}>
                                                        R$ {totalEstimate.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                                    {/* Actual Check-in/out times if available */}
                                    {(appt.actual_check_in || appt.actual_check_out) && (
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
                                            {appt.actual_check_in && <div>🟢 Check-in Real: {new Date(appt.actual_check_in).toLocaleString('pt-BR')}</div>}
                                            {appt.actual_check_out && <div>🔴 Check-out Real: {new Date(appt.actual_check_out).toLocaleString('pt-BR')}</div>}
                                        </div>
                                    )}

                                    {viewMode === 'active' ? (
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {appt.status !== 'in_progress' && appt.status !== 'done' && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleCheckIn(appt.id)
                                                    }}
                                                    style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#10B981', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                                                    📥 Check-in
                                                </button>
                                            )}
                                            {appt.status === 'in_progress' && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleCheckOut(appt.id)
                                                    }}
                                                    style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#F97316', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                                                    📤 Check-out
                                                </button>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Daily Report Modal or Details */}
            {selectedAppointment && (
                <DailyReportModal
                    appointmentId={selectedAppointment.id}
                    petName={selectedAppointment.pets?.name || 'Pet'}
                    serviceName={selectedAppointment.services?.name || 'Hospedagem'}
                    onClose={() => setSelectedAppointment(null)}
                    onSave={() => {
                        fetchHospedagemData()
                        setSelectedAppointment(null)
                    }}
                    readOnly={viewMode === 'history'}
                />
            )}

            {/* Edit Modal */}
            {editingAppointment && (
                <EditAppointmentModal
                    appointment={editingAppointment as any} // Cast safely
                    onClose={() => setEditingAppointment(null)}
                    onSave={() => {
                        fetchHospedagemData()
                        setEditingAppointment(null)
                    }}
                />
            )}

            {/* New Appointment Modal */}
            {showNewModal && (
                <NewHospedagemAppointmentModal
                    onClose={() => setShowNewModal(false)}
                    onSave={() => {
                        fetchHospedagemData()
                        setShowNewModal(false)
                    }}
                />
            )}
        </div>
    )
}

// Inline component for new hospedagem appointments
function NewHospedagemAppointmentModal({ onClose, onSave }: { onClose: () => void, onSave: () => void }) {
    const supabase = createClient()
    const [pets, setPets] = useState<any[]>([])
    const [services, setServices] = useState<any[]>([])
    const [selectedPetId, setSelectedPetId] = useState('')
    const [selectedServiceId, setSelectedServiceId] = useState('')

    // Dates
    const [checkInDate, setCheckInDate] = useState(new Date().toISOString().split('T')[0])
    const [checkOutDate, setCheckOutDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]) // Tomorrow

    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const loadData = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile?.org_id) return

            // Load pets
            const { data: petsData } = await supabase
                .from('pets')
                .select('id, name, species, breed, customers(name)')
                .order('name')
            if (petsData) setPets(petsData)

            // Load Hospedagem services only
            const { data: servicesData } = await supabase
                .from('services')
                .select('id, name, base_price, service_categories!inner(name)')
                .eq('org_id', profile.org_id)
                .eq('service_categories.name', 'Hospedagem')
                .order('name')
            if (servicesData) setServices(servicesData)
        }
        loadData()
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedPetId || !selectedServiceId) {
            alert('Selecione um pet e um serviço')
            return
        }

        if (checkOutDate <= checkInDate) {
            alert('A data de saída deve ser posterior à data de entrada.')
            return
        }

        setLoading(true)

        const formData = new FormData()
        formData.append('petId', selectedPetId)
        formData.append('serviceId', selectedServiceId)
        formData.append('checkInDate', checkInDate)
        formData.append('checkOutDate', checkOutDate)
        if (notes) formData.append('notes', notes)

        // Pass fake date/time for compatibility (will be ignored by backend for Hospedagem)
        formData.append('date', checkInDate)
        formData.append('time', '12:00')

        try {
            const result = await createAppointment({ message: '', success: false }, formData)
            if (result.success) {
                alert(result.message)
                onSave()
            } else {
                alert(result.message || 'Erro ao criar agendamento.')
            }
        } catch (error: any) {
            console.error(error)
            alert('Erro inesperado: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
        }} onClick={onClose}>
            <div style={{
                background: '#1e293b', borderRadius: '16px', width: '90%', maxWidth: '500px',
                padding: '2rem', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: '1px solid #334155'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0, color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>Nova Hospedagem</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#cbd5e1' }}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#cbd5e1' }}>Pet *</label>
                        <select required value={selectedPetId} onChange={e => setSelectedPetId(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem', border: '1px solid #334155', borderRadius: '8px', background: '#0f172a', color: 'white' }}>
                            <option value="">Selecione...</option>
                            {pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#cbd5e1' }}>Serviço *</label>
                        <select required value={selectedServiceId} onChange={e => setSelectedServiceId(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem', border: '1px solid #334155', borderRadius: '8px', background: '#0f172a', color: 'white' }}>
                            <option value="">Selecione...</option>
                            {services.map(s => <option key={s.id} value={s.id}>{s.name} - R$ {s.base_price?.toFixed(2)}/dia</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#cbd5e1' }}>Check-in *</label>
                            <input type="date" required value={checkInDate} onChange={e => setCheckInDate(e.target.value)}
                                style={{ width: '100%', padding: '0.75rem', border: '1px solid #334155', borderRadius: '8px', background: '#0f172a', color: 'white' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#cbd5e1' }}>Check-out *</label>
                            <input type="date" required value={checkOutDate} onChange={e => setCheckOutDate(e.target.value)}
                                style={{ width: '100%', padding: '0.75rem', border: '1px solid #334155', borderRadius: '8px', background: '#0f172a', color: 'white' }} />
                        </div>
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#cbd5e1' }}>Observações</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                            style={{ width: '100%', padding: '0.75rem', border: '1px solid #334155', borderRadius: '8px', background: '#0f172a', color: 'white', fontFamily: 'inherit', resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={onClose}
                            style={{ padding: '0.75rem 1.5rem', border: '1px solid #334155', borderRadius: '8px', background: 'transparent', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={loading}
                            style={{ padding: '0.75rem 1.5rem', border: 'none', borderRadius: '8px', background: '#10B981', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
                            {loading ? 'Criando...' : 'Confirmar Reserva'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
