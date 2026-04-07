'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from '../creche/page.module.css'
import Link from 'next/link'
import DateRangeFilter, { DateRange, getDateRange } from '@/components/DateRangeFilter'
import { checkInAppointment, checkOutAppointment } from '@/app/actions/checkInOut'
import { deleteAppointment } from '@/app/actions/appointment'
import DailyReportModal from '@/components/DailyReportModal'
import PaymentControls from '@/components/PaymentControls'
import EditAppointmentModal from '@/components/EditAppointmentModal'
import ServiceExecutionModal from '@/components/ServiceExecutionModal'
import { createAppointment } from '@/app/actions/appointment'

interface Appointment {
    id: string
    pet_id: string
    service_id: string
    scheduled_at: string
    status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'canceled' | 'no_show'
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
        base_price: number
        service_categories: { name: string, color: string, icon: string }
    }
    calculated_price: number | null
    final_price: number | null
    discount_percent: number | null
    payment_status: string | null
    payment_method: string | null
    package_credit_id?: string | null
    package_usage_index?: number | null
    has_taxi?: boolean
    taxi_fee?: number
    package_credits?: {
        total_quantity: number
        used_quantity: number
        customer_packages?: {
            calculated_price: number,
            total_paid: number,
            payment_status: string,
            payment_method: string,
            purchased_at: string,
            has_taxi: boolean,
            taxi_fee: number
        }
    } | null
}

export default function BanhoTosaPage() {
    const supabase = createClient()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)
    const [dateRange, setDateRange] = useState<DateRange>('today')
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)

    const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
    const [searchTerm, setSearchTerm] = useState('')
    const [showNewModal, setShowNewModal] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [pets, setPets] = useState<any[]>([])
    const [services, setServices] = useState<any[]>([])
    const [selectedPetId, setSelectedPetId] = useState('')
    const [selectedServiceId, setSelectedServiceId] = useState('')
    const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({})
    const [loadingPrices, setLoadingPrices] = useState(false)
    const [petSearchTerm, setPetSearchTerm] = useState('')
    const [showPetResults, setShowPetResults] = useState(false)

    const fetchBanhoTosaData = useCallback(async (isBackground = false) => {
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

            // Determine status filter based on viewMode
            const statusFilter = viewMode === 'active'
                ? ['pending', 'confirmed', 'in_progress']
                : ['done', 'completed']

            // Fetch Appointments
            const { data: appts, error } = await supabase
                .from('appointments')
                .select(`
                    id, pet_id, service_id, scheduled_at, status, notes,
                    calculated_price, checklist,
                    final_price, discount_percent, payment_status, payment_method,
                    actual_check_in, actual_check_out,
                    has_taxi, taxi_fee,
                    package_credit_id, package_usage_index,
                    package_credits:package_credit_id (
                        total_quantity,
                        used_quantity,
                        customer_packages (
                            calculated_price,
                            total_paid,
                            payment_status,
                            payment_method,
                            purchased_at,
                            has_taxi,
                            taxi_fee,
                            package_credits (
                                total_quantity
                            )
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
                .eq('services.service_categories.name', 'Banho e Tosa')
                .gte('scheduled_at', startISO)
                .lte('scheduled_at', endISO)
                .in('status', statusFilter)
                .order('scheduled_at', { ascending: viewMode === 'active' }) // Ascending for active, potentially Descending for history? kept simple for now

            // Load pets and services if not loaded yet
            if (pets.length === 0) {
                const { data: petsData } = await supabase
                    .from('pets')
                    .select('id, name, species, breed, weight_kg, customers(name)')
                    .order('name')
                if (petsData) setPets(petsData)
            }

            if (services.length === 0) {
                const { data: servicesData } = await supabase
                    .from('services')
                    .select('id, name, base_price, service_categories(id, name)')
                    .eq('org_id', profile.org_id)
                    .order('name')

                // Filter only Banho e Tosa services
                const banhoTosaServices = servicesData?.filter(s =>
                    (s as any).service_categories?.name === 'Banho e Tosa'
                ) || []
                if (banhoTosaServices.length > 0) setServices(banhoTosaServices)
            }

            if (error) {
                console.error('Error fetching banho e tosa:', error)
            } else if (appts) {
                setAppointments(appts as unknown as Appointment[])
            }

        } catch (error) {
            console.error(error)
        } finally {
            if (!isBackground) setLoading(false)
        }
    }, [supabase, dateRange, viewMode, pets.length, services.length])

    // Fetch dynamic prices when pet changes
    useEffect(() => {
        const fetchPrices = async () => {
            if (showNewModal && selectedPetId) {
                setLoadingPrices(true)
                try {
                    const { calculateManyDynamicPrices } = await import('@/app/actions/pricing')
                    const date = new Date().toISOString().split('T')[0]
                    const serviceIds = services.map(s => s.id)
                    const results = await calculateManyDynamicPrices(selectedPetId, serviceIds, date)

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
    }, [showNewModal, selectedPetId, services])

    useEffect(() => {
        fetchBanhoTosaData()
    }, [fetchBanhoTosaData])

    const handleCheckIn = async (appointmentId: string) => {
        const result = await checkInAppointment(appointmentId)
        if (result.success) {
            alert(result.message)
            fetchBanhoTosaData()
        } else {
            alert(result.message)
        }
    }

    const handleCheckOut = async (appointmentId: string) => {
        const result = await checkOutAppointment(appointmentId)
        if (result.success) {
            alert(result.message)
            fetchBanhoTosaData()
        } else {
            alert(result.message)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este agendamento?')) return
        const result = await deleteAppointment(id)
        if (result.success) {
            alert(result.message)
            fetchBanhoTosaData()
        } else {
            alert(result.message)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>🛁 Banho e Tosa - {viewMode === 'active' ? 'Pets do Dia' : 'Histórico'}</h1>
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
                            onClick={() => {
                                setSelectedPetId('')
                                setPetSearchTerm('')
                                setShowPetResults(false)
                                setShowNewModal(true)
                            }}
                            style={{ flex: 1 }}
                        >
                            + Novo Agendamento
                        </button>
                        <button
                            className={`${styles.actionButton} ${styles.actionButtonSecondary}`}
                            onClick={() => fetchBanhoTosaData()}
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
                    Em Aberto / Execução
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
            ) : appointments.length === 0 ? (
                <div style={{ padding: '2rem', color: '#94a3b8', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    Nenhum pet agendado para banho e tosa no período selecionado.
                </div>
            ) : (
                <div className={styles.grid}>
                    {appointments.map(appt => (
                        <div
                            key={appt.id}
                            className={`${styles.appointmentCard} ${appt.package_credit_id ? styles.packageCard : ''}`}
                            style={{
                                borderLeft: `4px solid ${appt.services?.service_categories?.color || '#2563EB'}`,
                                background: appt.package_credit_id ? 'rgba(155, 89, 182, 0.05)' : 'var(--bg-secondary)',
                                opacity: 1,
                                cursor: 'default',
                                position: 'relative'
                            }}>
                            
                            {appt.package_credit_id && (() => {
                                const pg = appt.package_credits;
                                const cp = (pg as any)?.customer_packages;
                                const cpData = Array.isArray(cp) ? cp[0] : cp;
                                const allCredits = cpData?.package_credits || [];
                                const globalTotal = Array.isArray(allCredits) 
                                    ? allCredits.reduce((sum: number, c: any) => sum + (c.total_quantity || 0), 0)
                                    : ((pg as any)?.total_quantity || 0);

                                const total = globalTotal || (pg as any)?.total_quantity;
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
                                background: appt.services?.service_categories?.color || 'var(--primary)',
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

                            <div className={styles.cardTop} style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '1rem', paddingTop: '0.5rem' }}>
                                <div className={styles.petInfoMain} style={{ flex: 1, overflow: 'hidden' }}>
                                    <div className={styles.petAvatar}>{appt.pets?.species === 'cat' ? '🐱' : '🐶'}</div>
                                    <div className={styles.petDetails} style={{ minWidth: 0 }}>
                                        <div className={styles.petName} style={{ flexWrap: 'wrap', cursor: 'pointer' }} onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedAppointment(appt)
                                        }}>
                                            {appt.pets?.name || 'Pet'}
                                            <span className={styles.statusBadge} style={{ fontSize: '0.75rem', padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                                {appt.actual_check_in && !appt.actual_check_out ? '🟢 Em Atendimento' :
                                                    appt.actual_check_out ? '✅ Concluído' :
                                                        '⏳ Aguardando'}
                                            </span>
                                        </div>
                                        <span className={styles.tutorName} style={{ cursor: 'pointer' }} onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedAppointment(appt)
                                        }}>👤 {appt.pets?.customers?.name || 'Cliente'}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '0.5rem' }}>
                                            {appt.services?.name || 'Serviço'}
                                        </span>
                                        {(() => {
                                            const cp = Array.isArray((appt.package_credits as any)?.customer_packages)
                                                ? (appt.package_credits as any)?.customer_packages[0]
                                                : (appt.package_credits as any)?.customer_packages;
                                            return (
                                                <PaymentControls
                                                    appointmentId={appt.id}
                                                    calculatedPrice={appt.calculated_price ?? appt.services?.base_price ?? null}
                                                    finalPrice={appt.final_price}
                                                    taxiFee={appt.has_taxi ? appt.taxi_fee : 0}
                                                    discountPercent={appt.discount_percent}
                                                    paymentStatus={appt.payment_status}
                                                    paymentMethod={appt.payment_method}
                                                    packageTotal={cp?.calculated_price ?? null}
                                                    packageMethod={cp?.payment_method ?? null}
                                                    packageDate={cp?.purchased_at ?? null}
                                                    packageHasTaxi={cp?.has_taxi ?? false}
                                                    packageTaxiFee={cp?.taxi_fee ?? 0}
                                                    onUpdate={() => fetchBanhoTosaData(true)}
                                                    compact
                                                    isPackage={!!appt.package_credit_id}
                                                />
                                            );
                                        })()}
                                        <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            🕐 Agendado: {new Date(appt.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {appt.actual_check_in && (
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                Início: {new Date(appt.actual_check_in).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                        {appt.actual_check_out && (
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                Término: {new Date(appt.actual_check_out).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {viewMode === 'active' && (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setEditingAppointment(appt)
                                            }}
                                            title="Editar Agendamento"
                                            style={{
                                                background: 'rgba(255,255,255,0.1)',
                                                border: 'none',
                                                borderRadius: '50%',
                                                width: '32px',
                                                height: '32px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '1rem'
                                            }}
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleDelete(appt.id)
                                            }}
                                            title="Excluir Agendamento"
                                            style={{
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                border: 'none',
                                                borderRadius: '50%',
                                                width: '32px',
                                                height: '32px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '1rem'
                                            }}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                )}
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
                                                🟢 Iniciar Atendimento
                                            </button>
                                        ) : !appt.actual_check_out ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleCheckOut(appt.id)
                                                }}
                                                style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#2563EB', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                                                ✅ Finalizar Atendimento
                                            </button>
                                        ) : null}
                                    </>
                                ) : (
                                    <button
                                        style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#475569', color: '#e2e8f0', cursor: 'pointer', fontWeight: 600 }}>
                                        📜 Ver Detalhes do Histórico
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Service Execution Modal (Replacing DailyReport for Banho e Tosa) */}
            {selectedAppointment && (
                <ServiceExecutionModal
                    appointment={selectedAppointment}
                    onClose={() => setSelectedAppointment(null)}
                    onSave={() => {
                        fetchBanhoTosaData()
                        // Keep open if just checking checklist? No, maybe close or refresh.
                        // Let's refresh data but keep modal open would be ideal, but for now simple refresh.
                        // Actually, if we want to keep working, we should probably refetch the appointment data specifically.
                        // But simplified: close on major actions, refresh on minor.
                    }}
                />
            )}

            {/* Edit Modal */}
            {editingAppointment && (
                <EditAppointmentModal
                    appointment={editingAppointment}
                    onClose={() => setEditingAppointment(null)}
                    onSave={() => {
                        fetchBanhoTosaData()
                        setEditingAppointment(null)
                    }}
                />
            )}

            {/* New Appointment Modal */}
            {showNewModal && (
                <div className={styles.modalOverlay} onClick={() => setShowNewModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>Novo Agendamento - Banho e Tosa</h2>
                        <form action={async (formData) => {
                            if (submitting) return
                            setSubmitting(true)
                            try {
                                const result = await createAppointment({ message: '', success: false }, formData)
                                if (result.success) {
                                    setShowNewModal(false)
                                    fetchBanhoTosaData()
                                } else {
                                    alert(result.message)
                                }
                            } finally {
                                setSubmitting(false)
                            }
                        }}>
                            <div className={styles.formGroup} style={{ position: 'relative' }}>
                                <label className={styles.label}>Pet * (Busque por nome do pet ou do tutor)</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    placeholder="🔍 Buscar pet ou tutor..."
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

                                {/* Hidden select for form submission */}
                                <select
                                    name="petId"
                                    required
                                    value={selectedPetId}
                                    onChange={(e) => setSelectedPetId(e.target.value)}
                                    style={{ display: 'none' }}
                                >
                                    <option value="">Selecione...</option>
                                    {pets.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
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
                                <select
                                    name="serviceId"
                                    className={styles.select}
                                    required
                                    value={selectedServiceId}
                                    onChange={(e) => setSelectedServiceId(e.target.value)}
                                >
                                    <option value="">Selecione...</option>
                                    {services.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} - R$ {(dynamicPrices[s.id] ?? (s.base_price || 0)).toFixed(2)}
                                        </option>
                                    ))}
                                </select>
                                {selectedServiceId && dynamicPrices[selectedServiceId] !== undefined && (
                                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#60a5fa', fontWeight: 600 }}>
                                        {loadingPrices ? 'Calculando...' : `Preço real para este pet: R$ ${dynamicPrices[selectedServiceId].toFixed(2)}`}
                                    </div>
                                )}
                            </div>
                            <div className={styles.row}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Data *</label>
                                    <input name="date" type="date" className={styles.input} required />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Hora *</label>
                                    <input name="time" type="time" className={styles.input} required />
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Observações</label>
                                <textarea name="notes" className={styles.textarea} rows={3} />
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowNewModal(false)}>Cancelar</button>
                                <button type="submit" className={styles.submitBtn} disabled={submitting}>{submitting ? 'Agendando...' : 'Agendar'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
