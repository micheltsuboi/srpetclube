'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { FinancialTransaction } from '@/types/database'

interface MonthlyData {
    month: string
    revenue: number
    expenses: number
    profit: number
}

interface CategoryRevenue {
    name: string
    revenue: number
    count: number
    percentage: number
}

export default function FinanceiroPage() {
    const supabase = createClient()
    const [period, setPeriod] = useState<'month' | 'year'>('month')
    const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
    const [categoryRevenue, setCategoryRevenue] = useState<CategoryRevenue[]>([])
    const [loading, setLoading] = useState(true)
    const [startDate, setStartDate] = useState(() => {
        const d = new Date()
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
    })
    const [endDate, setEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0]
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

    const fetchFinancials = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', user.id)
                .single()

            if (!profile?.org_id) return

            // 1. Fetch data for Chart (Last 6 months)
            const sixMonthsAgo = new Date()
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
            sixMonthsAgo.setDate(1)
            const chartStart = sixMonthsAgo.toISOString()

            // 2. Fetch data for Summary and Categories (Selected Period)
            // We fetch a bit more for the previous month to calculate growth
            const prevMonthDate = new Date(startDate)
            prevMonthDate.setMonth(prevMonthDate.getMonth() - 1)
            const fetchStart = prevMonthDate < sixMonthsAgo ? prevMonthDate.toISOString() : chartStart

            const [apptsResponse, txsResponse] = await Promise.all([
                supabase
                    .from('appointments')
                    .select(`
                        id, final_price, calculated_price, payment_status, scheduled_at, paid_at,
                        pets ( name ),
                        services (
                            name,
                            service_categories ( name )
                        )
                    `)
                    .eq('org_id', profile.org_id)
                    .gte('scheduled_at', fetchStart)
                    .order('scheduled_at', { ascending: true }),
                supabase
                    .from('financial_transactions')
                    .select('*')
                    .eq('org_id', profile.org_id)
                    .gte('date', fetchStart)
            ])

            if (apptsResponse.error) throw apptsResponse.error
            if (txsResponse.error) throw txsResponse.error

            const appointments = apptsResponse.data || []
            const transactions = txsResponse.data || []

            // --- Process Monthly Chart Data (Last 6 Months) ---
            const monthMap = new Map<string, MonthlyData>()
            for (let i = 0; i < 6; i++) {
                const d = new Date(sixMonthsAgo)
                d.setMonth(d.getMonth() + i)
                const monthKey = d.toLocaleString('pt-BR', { month: 'short' })
                monthMap.set(monthKey, { month: monthKey, revenue: 0, expenses: 0, profit: 0 })
            }

            // Add Appointments to Chart
            appointments.forEach(appt => {
                const dateAt = appt.payment_status === 'paid' ? appt.paid_at! : appt.scheduled_at
                const date = new Date(dateAt)
                const monthKey = date.toLocaleString('pt-BR', { month: 'short' })
                if (monthMap.has(monthKey) && appt.payment_status === 'paid') {
                    const data = monthMap.get(monthKey)!
                    data.revenue += (appt.final_price ?? appt.calculated_price ?? 0)
                }
            })

            // Add Transactions to Chart
            transactions.forEach(t => {
                const date = new Date(t.date)
                const monthKey = date.toLocaleString('pt-BR', { month: 'short' })
                const data = monthMap.get(monthKey)
                if (data) {
                    if (t.type === 'income') data.revenue += t.amount
                    else data.expenses += t.amount
                    data.profit = data.revenue - data.expenses
                }
            })
            setMonthlyData(Array.from(monthMap.values()))

            // --- Process Summary and Categories (filtered by startDate/endDate) ---
            const filterByPeriod = (dateStr: string) => {
                const d = new Date(dateStr)
                return d >= new Date(startDate) && d <= new Date(endDate + 'T23:59:59')
            }

            const activeAppts = appointments.filter(a => filterByPeriod(a.payment_status === 'paid' ? a.paid_at! : a.scheduled_at))
            const activeTxs = transactions.filter(t => filterByPeriod(t.date))

            const catMap = new Map<string, CategoryRevenue>()
            let totalRev = 0

            // Combine income sources for categories
            activeAppts.forEach(a => {
                if (a.payment_status === 'paid') {
                    const catName = (a.services as any)?.service_categories?.name || 'Serviços'
                    const amount = a.final_price ?? a.calculated_price ?? 0
                    const current = catMap.get(catName) || { name: catName, revenue: 0, count: 0, percentage: 0 }
                    current.revenue += amount
                    current.count += 1
                    catMap.set(catName, current)
                    totalRev += amount
                }
            })

            activeTxs.forEach(t => {
                if (t.type === 'income') {
                    const catName = t.category || 'Outros'
                    const current = catMap.get(catName) || { name: catName, revenue: 0, count: 0, percentage: 0 }
                    current.revenue += t.amount
                    current.count += 1
                    catMap.set(catName, current)
                    totalRev += t.amount
                }
            })

            setCategoryRevenue(
                Array.from(catMap.values())
                    .map(c => ({
                        ...c,
                        percentage: totalRev > 0 ? parseFloat(((c.revenue / totalRev) * 100).toFixed(1)) : 0
                    }))
                    .sort((a, b) => b.revenue - a.revenue)
            )

            setExtractRecords({
                type: null,
                appointments: activeAppts,
                transactions: activeTxs
            })

        } catch (error) {
            console.error('Erro ao buscar financeiro:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase, startDate, endDate])

    useEffect(() => {
        fetchFinancials()
    }, [fetchFinancials])

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
            fetchFinancials() // Direct refresh
        } catch (error) {
            console.error('Erro ao confirmar pagamento:', error)
            alert('Erro ao confirmar pagamento.')
        }
    }

    const [selectedCategory, setSelectedCategory] = useState<string>('all')

    const handleDeleteTransaction = async (txId: string) => {
        if (!confirm('Tem certeza que deseja excluir esta transação?')) return

        try {
            const { error } = await supabase
                .from('financial_transactions')
                .delete()
                .eq('id', txId)

            if (error) throw error

            alert('Transação excluída com sucesso!')
            fetchFinancials()
        } catch (error) {
            console.error('Erro ao excluir transação:', error)
            alert('Erro ao excluir transação.')
        }
    }

    const currentMonthData = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1] : { revenue: 0, expenses: 0, profit: 0 }
    const previousMonthData = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : { revenue: 0, expenses: 0, profit: 0 }

    const activeRevenue = extractRecords.appointments
        .filter(a => a.payment_status === 'paid' && (selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory))
        .reduce((sum, a) => sum + (a.final_price ?? a.calculated_price ?? 0), 0) +
        extractRecords.transactions
            .filter(t => t.type === 'income' && (selectedCategory === 'all' || t.category === selectedCategory))
            .reduce((sum, t) => sum + t.amount, 0)

    const activeExpenses = extractRecords.transactions
        .filter(t => t.type === 'expense' && (selectedCategory === 'all' || t.category === selectedCategory))
        .reduce((sum, t) => sum + t.amount, 0)

    const activeProfit = activeRevenue - activeExpenses

    const pendingTotal = extractRecords.appointments
        .filter(a => a.payment_status !== 'paid' && (selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory))
        .reduce((sum, a) => sum + (a.final_price ?? a.calculated_price ?? 0), 0)

    const revenueGrowth = previousMonthData.revenue > 0
        ? ((currentMonthData.revenue - previousMonthData.revenue) / previousMonthData.revenue * 100).toFixed(1)
        : '0.0'

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const maxRevenue = Math.max(...monthlyData.map(d => d.revenue), 1)

    if (loading) {
        return (
            <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ fontSize: '1.2rem', color: '#666' }}>Carregando dados financeiros...</div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <Link href="/owner" className={styles.backLink}>← Voltar</Link>
                    <h1 className={styles.title}>💰 Controle Financeiro</h1>
                    <p className={styles.subtitle}>Visão geral das finanças do seu pet shop</p>
                </div>
                <div className={styles.filters}>
                    <div className={styles.filterGroup}>
                        <label>De:</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className={styles.dateInput}
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label>Até:</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className={styles.dateInput}
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label>Categoria:</label>
                        <select
                            value={selectedCategory}
                            onChange={e => setSelectedCategory(e.target.value)}
                            className={styles.selectInput}
                        >
                            <option value="all">Todas</option>
                            {categoryRevenue.map(cat => (
                                <option key={cat.name} value={cat.name}>{cat.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className={styles.summaryGrid}>
                <div
                    className={`${styles.summaryCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('revenue')}
                >
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>💵</span>
                        <span className={`${styles.cardGrowth} ${Number(revenueGrowth) >= 0 ? styles.positive : styles.negative}`}>
                            {Number(revenueGrowth) >= 0 ? '+' : ''}{revenueGrowth}%
                        </span>
                    </div>
                    <span className={styles.cardValue}>{formatCurrency(activeRevenue)}</span>
                    <span className={styles.cardLabel}>Faturamento</span>
                </div>

                <div
                    className={`${styles.summaryCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('expenses')}
                >
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>📉</span>
                    </div>
                    <span className={`${styles.cardValue} ${styles.expenses}`}>{formatCurrency(activeExpenses)}</span>
                    <span className={styles.cardLabel}>Despesas</span>
                </div>

                <div
                    className={`${styles.summaryCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('revenue')}
                >
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>📈</span>
                    </div>
                    <span className={`${styles.cardValue} ${styles.profit}`}>{formatCurrency(activeProfit)}</span>
                    <span className={styles.cardLabel}>Lucro Líquido</span>
                </div>

                <div
                    className={`${styles.summaryCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('pending')}
                >
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>⏳</span>
                    </div>
                    <span className={styles.cardValue} style={{ color: '#f39c12' }}>{formatCurrency(pendingTotal)}</span>
                    <span className={styles.cardLabel}>A Receber</span>
                </div>
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
                                .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)
                                .map(appt => (
                                    <div key={appt.id} className={styles.extractItem}>
                                        <div className={styles.extractInfo}>
                                            <strong>{appt.pets?.name || 'Pet'} • {appt.services?.name || 'Serviço'}</strong>
                                            <span>{new Date(appt.payment_status === 'paid' ? appt.paid_at! : appt.scheduled_at).toLocaleDateString('pt-BR')}</span>
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
                                .filter(t => selectedCategory === 'all' || t.category === selectedCategory)
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
                            {((extractRecords.type === 'pending' && extractRecords.appointments.filter(a => a.payment_status !== 'paid' && (selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)).length === 0) ||
                                (extractRecords.type === 'expenses' && extractRecords.transactions.filter(t => t.type === 'expense' && (selectedCategory === 'all' || t.category === selectedCategory)).length === 0) ||
                                (extractRecords.type === 'revenue' &&
                                    extractRecords.appointments.filter(a => a.payment_status === 'paid' && (selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)).length === 0 &&
                                    extractRecords.transactions.filter(t => t.type === 'income' && (selectedCategory === 'all' || t.category === selectedCategory)).length === 0)) && (
                                    <p className={styles.emptyExtract}>Nenhum registro encontrado para este período/categoria.</p>
                                )}
                        </div>
                    </div>
                </div>
            )}

            {/* Revenue Chart */}
            <div className={styles.chartSection}>
                <h2 className={styles.sectionTitle}>📊 Faturamento Mensal (Últimos 6 Meses)</h2>
                {monthlyData.length > 0 ? (
                    <div className={styles.chart}>
                        {/* Background Grid Lines */}
                        <div className={styles.gridLines}>
                            {[0, 1, 2, 3, 4].map((i) => (
                                <div key={i} className={styles.gridLine} />
                            ))}
                        </div>
                        {monthlyData.map((data, index) => (
                            <div key={data.month} className={styles.chartBar}>
                                <div className={styles.barContainer}>
                                    <div
                                        className={styles.bar}
                                        style={{ height: `${(data.revenue / maxRevenue) * 100}%` }}
                                    >
                                        <span className={styles.barValue}>
                                            {data.revenue >= 1000
                                                ? `${(data.revenue / 1000).toFixed(1)}k`
                                                : data.revenue > 0 ? data.revenue.toFixed(0) : '0'}
                                        </span>
                                    </div>
                                </div>
                                <span className={`${styles.barLabel} ${index === monthlyData.length - 1 ? styles.current : ''}`}>
                                    {data.month}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>Sem dados financeiros registrados.</p>
                )}
            </div>

            {/* Revenue by Service */}
            <div className={styles.servicesSection}>
                <h2 className={styles.sectionTitle}>💼 Receita por Categoria</h2>
                <div className={styles.servicesList}>
                    {categoryRevenue.map(cat => (
                        <div key={cat.name} className={styles.serviceItem}>
                            <div className={styles.serviceHeader}>
                                <span className={styles.serviceName}>{cat.name}</span>
                                <span className={styles.serviceRevenue}>{formatCurrency(cat.revenue)}</span>
                            </div>
                            <div className={styles.progressBar}>
                                <div
                                    className={styles.progress}
                                    style={{ width: `${cat.percentage}%` }}
                                />
                            </div>
                            <div className={styles.serviceFooter}>
                                <span className={styles.serviceCount}>{cat.count} vendas</span>
                                <span className={styles.servicePercentage}>{cat.percentage}%</span>
                            </div>
                        </div>
                    ))}
                    {categoryRevenue.length === 0 && (
                        <p style={{ color: '#666', textAlign: 'center', padding: '1rem' }}>Nenhuma venda registrada este mês.</p>
                    )}
                </div>
            </div>

            {/* Quick Stats - Removed fake stats */}
        </div>
    )
}
