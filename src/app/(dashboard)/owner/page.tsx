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
    const [petsToday] = useState<PetToday[]>([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        tutors: 0,
        pets: 0,
        appointmentsToday: 0
    })

    // Records for drill-down
    const [extractRecords, setExtractRecords] = useState<{
        type: 'revenue' | 'expenses' | 'pending' | null;
        appointments: any[];
        transactions: any[];
    }>({
        type: null,
        appointments: [],
        transactions: []
    })

    const [isExtractModalOpen, setIsExtractModalOpen] = useState(false)

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

                // 1. Fetch Financial Data from APPOINTMENTS
                const now = new Date()
                const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
                const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
                const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

                // Current month appointments (paid and unpaid)
                const { data: currentMonthAppts } = await supabase
                    .from('appointments')
                    .select(`
                        id, final_price, calculated_price, payment_status, scheduled_at, paid_at,
                        pets ( name ),
                        services ( name )
                    `)
                    .eq('org_id', profile.org_id)
                    .gte('scheduled_at', startOfCurrentMonth)

                // Previous month paid appointments (for growth)
                const { data: prevMonthAppts } = await supabase
                    .from('appointments')
                    .select('final_price, calculated_price, payment_status')
                    .eq('org_id', profile.org_id)
                    .gte('scheduled_at', startOfPreviousMonth)
                    .lte('scheduled_at', endOfPreviousMonth)

                const paidAppts = (currentMonthAppts || []).filter(a => a.payment_status === 'paid')
                const pendingAppts = (currentMonthAppts || []).filter(a => a.payment_status !== 'paid')

                const currentRevenue = paidAppts
                    .reduce((sum, a) => sum + (a.final_price ?? a.calculated_price ?? 0), 0)

                const pendingPayments = pendingAppts
                    .reduce((sum, a) => sum + (a.final_price ?? a.calculated_price ?? 0), 0)

                const prevRevenue = (prevMonthAppts || [])
                    .filter(a => a.payment_status === 'paid')
                    .reduce((sum, a) => sum + (a.final_price ?? a.calculated_price ?? 0), 0)

                const growth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0

                // 3. Fetch all financial transactions (income and expenses) for the month
                const { data: transactions } = await supabase
                    .from('financial_transactions')
                    .select('*')
                    .eq('org_id', profile.org_id)
                    .gte('date', startOfCurrentMonth)

                const incomeTxs = (transactions || []).filter(t => t.type === 'income')
                const expenseTxs = (transactions || []).filter(t => t.type === 'expense')

                const productRevenue = incomeTxs.reduce((sum, t) => sum + t.amount, 0)
                const expenses = expenseTxs.reduce((sum, t) => sum + t.amount, 0)

                const totalRevenue = currentRevenue + productRevenue

                setFinancials({
                    revenue: totalRevenue,
                    expenses,
                    profit: totalRevenue - expenses,
                    pendingPayments,
                    monthlyGrowth: parseFloat(growth.toFixed(1))
                })

                // Store records for extract
                setExtractRecords({
                    type: null, // Keep null until a card is clicked
                    appointments: currentMonthAppts || [],
                    transactions: transactions || []
                })

                // 2. Fetch Operational Stats
                const { count: tutorsCount } = await supabase
                    .from('customers')
                    .select('*', { count: 'exact', head: true })
                    .eq('org_id', profile.org_id)

                const { count: petsCount } = await supabase
                    .from('pets')
                    .select('*', { count: 'exact', head: true })

                // Today's appointments count
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
                const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
                const { count: todayCount } = await supabase
                    .from('appointments')
                    .select('*', { count: 'exact', head: true })
                    .eq('org_id', profile.org_id)
                    .gte('scheduled_at', todayStart)
                    .lte('scheduled_at', todayEnd)

                setStats({
                    tutors: tutorsCount || 0,
                    pets: petsCount || 0,
                    appointmentsToday: todayCount || 0
                })

            } catch (error) {
                console.error('Erro ao carregar dashboard:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchDashboardData()
    }, [supabase])

    const handleOpenExtract = (type: 'revenue' | 'expenses' | 'pending') => {
        setExtractRecords(prev => ({ ...prev, type }))
        setIsExtractModalOpen(true)
    }

    const handleConfirmPayment = async (appointmentId: string) => {
        try {
            const { error } = await supabase
                .from('appointments')
                .update({
                    payment_status: 'paid',
                    paid_at: new Date().toISOString()
                })
                .eq('id', appointmentId)

            if (error) throw error

            alert('Pagamento confirmado com sucesso!')
            // Refresh data
            window.location.reload()
        } catch (error) {
            console.error('Erro ao confirmar pagamento:', error)
            alert('Erro ao confirmar pagamento.')
        }
    }

    const handleDeleteTransaction = async (txId: string) => {
        if (!confirm('Tem certeza que deseja excluir esta transação?')) return

        try {
            const { error } = await supabase
                .from('financial_transactions')
                .delete()
                .eq('id', txId)

            if (error) throw error

            alert('Transação excluída com sucesso!')
            window.location.reload()
        } catch (error) {
            console.error('Erro ao excluir transação:', error)
            alert('Erro ao excluir transação.')
        }
    }

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
                    <Link href="/owner/agenda" className={styles.headerBtn}>
                        🛁 Banho e Tosa
                    </Link>
                    <Link href="/owner/services" className={styles.headerBtn}>
                        ✂️ Serviços
                    </Link>
                    <Link href="/owner/packages" className={styles.headerBtn}>
                        📦 Pacotes
                    </Link>
                    <Link href="/owner/tutors" className={styles.headerBtn}>
                        👤 Tutores
                    </Link>
                    <Link href="/owner/pets" className={styles.headerBtn}>
                        🐾 Pets
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
            <div className={styles.financialGrid}>
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
                <div
                    className={`${styles.financialCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('revenue')}
                >
                    <div className={styles.cardIcon}>💰</div>
                    <div className={styles.cardContent}>
                        <span className={styles.cardValue}>{formatCurrency(financials.revenue)}</span>
                        <span className={styles.cardLabel}>Faturamento do Mês</span>
                    </div>
                    <span className={`${styles.growth} ${financials.monthlyGrowth >= 0 ? styles.positive : styles.negative}`}>
                        {financials.monthlyGrowth >= 0 ? '+' : ''}{financials.monthlyGrowth}%
                    </span>
                </div>
                <div
                    className={`${styles.financialCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('expenses')}
                >
                    <div className={styles.cardIcon}>📉</div>
                    <div className={styles.cardContent}>
                        <span className={styles.cardValue}>{formatCurrency(financials.expenses)}</span>
                        <span className={styles.cardLabel}>Despesas</span>
                    </div>
                </div>
                <div
                    className={`${styles.financialCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('revenue')} // Show revenue for profit too
                >
                    <div className={styles.cardIcon}>📈</div>
                    <div className={styles.cardContent}>
                        <span className={`${styles.cardValue} ${styles.profit}`}>{formatCurrency(financials.profit)}</span>
                        <span className={styles.cardLabel}>Lucro Líquido</span>
                    </div>
                </div>
                <div
                    className={`${styles.financialCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('pending')}
                >
                    <div className={styles.cardIcon}>⏳</div>
                    <div className={styles.cardContent}>
                        <span className={styles.cardValue} style={{ color: '#f59e0b' }}>{formatCurrency(financials.pendingPayments)}</span>
                        <span className={styles.cardLabel}>A Receber</span>
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
            {/* Extract Modal */}
            {isExtractModalOpen && extractRecords.type && (
                <div className={styles.modalOverlay} onClick={() => setIsExtractModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={() => setIsExtractModalOpen(false)}>×</button>

                        <h2>
                            {extractRecords.type === 'revenue' && '📜 Extrato de Faturamento'}
                            {extractRecords.type === 'expenses' && '📉 Extrato de Despesas'}
                            {extractRecords.type === 'pending' && '⏳ Valores a Receber'}
                        </h2>

                        <div className={styles.extractList}>
                            {/* Appointments list (for Revenue and Pending) */}
                            {extractRecords.type !== 'expenses' && extractRecords.appointments
                                .filter(a => extractRecords.type === 'revenue' ? a.payment_status === 'paid' : a.payment_status !== 'paid')
                                .map(appt => (
                                    <div key={appt.id} className={styles.extractItem}>
                                        <div className={styles.extractInfo}>
                                            <strong>{appt.pets?.name || 'Pet'} • {appt.services?.name || 'Serviço'}</strong>
                                            <span>{new Date(appt.scheduled_at).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <div className={styles.extractActions}>
                                            <span className={styles.extractAmount}>
                                                {formatCurrency(appt.final_price || appt.calculated_price || 0)}
                                            </span>
                                            {extractRecords.type === 'pending' && (
                                                <button
                                                    className={styles.confirmPayBtn}
                                                    onClick={() => handleConfirmPayment(appt.id)}
                                                >
                                                    Confirmar Pago
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}

                            {/* Transactions list (for Revenue and Expenses) */}
                            {extractRecords.type !== 'pending' && extractRecords.transactions
                                .filter(t => extractRecords.type === 'revenue' ? t.type === 'income' : t.type === 'expense')
                                .map(tx => (
                                    <div key={tx.id} className={styles.extractItem}>
                                        <div className={styles.extractInfo}>
                                            <strong>{tx.category}</strong>
                                            <span>{tx.description}</span>
                                            <span>{new Date(tx.date).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <div className={styles.extractActions}>
                                            <span className={styles.extractAmount}>
                                                {formatCurrency(tx.amount)}
                                            </span>
                                            <button
                                                className={styles.deleteBtn}
                                                onClick={() => handleDeleteTransaction(tx.id)}
                                            >
                                                Excluir
                                            </button>
                                        </div>
                                    </div>
                                ))}

                            {/* Empty State */}
                            {((extractRecords.type === 'pending' && extractRecords.appointments.filter(a => a.payment_status !== 'paid').length === 0) ||
                                (extractRecords.type === 'expenses' && extractRecords.transactions.filter(t => t.type === 'expense').length === 0) ||
                                (extractRecords.type === 'revenue' &&
                                    extractRecords.appointments.filter(a => a.payment_status === 'paid').length === 0 &&
                                    extractRecords.transactions.filter(t => t.type === 'income').length === 0)) && (
                                    <p className={styles.emptyExtract}>Nenhum registro encontrado para este período.</p>
                                )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
