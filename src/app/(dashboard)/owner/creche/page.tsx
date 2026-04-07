'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './page.module.css'
import Link from 'next/link'
import DateRangeFilter, { DateRange, getDateRange } from '@/components/DateRangeFilter'
import { checkInAppointment, checkOutAppointment } from '@/app/actions/checkInOut'
import { deleteAppointment } from '@/app/actions/appointment'
import DailyReportModal from '@/components/DailyReportModal'
import EditAppointmentModal from '@/components/EditAppointmentModal'
import PaymentControls from '@/components/PaymentControls'

interface Appointment {
    id: string
    pet_id: string
    service_id: string
    scheduled_at: string
    status: 'pending' | 'confirmed' | 'in_progress' | 'done' | 'completed' | 'canceled' | 'no_show'
    notes: string | null
    actual_check_in: string | null
    actual_check_out: string | null
    pets: {
        name: string
        species: string
        breed: string | null
        customers: { name: string }
    }
    services: {
        name: string
        service_categories: { name: string, color: string, icon: string }
    }
    package_credit_id?: string | null
    package_usage_index?: number | null
    package_credits?: {
        total_quantity: number
        used_quantity: number
    } | null
}

export default function CrechePage() {
    const supabase = createClient()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)
    const [dateRange, setDateRange] = useState<DateRange>('today')
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
    const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
    const [searchTerm, setSearchTerm] = useState('')
    const [showNewModal, setShowNewModal] = useState(false)

    const fetchCrecheData = useCallback(async (isBackground = false) => {
        try {
            if (!isBackground) setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile?.org_id) return

            // Get Date Range based on filter
            const { start, end } = getDateRange(dateRange)
            const startISO = start.toISOString()
            const endISO = end.toISOString()

            // Status Filter based on viewMode
            const statusFilter = viewMode === 'active'
                ? ['pending', 'confirmed', 'in_progress']
                : ['done', 'completed']

            // Fetch Appointments
            const { data: appts, error } = await supabase
                .from('appointments')
                .select(`
                    id, pet_id, service_id, scheduled_at, status, notes,
                    calculated_price, final_price, discount_percent, payment_status, payment_method,
                    actual_check_in, actual_check_out,
                    package_credit_id, package_usage_index,
                    package_credits:package_credit_id (
                        total_quantity,
                        used_quantity,
                        customer_packages (
                            calculated_price,
                            total_paid,
                            payment_status,
                            payment_method,
                            purchased_at
                        )
                    ),
                    pets ( name, species, breed, customers ( name ) ),
                    services!inner ( 
                        name, 
                        base_price,
                        service_categories!inner ( name, color, icon )
                    )
                `)
                .eq('org_id', profile.org_id)
                .eq('services.service_categories.name', 'Creche') // Filter by joined category name
                .gte('scheduled_at', startISO)
                .lte('scheduled_at', endISO)
                .in('status', statusFilter)
                .order('scheduled_at', { ascending: viewMode === 'active' })

            if (error) {
                console.error('Error fetching creche:', error)
            } else if (appts) {
                setAppointments(appts as unknown as Appointment[])
            }

        } catch (error) {
            console.error(error)
        } finally {
            if (!isBackground) setLoading(false)
        }
    }, [supabase, dateRange, viewMode])

    useEffect(() => {
        fetchCrecheData()
    }, [fetchCrecheData])

    const handleCheckIn = async (appointmentId: string) => {
        const result = await checkInAppointment(appointmentId)
        if (result.success) {
            alert(result.message)
            fetchCrecheData()
        } else {
            alert(result.message)
        }
    }

    const handleCheckOut = async (appointmentId: string) => {
        const result = await checkOutAppointment(appointmentId)
        if (result.success) {
            alert(result.message)
            fetchCrecheData()
        } else {
            alert(result.message)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este agendamento?')) return
        const result = await deleteAppointment(id)
        if (result.success) {
            alert(result.message)
            fetchCrecheData()
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
                <h1 className={styles.title}>🎾 Creche - {viewMode === 'active' ? 'Pets do Dia' : 'Histórico'}</h1>
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
                            className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                            onClick={() => setShowNewModal(true)}
                            style={{ flex: 1 }}
                        >
                            + Novo Agendamento
                        </button>
                        <button
                            className={`${styles.actionButton} ${styles.actionButtonSecondary}`}
                            onClick={() => fetchCrecheData()}
                        >
                            ↻
                        </button>
                    </div>
                </div>
            </div>

            {/* View Mode Tabs */}
            <div className={styles.tabs}>
                <button
                    onClick={() => setViewMode('active')}
                    className={`${styles.tab} ${viewMode === 'active' ? styles.activeTab : ''}`}
                >
                    Em Aberto / Na Creche
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
                    {searchTerm ? 'Nenhum resultado encontrado para a busca.' : (viewMode === 'active' ? 'Nenhum pet agendado para a creche no período selecionado.' : 'Nenhum histórico encontrado para o período.')}
                </div>
            ) : (
                <div className={styles.grid}>
                    {filteredAppointments.map(appt => (
                        <div
                            key={appt.id}
                            className={`${styles.appointmentCard} ${appt.package_credit_id ? styles.packageCard : ''}`}
                            style={{
                                borderLeft: `4px solid ${appt.services?.service_categories?.color || '#10B981'}`,
                                background: appt.package_credit_id ? 'rgba(155, 89, 182, 0.05)' : 'var(--bg-secondary)',
                                opacity: 1,
                                cursor: 'default',
                                position: 'relative'
                            }}>
                            
                            {appt.package_credit_id && (() => {
                                const total = appt.package_credits?.total_quantity;
                                const rawIdx = appt.package_usage_index || 1;
                                const idx = total ? Math.min(rawIdx, total) : rawIdx;
                                return (
                                    <div className={styles.packageHeaderBadge} title={`Sessão do pacote ${idx}`}>
                                        Sessão {idx} {total ? ` de ${total}` : ''}
                                    </div>
                                );
                            })()}
                            {/* Date Badge - Enhanced for visibility */}
                            <div style={{
                                position: 'absolute',
                                top: '-12px',
                                right: '16px',
                                background: appt.services?.service_categories?.color || '#10B981', // Fallback to Green
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
                                border: '3px solid var(--bg-primary, #0f172a)', // Thicker border to detach from card
                                minWidth: '54px'
                            }}>
                                <span style={{ fontSize: '1.4rem', fontWeight: '900', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                    {new Date(appt.scheduled_at).getDate()}
                                </span>
                                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginTop: '2px', opacity: 0.95 }}>
                                    {new Date(appt.scheduled_at).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                                </span>
                            </div>

                            {/* Main Content with Padding to avoid badge overlap */}
                            <div className={styles.cardTop} style={{ marginTop: '1rem', paddingTop: '0.5rem' }}>
                                <div className={styles.petInfoMain} style={{ flex: 1, minWidth: 0 }}>
                                    <div className={styles.petAvatar}>{appt.pets?.species === 'cat' ? '🐱' : '🐶'}</div>
                                    <div className={styles.petDetails} style={{ minWidth: 0, paddingRight: '1rem' }}>
                                        <div className={styles.petName} style={{ flexWrap: 'wrap', gap: '0.5rem' }} onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedAppointment(appt)
                                        }}>
                                            {appt.pets?.name || 'Pet'}
                                            <span className={styles.statusBadge} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                                                {appt.actual_check_in && !appt.actual_check_out ? '🟢 Na Creche' :
                                                    appt.actual_check_out ? '✅ Finalizado' :
                                                        '⏳ Aguardando'}
                                            </span>
                                        </div>
                                        {/* Action Buttons Row (Mobile Friendly) */}
                                        {viewMode === 'active' && (
                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setEditingAppointment(appt)
                                                    }}
                                                    title="Editar"
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
                                                    title="Excluir"
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
                                        <span className={styles.tutorName}>👤 {appt.pets?.customers?.name || 'Cliente'}</span>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                                            📅 {new Date(appt.scheduled_at).toLocaleDateString('pt-BR', {
                                                weekday: 'short',
                                                day: '2-digit',
                                                month: 'short'
                                            })}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                                            <span>{appt.services?.name || 'Creche'}</span>
                                        </div>
                                        {(() => {
                                            const cp = Array.isArray((appt.package_credits as any)?.customer_packages)
                                                ? (appt.package_credits as any)?.customer_packages[0]
                                                : (appt.package_credits as any)?.customer_packages;
                                            return (
                                                <PaymentControls
                                                    appointmentId={appt.id}
                                                    calculatedPrice={(appt as any).calculated_price ?? (appt.services as any)?.base_price ?? null}
                                                    finalPrice={(appt as any).final_price}
                                                    discountPercent={(appt as any).discount_percent}
                                                    paymentStatus={(appt as any).payment_status}
                                                    paymentMethod={(appt as any).payment_method}
                                                    onUpdate={() => fetchCrecheData(true)}
                                                    compact
                                                    isPackage={!!appt.package_credit_id}
                                                    packageTotal={cp?.calculated_price ?? null}
                                                    packageMethod={cp?.payment_method ?? null}
                                                    packageDate={cp?.purchased_at ?? null}
                                                />
                                            );
                                        })()}
                                        <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            🕐 Agendado: {new Date(appt.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {appt.actual_check_in && (
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                Entrada: {new Date(appt.actual_check_in).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                        {appt.actual_check_out && (
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                Saída: {new Date(appt.actual_check_out).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                                {viewMode === 'active' ? (
                                    <>
                                        {!appt.actual_check_in ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleCheckIn(appt.id)
                                                }}
                                                style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#10B981', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                                                📥 Check-in (Entrada)
                                            </button>
                                        ) : !appt.actual_check_out ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleCheckOut(appt.id)
                                                }}
                                                style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#F97316', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                                                📤 Check-out (Saída)
                                            </button>
                                        ) : null}
                                    </>
                                ) : (
                                    <button
                                        style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#475569', color: '#e2e8f0', cursor: 'pointer', fontWeight: 600 }}>
                                        📜 Ver Relatório do Dia
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Daily Report Modal */}
            {selectedAppointment && (
                <DailyReportModal
                    appointmentId={selectedAppointment.id}
                    petName={selectedAppointment.pets?.name || 'Pet'}
                    serviceName={selectedAppointment.services?.name || 'Creche'}
                    onClose={() => setSelectedAppointment(null)}
                    onSave={() => {
                        fetchCrecheData()
                        setSelectedAppointment(null)
                    }}
                    readOnly={viewMode === 'history'}
                />
            )}

            {/* New Appointment Modal */}
            {showNewModal && (
                <NewCrecheAppointmentModal
                    onClose={() => setShowNewModal(false)}
                    onSave={() => {
                        fetchCrecheData()
                        setShowNewModal(false)
                    }}
                />
            )}
        </div>
    )
}

// Inline component for new appointments
function NewCrecheAppointmentModal({ onClose, onSave }: { onClose: () => void, onSave: () => void }) {
    const supabase = createClient()
    const [pets, setPets] = useState<any[]>([])
    const [services, setServices] = useState<any[]>([])
    const [selectedPetId, setSelectedPetId] = useState('')
    const [selectedServiceId, setSelectedServiceId] = useState('')
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
    const [selectedTime, setSelectedTime] = useState('08:00')
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({})
    const [loadingPrices, setLoadingPrices] = useState(false)
    const [petSearchTerm, setPetSearchTerm] = useState('')
    const [showPetResults, setShowPetResults] = useState(false)

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

            // Load Creche services only
            const { data: servicesData } = await supabase
                .from('services')
                .select('id, name, base_price, service_categories!inner(name)')
                .eq('org_id', profile.org_id)
                .eq('service_categories.name', 'Creche')
                .order('name')
            if (servicesData) setServices(servicesData)
        }
        loadData()
    }, [])

    // Fetch dynamic prices when pet changes
    useEffect(() => {
        const fetchPrices = async () => {
            if (selectedPetId) {
                setLoadingPrices(true)
                try {
                    const { calculateManyDynamicPrices } = await import('@/app/actions/pricing')
                    const serviceIds = services.map(s => s.id)
                    const results = await calculateManyDynamicPrices(selectedPetId, serviceIds, selectedDate)

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
    }, [selectedPetId, services, selectedDate])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedPetId || !selectedServiceId) {
            alert('Selecione um pet e um serviço')
            return
        }

        setLoading(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

        // Validate year
        const year = parseInt(selectedDate.split('-')[0], 10)
        if (year < 2024) {
            setLoading(false)
            alert('Ano inválido. Por favor, digite o ano com 4 dígitos (ex: 2026).')
            return
        }

        const { error } = await supabase.from('appointments').insert({
            org_id: profile?.org_id,
            pet_id: selectedPetId,
            service_id: selectedServiceId,
            scheduled_at: `${selectedDate}T${selectedTime}:00`,
            status: 'confirmed',
            notes: notes || null
        })

        setLoading(false)

        if (error) {
            alert('Erro ao criar agendamento: ' + error.message)
        } else {
            alert('Agendamento criado com sucesso!')
            onSave()
        }
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 className={styles.modalTitle} style={{ margin: 0 }}>Novo Agendamento</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#cbd5e1' }}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup} style={{ position: 'relative' }}>
                        <label className={styles.label}>Pet * (Busque por nome ou tutor)</label>
                        <input
                            type="text"
                            placeholder="🔍 Buscar pet ou tutor..."
                            className={styles.input}
                            value={petSearchTerm}
                            onChange={(e) => {
                                setPetSearchTerm(e.target.value)
                                setShowPetResults(true)
                            }}
                            onFocus={() => setShowPetResults(true)}
                            required={!selectedPetId}
                        />

                        {showPetResults && petSearchTerm.length > 0 && (
                            <div className={styles.searchResultsContainer}>
                                {pets
                                    .filter(p =>
                                        p.name.toLowerCase().includes(petSearchTerm.toLowerCase()) ||
                                        p.customers?.name?.toLowerCase().includes(petSearchTerm.toLowerCase())
                                    )
                                    .slice(0, 10)
                                    .map(p => (
                                        <div
                                            key={p.id}
                                            className={styles.searchResultItem}
                                            onClick={() => {
                                                setSelectedPetId(p.id)
                                                setPetSearchTerm(p.name)
                                                setShowPetResults(false)
                                            }}
                                        >
                                            <span className={styles.resultPetName}>{p.name} ({p.species})</span>
                                            <span className={styles.resultTutorName}>👤 {p.customers?.name || 'Tutor não identificado'}</span>
                                        </div>
                                    ))}
                                {pets.filter(p =>
                                    p.name.toLowerCase().includes(petSearchTerm.toLowerCase()) ||
                                    p.customers?.name?.toLowerCase().includes(petSearchTerm.toLowerCase())
                                ).length === 0 && (
                                        <div className={styles.searchResultItem} style={{ color: '#94a3b8', cursor: 'default' }}>
                                            Nenhum pet encontrado.
                                        </div>
                                    )}
                            </div>
                        )}

                        <select required value={selectedPetId} onChange={e => setSelectedPetId(e.target.value)}
                            style={{ display: 'none' }}>
                            <option value="">Selecione...</option>
                            {pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>

                        {selectedPetId && !showPetResults && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#10B981', fontWeight: 600 }}>
                                ✓ Pet selecionado: {pets.find(p => p.id === selectedPetId)?.name}
                                ({pets.find(p => p.id === selectedPetId)?.customers?.name})
                            </div>
                        )}
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Serviço *</label>
                        <select required value={selectedServiceId} onChange={e => setSelectedServiceId(e.target.value)}
                            className={styles.select}>
                            <option value="">Selecione...</option>
                            {services.map(s => <option key={s.id} value={s.id}>{s.name} - R$ {(dynamicPrices[s.id] ?? s.base_price)?.toFixed(2)}</option>)}
                        </select>
                        {selectedServiceId && dynamicPrices[selectedServiceId] !== undefined && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#10B981', fontWeight: 600 }}>
                                {loadingPrices ? 'Calculando...' : `Preço real para este pet: R$ ${dynamicPrices[selectedServiceId].toFixed(2)}`}
                            </div>
                        )}
                    </div>
                    <div className={styles.row}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Data *</label>
                            <input type="date" required value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                                className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Hora *</label>
                            <input type="time" required value={selectedTime} onChange={e => setSelectedTime(e.target.value)}
                                className={styles.input} />
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Observações</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                            className={styles.textarea} />
                    </div>
                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.cancelBtn}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={loading} className={styles.submitBtn}>
                            {loading ? 'Criando...' : 'Criar Agendamento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
