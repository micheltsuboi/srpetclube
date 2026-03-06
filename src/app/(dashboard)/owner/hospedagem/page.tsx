'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './page.module.css'
import Link from 'next/link'
import DateRangeFilter, { DateRange, getDateRange } from '@/components/DateRangeFilter'
import { checkInAppointment, checkOutAppointment } from '@/app/actions/checkInOut'
import { deleteAppointment, createAppointment } from '@/app/actions/appointment'
import ServiceExecutionModal from '@/components/ServiceExecutionModal'
import DailyReportModal from '@/components/DailyReportModal'
import EditAppointmentModal from '@/components/EditAppointmentModal'
import PaymentControls from '@/components/PaymentControls'

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
    final_price: number | null
    discount_percent: number | null
    payment_status: string | null
    payment_method: string | null
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

    const fetchHospedagemData = useCallback(async (isBackground = false) => {
        try {
            if (!isBackground) setLoading(true)
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
                    final_price, discount_percent, payment_status, payment_method,
                    check_in_date, check_out_date,
                    actual_check_in, actual_check_out,
                    pets ( name, species, breed, customers ( name ) ),
                    services!inner ( 
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
            if (!isBackground) setLoading(false)
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
                <div className={styles.actionGroup}>
                    <input
                        type="text"
                        placeholder="🔍 Buscar pet ou tutor..."
                        value={searchTerm}
                        className={styles.searchInput}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <div className={styles.buttonGroup}>
                        <button
                            className={styles.actionButton}
                            onClick={() => setShowNewModal(true)}
                            style={{ flex: 1 }}
                        >
                            + Novo Agendamento
                        </button>
                        <button className={styles.actionButton} onClick={() => fetchHospedagemData()}>↻</button>
                    </div>
                </div>
            </div>

            {/* View Mode Tabs */}
            <div className={styles.tabs}>
                <button
                    onClick={() => setViewMode('active')}
                    className={`${styles.tab} ${viewMode === 'active' ? styles.activeTab : ''}`}
                >
                    Hóspedes Ativos / Futuros
                </button>
                <button
                    onClick={() => setViewMode('history')}
                    className={`${styles.tab} ${viewMode === 'history' ? styles.activeTab : ''}`}
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
                <div className={styles.grid}>
                    {filteredAppointments.map(appt => {
                        const checkInDate = appt.check_in_date ? new Date(appt.check_in_date + 'T12:00:00') : new Date(appt.scheduled_at)
                        const checkOutDate = appt.check_out_date ? new Date(appt.check_out_date + 'T12:00:00') : null

                        // Calculate days
                        const days = checkOutDate
                            ? Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))
                            : 1

                        const totalEstimate = appt.calculated_price
                            ? Number(appt.calculated_price)
                            : ((appt.services?.base_price || 0) * (days || 1))

                        const categoryColor = appt.services?.service_categories?.color || '#F97316'

                        return (
                            <div
                                key={appt.id}
                                className={styles.appointmentCard}
                                style={{
                                    borderLeft: `4px solid ${categoryColor}`,
                                    background: 'var(--bg-secondary)',
                                    opacity: 1,
                                    cursor: 'default'
                                }}>
                                {/* Date Badge */}
                                <div style={{
                                    position: 'absolute',
                                    top: '-12px',
                                    right: '16px',
                                    background: categoryColor,
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
                                    border: '3px solid var(--bg-primary, #0f172a)',
                                    minWidth: '54px'
                                }}>
                                    <span style={{ fontSize: '1.4rem', fontWeight: '900', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                        {checkInDate.getDate()}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginTop: '2px', opacity: 0.95 }}>
                                        {checkInDate.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                                    </span>
                                </div>

                                {/* Main Content */}
                                <div className={styles.cardTop} style={{ marginTop: '1rem', paddingTop: '0.5rem' }}>
                                    <div className={styles.petInfoMain} style={{ flex: 1, minWidth: 0 }}>
                                        <div className={styles.petAvatar}>{appt.pets?.species === 'cat' ? '🐱' : '🐶'}</div>
                                        <div className={styles.petDetails} style={{ minWidth: 0, paddingRight: '1rem' }}>
                                            <div className={styles.petName} style={{ flexWrap: 'wrap', gap: '0.5rem', cursor: 'pointer' }} onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedAppointment(appt)
                                            }}>
                                                {appt.pets?.name || 'Pet'}
                                                <span className={styles.statusBadge} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                                                    {appt.status === 'in_progress' ? '🏠 Hospedado' :
                                                        (appt.status === 'done' || appt.status === 'completed') ? '✅ Finalizado' :
                                                            '⏳ Reservado'}
                                                </span>
                                            </div>

                                            {/* Action Buttons Row */}
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
                                                            fontSize: '0.9rem',
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
                                                            fontSize: '0.9rem',
                                                            color: '#fca5a5'
                                                        }}
                                                    >
                                                        🗑️ Excluir
                                                    </button>
                                                </div>
                                            )}
                                            <span className={styles.tutorName} style={{ cursor: 'pointer' }} onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedAppointment(appt)
                                            }}>👤 {appt.pets?.customers?.name || 'Cliente'}</span>

                                            <div style={{ fontSize: '0.85rem', color: '#e2e8f0', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span>📅 <strong>Check-in:</strong></span>
                                                    {appt.actual_check_in ? (
                                                        <span style={{ color: '#10b981', fontWeight: 600 }}>{new Date(appt.actual_check_in).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} ✓</span>
                                                    ) : (
                                                        <span>{checkInDate.toLocaleDateString('pt-BR')}</span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span>📅 <strong>Check-out:</strong></span>
                                                    {appt.actual_check_out ? (
                                                        <span style={{ color: '#10b981', fontWeight: 600 }}>{new Date(appt.actual_check_out).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} ✓</span>
                                                    ) : (
                                                        <span>{checkOutDate ? checkOutDate.toLocaleDateString('pt-BR') : '?'}</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                                                {appt.services?.name} ({days} {days === 1 ? 'dia' : 'dias'})
                                            </div>

                                            <PaymentControls
                                                appointmentId={appt.id}
                                                calculatedPrice={totalEstimate}
                                                finalPrice={appt.final_price}
                                                discountPercent={appt.discount_percent}
                                                paymentStatus={appt.payment_status}
                                                paymentMethod={appt.payment_method}
                                                onUpdate={() => fetchHospedagemData(true)}
                                                compact
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>


                                    {viewMode === 'active' && (
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {appt.status !== 'in_progress' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleCheckIn(appt.id) }}
                                                    style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#10B981', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                                                    📥 Check-in
                                                </button>
                                            )}
                                            {appt.status === 'in_progress' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleCheckOut(appt.id) }}
                                                    style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#F97316', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                                                    📤 Check-out
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {viewMode === 'history' && (
                                        <button
                                            style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#475569', color: '#e2e8f0', cursor: 'pointer', fontWeight: 600 }}>
                                            📜 Ver Relatório
                                        </button>
                                    )}
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
    const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({})
    const [loadingPrices, setLoadingPrices] = useState(false)

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

    // Fetch dynamic prices when pet changes or service interaction
    useEffect(() => {
        const fetchPrices = async () => {
            if (selectedPetId) {
                setLoadingPrices(true)
                try {
                    const { calculateManyDynamicPrices } = await import('@/app/actions/pricing')
                    const serviceIds = services.map(s => s.id)
                    const results = await calculateManyDynamicPrices(selectedPetId, serviceIds, checkInDate)

                    const newPrices: Record<string, number> = {}
                    services.forEach(s => {
                        newPrices[s.id] = results[s.id] ?? s.base_price
                    })
                    setDynamicPrices(newPrices)
                } catch (err) {
                    console.error(err)
                } finally {
                    setLoadingPrices(false)
                }
            }
        }
        fetchPrices()
    }, [selectedPetId, services, checkInDate])

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
                            {services.map(s => <option key={s.id} value={s.id}>{s.name} - R$ {(dynamicPrices[s.id] ?? s.base_price)?.toFixed(2)}/dia</option>)}
                        </select>
                        {selectedServiceId && dynamicPrices[selectedServiceId] !== undefined && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#F97316', fontWeight: 600 }}>
                                {loadingPrices ? 'Calculando...' : `Preço real diário: R$ ${dynamicPrices[selectedServiceId].toFixed(2)}`}
                            </div>
                        )}
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
