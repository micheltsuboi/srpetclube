'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from '../agenda/page.module.css'
import Link from 'next/link'
import DateRangeFilter, { DateRange, getDateRange } from '@/components/DateRangeFilter'
import { checkInAppointment, checkOutAppointment } from '@/app/actions/checkInOut'
import { deleteAppointment } from '@/app/actions/appointment'
import DailyReportModal from '@/components/DailyReportModal'
import EditAppointmentModal from '@/components/EditAppointmentModal'
import ServiceExecutionModal from '@/components/ServiceExecutionModal'

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
        service_categories: { name: string, color: string, icon: string }
    }
}

export default function BanhoTosaPage() {
    const supabase = createClient()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)
    const [dateRange, setDateRange] = useState<DateRange>('today')
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)

    const [viewMode, setViewMode] = useState<'active' | 'history'>('active')

    const fetchBanhoTosaData = useCallback(async () => {
        try {
            setLoading(true)
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
                    actual_check_in, actual_check_out,
                    pets ( name, species, breed, customers ( name ) ),
                    services ( 
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

            if (error) {
                console.error('Error fetching banho e tosa:', error)
            } else if (appts) {
                setAppointments(appts as unknown as Appointment[])
            }

        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }, [supabase, dateRange, viewMode])

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
                <h1 className={styles.title}>🛁 Banho e Tosa</h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <Link href="/owner/agenda?mode=new&category=Banho e Tosa" className={styles.actionButton} style={{ textDecoration: 'none', background: 'var(--primary)', color: 'white' }}>
                        + Novo Agendamento
                    </Link>
                    <button className={styles.actionButton} onClick={fetchBanhoTosaData}>↻ Atualizar</button>
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
                    Em Aberto / Execução
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
                    📜 Histórico de Atendimentos
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
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                    {appointments.map(appt => (
                        <div
                            key={appt.id}
                            className={styles.appointmentCard}
                            onClick={() => setSelectedAppointment(appt)}
                            style={{
                                borderLeft: `4px solid ${appt.services?.service_categories?.color || '#2563EB'}`,
                                background: 'var(--bg-secondary)',
                                opacity: 1,
                                cursor: 'pointer',
                                position: 'relative' // Ensure relative positioning for absolute badge
                            }}>
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

                            <div className={styles.cardTop} style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '5px' }}>
                                <div className={styles.petInfoMain} style={{ flex: 1, overflow: 'hidden' }}>
                                    <div className={styles.petAvatar}>{appt.pets?.species === 'cat' ? '🐱' : '🐶'}</div>
                                    <div className={styles.petDetails} style={{ minWidth: 0 }}>
                                        <div className={styles.petName} style={{ flexWrap: 'wrap' }}>
                                            {appt.pets?.name || 'Pet'}
                                            <span className={styles.statusBadge} style={{ fontSize: '0.75rem', padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                                {appt.actual_check_in && !appt.actual_check_out ? '🟢 Em Atendimento' :
                                                    appt.actual_check_out ? '✅ Concluído' :
                                                        '⏳ Aguardando'}
                                            </span>
                                        </div>
                                        <span className={styles.tutorName}>👤 {appt.pets?.customers?.name || 'Cliente'}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '0.5rem' }}>
                                            {appt.services?.name || 'Serviço'}
                                            {(appt.services as any)?.base_price && (
                                                <span style={{
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    color: '#10b981',
                                                    background: 'rgba(16, 185, 129, 0.1)',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px'
                                                }}>
                                                    R$ {(appt.services as any)?.base_price.toFixed(2)}
                                                </span>
                                            )}
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
        </div>
    )
}
