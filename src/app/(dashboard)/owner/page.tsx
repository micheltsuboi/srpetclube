'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'

type ServiceArea = 'all' | 'banho_tosa' | 'creche' | 'hotel'

interface FinancialMetrics {
    revenue: number
    expenses: number
    profit: number
    pendingPayments: number
    monthlyGrowth: number
}

interface PetToday {
    id: string
    name: string
    breed: string
    area: ServiceArea
    service: string
    status: 'waiting' | 'in_progress' | 'done'
    checkedInAt: string | null
    ownerName: string
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

export default function OwnerDashboard() {
    const supabase = createClient()
    const [selectedArea, setSelectedArea] = useState<ServiceArea>('all')
    const [financials, setFinancials] = useState<FinancialMetrics>({
        revenue: 0,
        expenses: 0,
        profit: 0,
        pendingPayments: 0,
        monthlyGrowth: 0
    })
    // Placeholder states for future Appointments integration
    const [petsToday] = useState<PetToday[]>([])
    const [loading, setLoading] = useState(true)

    const [stats, setStats] = useState({
        tutors: 0,
        pets: 0,
        appointmentsToday: 0
    })

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                // Get user's organization
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('org_id')
                    .eq('id', user.id)
                    .single()

                if (!profile?.org_id) return

                // 1. Fetch Financials
                // Calculate dates
                const now = new Date()
                const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
                const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
                const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString()

                // Fetch transactions for current and previous month
                const { data: transactions, error } = await supabase
                    .from('financial_transactions')
                    .select('*')
                    .eq('org_id', profile.org_id)
                    .gte('date', startOfPreviousMonth)

                if (error) throw error

                if (transactions) {
                    // Current Month Metrics
                    const currentMonthTx = transactions.filter(t => t.date >= startOfCurrentMonth)
                    const revenue = currentMonthTx
                        .filter(t => t.type === 'income')
                        .reduce((acc, curr) => acc + curr.amount, 0)
                    const expenses = currentMonthTx
                        .filter(t => t.type === 'expense')
                        .reduce((acc, curr) => acc + curr.amount, 0)

                    // Previous Month Metrics for Growth
                    const prevMonthTx = transactions.filter(t => t.date >= startOfPreviousMonth && t.date <= endOfPreviousMonth)
                    const prevRevenue = prevMonthTx
                        .filter(t => t.type === 'income')
                        .reduce((acc, curr) => acc + curr.amount, 0)

                    const growth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0

                    setFinancials({
                        revenue,
                        expenses,
                        profit: revenue - expenses,
                        pendingPayments: 0, // Not tracked yet
                        monthlyGrowth: parseFloat(growth.toFixed(1))
                    })
                }

                // 2. Fetch Operational Stats
                const { count: tutorsCount } = await supabase
                    .from('customers')
                    .select('*', { count: 'exact', head: true })
                    .eq('org_id', profile.org_id)

                // RLS filters pets by org via customer relationship
                const { count: petsCount } = await supabase
                    .from('pets')
                    .select('*', { count: 'exact', head: true })

                setStats({
                    tutors: tutorsCount || 0,
                    pets: petsCount || 0,
                    appointmentsToday: 0 // Placeholder until Appointments are implemented
                })

            } catch (error) {
                console.error('Erro ao carregar dashboard:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchDashboardData()
    }, [supabase])

    const filteredPets = selectedArea === 'all'
        ? petsToday
        : petsToday.filter(p => p.area === selectedArea)

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const getAreaStats = () => {
        // Placeholder implementation until we have real appointment data
        return { todayCount: 0, monthCount: 0, revenue: 0 }
    }

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
                <p>Carregando dashboard...</p>
            </div>
        )
    }

    const currentStats = getAreaStats()

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>👋 Olá, Proprietário</h1>
                    <p className={styles.subtitle}>Painel de Gestão do Pet Shop</p>
                </div>
                <div className={styles.headerActions}>
                    <Link href="/owner/tutors" className={styles.headerBtn}>
                        👤 Tutores
                    </Link>
                    <Link href="/owner/usuarios" className={styles.headerBtn}>
                        👥 Usuários
                    </Link>
                    <Link href="/owner/financeiro" className={styles.headerBtn}>
                        💰 Financeiro
                    </Link>
                    <Link href="/owner/petshop" className={styles.headerBtn}>
                        🛍️ Petshop
                    </Link>
                </div>
            </div>

            {/* Operational Stats */}
            <div className={styles.financialGrid} style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className={styles.financialCard}>
                    <div className={styles.cardIcon}>👤</div>
                    <div className={styles.cardContent}>
                        <span className={styles.cardValue}>{stats.tutors}</span>
                        <span className={styles.cardLabel}>Total de Tutores</span>
                    </div>
                </div>
                <div className={styles.financialCard}>
                    <div className={styles.cardIcon}>🐾</div>
                    <div className={styles.cardContent}>
                        <span className={styles.cardValue}>{stats.pets}</span>
                        <span className={styles.cardLabel}>Pets Cadastrados</span>
                    </div>
                </div>
                <div className={styles.financialCard}>
                    <div className={styles.cardIcon}>📅</div>
                    <div className={styles.cardContent}>
                        <span className={styles.cardValue}>{stats.appointmentsToday}</span>
                        <span className={styles.cardLabel}>Agendamentos Hoje</span>
                    </div>
                </div>
            </div>

            {/* Financial Summary */}
            <h2 className={styles.sectionTitle}>💰 Resumo Financeiro</h2>
            <div className={styles.financialGrid}>
                <div className={styles.financialCard}>
                    <div className={styles.cardIcon}>💰</div>
                    <div className={styles.cardContent}>
                        <span className={styles.cardValue}>{formatCurrency(financials.revenue)}</span>
                        <span className={styles.cardLabel}>Faturamento do Mês</span>
                    </div>
                    <span className={`${styles.growth} ${financials.monthlyGrowth >= 0 ? styles.positive : styles.negative}`}>
                        {financials.monthlyGrowth >= 0 ? '+' : ''}{financials.monthlyGrowth}%
                    </span>
                </div>
                <div className={styles.financialCard}>
                    <div className={styles.cardIcon}>📉</div>
                    <div className={styles.cardContent}>
                        <span className={styles.cardValue}>{formatCurrency(financials.expenses)}</span>
                        <span className={styles.cardLabel}>Despesas</span>
                    </div>
                </div>
                <div className={styles.financialCard}>
                    <div className={styles.cardIcon}>📈</div>
                    <div className={styles.cardContent}>
                        <span className={`${styles.cardValue} ${styles.profit}`}>{formatCurrency(financials.profit)}</span>
                        <span className={styles.cardLabel}>Lucro Líquido</span>
                    </div>
                </div>
            </div>

            {/* Area Filter Tabs */}
            <div className={styles.areaTabs}>
                {(['all', 'banho_tosa', 'creche', 'hotel'] as ServiceArea[]).map(area => (
                    <button
                        key={area}
                        className={`${styles.areaTab} ${selectedArea === area ? styles.active : ''}`}
                        onClick={() => setSelectedArea(area)}
                    >
                        <span>{areaIcons[area]}</span>
                        <span>{area === 'all' ? 'Todas' : areaLabels[area].split(' ').slice(1).join(' ')}</span>
                        <span className={styles.tabCount}>
                            {area === 'all'
                                ? petsToday.length
                                : petsToday.filter(p => p.area === area).length}
                        </span>
                    </button>
                ))}
            </div>

            {/* Area Stats */}
            <div className={styles.areaStats}>
                <div className={styles.statItem}>
                    <span className={styles.statValue}>{currentStats.todayCount}</span>
                    <span className={styles.statLabel}>Hoje</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                    <span className={styles.statValue}>{currentStats.monthCount}</span>
                    <span className={styles.statLabel}>Este Mês</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                    <span className={styles.statValue}>{formatCurrency(currentStats.revenue)}</span>
                    <span className={styles.statLabel}>Receita</span>
                </div>
            </div>

            {/* Pets List */}
            <div className={styles.petsSection}>
                <h2 className={styles.sectionTitle}>
                    {areaLabels[selectedArea]} - Pets de Hoje
                </h2>

                <div className={styles.petsList}>
                    {filteredPets.map(pet => (
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
                            </div>
                        </div>
                    ))}
                </div>

                {filteredPets.length === 0 && (
                    <div className={styles.emptyState}>
                        <span>🐾</span>
                        <p>Nenhum pet nesta área hoje (Agendamentos em breve)</p>
                    </div>
                )}
            </div>
        </div>
    )
}
