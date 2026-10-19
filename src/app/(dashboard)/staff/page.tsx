'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import TimeClock from '@/components/modules/TimeClock'
import CreditAlerts from '@/components/modules/CreditAlerts'
import { printThermalTicket } from '@/utils/printThermalTicket'

type ServiceArea = 'all' | 'banho_tosa' | 'creche' | 'hotel'

interface PetToday {
    id: string
    name: string
    breed: string
    area: ServiceArea
    service: string
    status: 'waiting' | 'in_progress' | 'done'
    checkedInAt: string | null
    ownerName: string
    rawAppointment?: any
}

const areaLabels: Record<ServiceArea, string> = {
    all: 'Todas as Áreas',
    banho_tosa: '🛁 Banho + Tosa',
    creche: '🐕 Creche',
    hotel: '🏨 Hotel'
}

const areaIcons: Record<ServiceArea, string> = {
    all: '📊',
    banho_tosa: '🛁',
    creche: '🐕',
    hotel: '🏨'
}

const statusLabels: Record<string, string> = {
    waiting: 'Aguardando',
    in_progress: 'Em Atendimento',
    done: 'Finalizado'
}

export default function StaffDashboard() {
    const supabase = createClient()
    const [selectedArea, setSelectedArea] = useState<ServiceArea>('all')
    const [petsToday, setPetsToday] = useState<PetToday[]>([])
    const [loading, setLoading] = useState(true)
    const [staffPermissions, setStaffPermissions] = useState<string[]>([])
    const [stats, setStats] = useState({
        appointmentsToday: 0,
        pending: 0,
        inProgress: 0,
        done: 0
    })

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('org_id, permissions')
                    .eq('id', user.id)
                    .single()

                if (!profile?.org_id) return

                const userPerms = profile.permissions || []
                setStaffPermissions(userPerms)

                const now = new Date()
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
                const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

                // Fetch Today's Appointments
                const { data: appts, error: apptError } = await supabase
                    .from('appointments')
                    .select(`
                        id, scheduled_at, status, check_in_date, check_out_date, notes, checklist,
                        calculated_price, final_price, payment_status, payment_method, has_taxi, taxi_fee, has_extras, extras_fee, extras,
                        package_credit_id, package_usage_index,
                        pets ( id, name, breed, species, color, size, weight_kg, birth_date, perfume_allowed, accessories_allowed, special_care, medical_notes, allergies, temperament, is_adapted, customers ( id, name, phone_1, phone_2, address, neighborhood, city ) ),
                        services ( id, name, base_price, service_categories ( name, color, icon ) )
                    `)
                    .eq('org_id', profile.org_id)
                    // Match today's single-day spots OR multi-day checking where today is inside the range
                    .or(`and(scheduled_at.gte.${todayStart},scheduled_at.lte.${todayEnd}),and(check_in_date.lte.${todayStart.split('T')[0]},check_out_date.gte.${todayStart.split('T')[0]})`)
                    .neq('status', 'cancelled')
                    .order('scheduled_at', { ascending: true })

                if (apptError) {
                    console.error("Error fetching staff appointments:", apptError)
                }

                if (appts) {
                    const mappedPets: PetToday[] = appts.map(a => {
                        const catName = (a.services as any)?.service_categories?.name || ''
                        let area: ServiceArea = 'all'
                        if (catName.includes('Banho') || catName.includes('Tosa')) area = 'banho_tosa'
                        else if (catName.includes('Creche')) area = 'creche'
                        else if (catName.includes('Hospedagem') || catName.includes('Hotel')) area = 'hotel'

                        return {
                            id: a.id,
                            name: (a.pets as any)?.name || 'Desconhecido',
                            breed: (a.pets as any)?.breed || '',
                            area,
                            service: (a.services as any)?.name || '',
                            status: a.status === 'done' ? 'done' : a.status === 'in_progress' ? 'in_progress' : 'waiting',
                            checkedInAt: new Date(a.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                            ownerName: (a.pets as any)?.customers?.name || 'Cliente',
                            rawAppointment: a
                        }
                    })

                    setPetsToday(mappedPets)

                    setStats({
                        appointmentsToday: mappedPets.length,
                        pending: mappedPets.filter(p => p.status === 'waiting').length,
                        inProgress: mappedPets.filter(p => p.status === 'in_progress').length,
                        done: mappedPets.filter(p => p.status === 'done').length
                    })
                }

            } catch (error) {
                console.error('Erro ao carregar dashboard do staff:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchDashboardData()
    }, [supabase])

    const filteredPets = selectedArea === 'all'
        ? petsToday
        : petsToday.filter(p => p.area === selectedArea)

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
                <p>Carregando dashboard...</p>
            </div>
        )
    }

    // Determine allowed areas based on permissions
    const allowedAreas: ServiceArea[] = ['all']
    if (staffPermissions.includes('banho_tosa')) allowedAreas.push('banho_tosa')
    if (staffPermissions.includes('creche')) allowedAreas.push('creche')
    if (staffPermissions.includes('hospedagem')) allowedAreas.push('hotel')

    return (
        <div className={styles.container}>
            {/* Header / Salutation */}
            <div className={styles.welcomeHeader}>
                <h1 className={styles.title}>👋 Olá, Equipe Sr. Pet</h1>
                <p className={styles.subtitle}>Painel de Atendimento do Dia</p>
            </div>

            {/* Time Clock & Alerts */}
            <div className={styles.staffTools}>
                {staffPermissions.includes('ponto') && <TimeClock />}
                <CreditAlerts />
            </div>

            {/* Operational Stats Cards */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}>📋</div>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>{stats.appointmentsToday}</span>
                        <span className={styles.statLabel}>Total Hoje</span>
                    </div>
                </div>
                <div className={`${styles.statCard} ${styles.pending}`}>
                    <div className={styles.statIcon}>⏳</div>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>{stats.pending}</span>
                        <span className={styles.statLabel}>Aguardando</span>
                    </div>
                </div>
                <div className={`${styles.statCard} ${styles.inProgress}`}>
                    <div className={styles.statIcon}>🛁</div>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>{stats.inProgress}</span>
                        <span className={styles.statLabel}>Em Atendimento</span>
                    </div>
                </div>
                <div className={`${styles.statCard} ${styles.done}`}>
                    <div className={styles.statIcon}>✅</div>
                    <div className={styles.statInfo}>
                        <span className={styles.statValue}>{stats.done}</span>
                        <span className={styles.statLabel}>Finalizados</span>
                    </div>
                </div>
            </div>

            {/* Area Filter Tabs */}
            <div className={styles.areaTabs}>
                {allowedAreas.map(area => (
                    <button
                        key={area}
                        className={`${styles.areaTab} ${selectedArea === area ? styles.active : ''}`}
                        onClick={() => setSelectedArea(area)}
                    >
                        <span>{areaIcons[area]}</span>
                        <span>{area === 'all' ? 'Todas' : areaLabels[area].split(' ').slice(1).join(' ')}</span>
                        <span className={styles.tabCount}>
                            {area === 'all'
                                ? petsToday.filter(p => allowedAreas.includes(p.area)).length
                                : petsToday.filter(p => p.area === area).length}
                        </span>
                    </button>
                ))}
            </div>

            {/* Pets List - Reusing Owner's List Style */}
            <div className={styles.petsSection}>
                <h2 className={styles.sectionTitle}>
                    {areaLabels[selectedArea]} - Pets de Hoje
                </h2>

                <div className={styles.petsList}>
                    {filteredPets
                        .filter(pet => allowedAreas.includes(pet.area))
                        .map(pet => (
                            <div key={pet.id} className={styles.petCard}>
                                <div className={styles.petAvatar}>
                                    <span>{areaIcons[pet.area]}</span>
                                </div>
                                <div className={styles.petInfo}>
                                    <div className={styles.petHeader}>
                                        <span className={styles.petName}>{pet.name}</span>
                                        <span className={`${styles.statusBadge} ${styles[pet.status]}`}>
                                            {statusLabels[pet.status]}
                                        </span>
                                    </div>
                                    <span className={styles.petBreed}>{pet.breed}</span>
                                    <span className={styles.petService}>{pet.service}</span>
                                </div>
                                <div className={styles.petMeta}>
                                    <span className={styles.ownerName}>{pet.ownerName}</span>
                                    {pet.checkedInAt && (
                                        <span className={styles.checkInTime}>Check-in: {pet.checkedInAt}</span>
                                    )}
                                    {pet.rawAppointment && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                printThermalTicket(pet.rawAppointment, supabase)
                                            }}
                                            title="Imprimir Comanda Térmica (58mm)"
                                            style={{
                                                background: 'rgba(37, 99, 235, 0.2)',
                                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                                borderRadius: '4px',
                                                padding: '3px 8px',
                                                color: '#93c5fd',
                                                cursor: 'pointer',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                marginTop: '4px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            🖨️ Ficha
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                </div>

                {filteredPets.length === 0 && (
                    <div className={styles.emptyState}>
                        <span>🐾</span>
                        <p>Nenhum agendamento encontrado para esta área hoje.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
