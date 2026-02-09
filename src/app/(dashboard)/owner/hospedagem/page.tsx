'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from '../agenda/page.module.css' // Reuse agenda styles
import Link from 'next/link'
import { updateAppointmentStatus } from '@/app/actions/appointment'

interface Appointment {
    id: string
    pet_id: string
    service_id: string
    scheduled_at: string
    check_in_date: string | null
    check_out_date: string | null
    status: 'pending' | 'confirmed' | 'in_progress' | 'done' | 'canceled' | 'no_show'
    notes: string | null
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

export default function HospedagemPage() {
    const supabase = createClient()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)

    const fetchHospedagemData = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile?.org_id) return

            // Today's Date
            const today = new Date().toISOString().split('T')[0]

            // Fetch Appointments
            // Logic: Category='Hospedagem' AND (scheduled_at=today OR (check_in <= today <= check_out))
            // Note: Since we can't easily do complex ORs across joined tables and dates in one Supabase simple query,
            // we'll fetch 'Hospedagem' appointments for a broader range (e.g. this month) and filter in JS, 
            // OR mostly rely on 'scheduled_at' for now until Phase 5 is complete.

            // Fetch ONLY in_progress status for Hospedagem (actively staying)
            // OR pending/confirmed with check-in date = today
            const { data: appts, error } = await supabase
                .from('appointments')
                .select(`
                    id, pet_id, service_id, scheduled_at, status, notes, check_in_date, check_out_date,
                    pets ( name, species, breed, customers ( name ) ),
                    services ( 
                        name, 
                        service_categories!inner ( name, color, icon )
                    )
                `)
                .eq('org_id', profile.org_id)
                .eq('services.service_categories.name', 'Hospedagem')
                .in('status', ['pending', 'confirmed', 'in_progress'])
                .order('scheduled_at')

            if (error) {
                console.error('Error fetching hospedagem:', error)
            } else if (appts) {
                // Client-side filter for "Active Today"
                const active = appts.filter((a: any) => {
                    const checkIn = a.check_in_date
                    const checkOut = a.check_out_date

                    // STRICT: Only show if:
                    // 1. Status is in_progress (currently staying)
                    // 2. OR status is pending/confirmed AND check-in is today or in the past AND check-out is today or future
                    if (a.status === 'in_progress') {
                        // If actively staying, show regardless of dates
                        return true
                    }

                    // For pending/confirmed, require valid date range covering today
                    if (checkIn && checkOut) {
                        return today >= checkIn && today <= checkOut
                    }

                    // Don't show appointments without proper date ranges
                    return false
                })
                setAppointments(active as unknown as Appointment[])
            }

        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchHospedagemData()
    }, [fetchHospedagemData])

    const handleStatusChange = async (id: string, newStatus: 'in_progress' | 'done') => {
        if (!confirm(`Confirmar ${newStatus === 'in_progress' ? 'Check-in' : 'Check-out'} do hóspede?`)) return

        await updateAppointmentStatus(id, newStatus)
        fetchHospedagemData() // Refresh
    }



    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>🏨 Hospedagem - Hóspedes Ativos</h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <Link href="/owner/agenda?mode=new&category=Hospedagem" className={styles.actionButton} style={{ textDecoration: 'none', background: 'var(--primary)', color: 'white' }}>
                        + Novo Agendamento
                    </Link>
                    <button className={styles.actionButton} onClick={fetchHospedagemData}>↻ Atualizar</button>
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '2rem', color: '#94a3b8' }}>Carregando...</div>
            ) : appointments.length === 0 ? (
                <div style={{ padding: '2rem', color: '#94a3b8', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    Nenhum hóspede ativo no momento.
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                    {appointments.map(appt => {
                        const isRange = appt.check_in_date && appt.check_out_date
                        const dateDisplay = isRange
                            ? `${new Date(appt.check_in_date!).toLocaleDateString('pt-BR')} - ${new Date(appt.check_out_date!).toLocaleDateString('pt-BR')}`
                            : new Date(appt.scheduled_at).toLocaleDateString('pt-BR')

                        return (
                            <div key={appt.id} className={styles.appointmentCard} style={{
                                borderLeft: `4px solid ${appt.services?.service_categories?.color || '#ccc'}`,
                                background: appt.status === 'done' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                                opacity: appt.status === 'done' ? 0.7 : 1
                            }}>
                                <div className={styles.cardTop}>
                                    <div className={styles.petInfoMain}>
                                        <div className={styles.petAvatar}>{appt.pets?.species === 'cat' ? '🐱' : '🐶'}</div>
                                        <div className={styles.petDetails}>
                                            <div className={styles.petName}>
                                                {appt.pets?.name || 'Pet desconhecido'}
                                                <span className={styles.statusBadge} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                                                    {appt.status === 'in_progress' ? '🏠 Hospedado' :
                                                        appt.status === 'done' ? '🏁 Finalizado' :
                                                            '📅 Reservado'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                                                📅 {dateDisplay}
                                            </div>
                                            <span className={styles.tutorName} style={{ marginTop: '4px' }}>👤 {appt.pets?.customers?.name || 'Cliente'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                                    {appt.status === 'confirmed' || appt.status === 'pending' ? (
                                        <button
                                            onClick={() => handleStatusChange(appt.id, 'in_progress')}
                                            style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#F97316', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            📥 Check-in
                                        </button>
                                    ) : appt.status === 'in_progress' ? (
                                        <button
                                            onClick={() => handleStatusChange(appt.id, 'done')}
                                            style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', background: '#3B82F6', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            📤 Check-out
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
