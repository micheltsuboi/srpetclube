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
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', user.id)
                .single()

            if (!profile?.org_id) return

            // Dates logic: Last 6 months
            const now = new Date()
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
            const startOfPeriod = sixMonthsAgo.toISOString()

            // Fetch ALL appointments for the period
            const { data: appointments, error } = await supabase
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
                .gte('scheduled_at', startOfPeriod)
                .order('scheduled_at', { ascending: true })

            if (error) throw error

            if (appointments) {
                // Process Monthly Data
                const monthMap = new Map<string, MonthlyData>()

                // Initialize last 6 months
                for (let i = 0; i < 6; i++) {
                    const d = new Date(sixMonthsAgo)
                    d.setMonth(d.getMonth() + i)
                    const monthKey = d.toLocaleString('pt-BR', { month: 'short' })
                    monthMap.set(monthKey, { month: monthKey, revenue: 0, expenses: 0, profit: 0 })
                }

                appointments.forEach(appt => {
                    const date = new Date(appt.payment_status === 'paid' ? appt.paid_at! : appt.scheduled_at)
                    const monthKey = date.toLocaleString('pt-BR', { month: 'short' })
                    const amount = appt.final_price ?? appt.calculated_price ?? 0

                    if (monthMap.has(monthKey) && appt.payment_status === 'paid') {
                        const data = monthMap.get(monthKey)!
                        data.revenue += amount
                        data.profit += amount
                    }
                })

                setMonthlyData(Array.from(monthMap.values()))

                // Process Category Data (Current Month)
                const currentMonthFilter = (appt: any) => {
                    const d = new Date(appt.payment_status === 'paid' ? appt.paid_at! : appt.scheduled_at)
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                }

                const paidCurrentMonthAppts = appointments.filter(a => a.payment_status === 'paid' && currentMonthFilter(a))
                const totalRevenue = paidCurrentMonthAppts.reduce((acc, curr) => acc + (curr.final_price ?? curr.calculated_price ?? 0), 0)

                const catMap = new Map<string, CategoryRevenue>()

                paidCurrentMonthAppts.forEach(appt => {
                    const catName = (appt.services as any)?.service_categories?.name || 'Outros'
                    const amount = appt.final_price ?? appt.calculated_price ?? 0

                    if (!catMap.has(catName)) {
                        catMap.set(catName, { name: catName, revenue: 0, count: 0, percentage: 0 })
                    }
                    const data = catMap.get(catName)!
                    data.revenue += amount
                    data.count += 1
                })

                const categories = Array.from(catMap.values()).map(c => ({
                    ...c,
                    percentage: totalRevenue > 0 ? parseFloat(((c.revenue / totalRevenue) * 100).toFixed(1)) : 0
                }))

                setCategoryRevenue(categories.sort((a, b) => b.revenue - a.revenue))
            }

            // 3. Fetch all financial transactions (income and expenses)
            const { data: transactions } = await supabase
                .from('financial_transactions')
                .select('*')
                .eq('org_id', profile.org_id)
                .gte('date', startOfPeriod)

            if (transactions) {
                setMonthlyData(prev => {
                    const newData = [...prev]
                    transactions.forEach(t => {
                        const date = new Date(t.date)
                        const monthKey = date.toLocaleString('pt-BR', { month: 'short' })
                        const monthData = newData.find(d => d.month === monthKey)
                        if (monthData) {
                            if (t.type === 'income') {
                                monthData.revenue += t.amount
                            } else {
                                monthData.expenses += t.amount
                            }
                            monthData.profit = monthData.revenue - monthData.expenses
                        }
                    })
                    return newData
                })

                // Add to Category Data (Current Month)
                const currentMonthTransactions = transactions.filter(t => {
                    const d = new Date(t.date)
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                })

                if (currentMonthTransactions.length > 0) {
                    setCategoryRevenue(prev => {
                        const newCats = [...prev]
                        currentMonthTransactions.forEach(t => {
                            if (t.type === 'income') {
                                const catName = t.category || 'Outros'
                                let catData = newCats.find(c => c.name === catName)
                                if (!catData) {
                                    catData = { name: catName, revenue: 0, count: 0, percentage: 0 }
                                    newCats.push(catData)
                                }
                                catData.revenue += t.amount
                                catData.count += 1
                            }
                        })

                        const totalRev = newCats.reduce((acc, curr) => acc + curr.revenue, 0)
                        return newCats.map(c => ({
                            ...c,
                            percentage: totalRev > 0 ? parseFloat(((c.revenue / totalRev) * 100).toFixed(1)) : 0
                        })).sort((a, b) => b.revenue - a.revenue)
                    })
                }
            }

            // Store for extract (only current month for dashboard simplicity)
            const currentMonthAppts = (appointments || []).filter(a => {
                const d = new Date(a.payment_status === 'paid' ? a.paid_at! : a.scheduled_at)
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            })
            const currentMonthTxs = (transactions || []).filter(t => {
                const d = new Date(t.date)
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            })

            setExtractRecords({
                type: null,
                appointments: currentMonthAppts,
                transactions: currentMonthTxs
            })

        } catch (error) {
            console.error('Erro ao buscar financeiro:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase])

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

    const currentMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1] : { revenue: 0, expenses: 0, profit: 0 }
    const previousMonth = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : { revenue: 0, expenses: 0, profit: 0 }

    // Add pending calculator for the "A Receber" card logic (which we'll add)
    const pendingTotal = extractRecords.appointments
        .filter(a => a.payment_status !== 'paid')
        .reduce((sum, a) => sum + (a.final_price ?? a.calculated_price ?? 0), 0)

    const revenueGrowth = previousMonth.revenue > 0
        ? ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue * 100).toFixed(1)
        : '0.0'

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const maxRevenue = Math.max(...monthlyData.map(d => d.revenue), 1) // Avoid div by zero

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
                <div className={styles.periodToggle}>
                    <button
                        className={`${styles.periodBtn} ${period === 'month' ? styles.active : ''}`}
                        onClick={() => setPeriod('month')}
                    >
                        Este Mês
                    </button>
                    <button
                        className={`${styles.periodBtn} ${period === 'year' ? styles.active : ''}`}
                        onClick={() => setPeriod('year')}
                    >
                        Este Ano
                    </button>
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
                    <span className={styles.cardValue}>{formatCurrency(currentMonth.revenue)}</span>
                    <span className={styles.cardLabel}>Faturamento</span>
                </div>

                <div
                    className={`${styles.summaryCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('expenses')}
                >
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>📉</span>
                    </div>
                    <span className={`${styles.cardValue} ${styles.expenses}`}>{formatCurrency(currentMonth.expenses)}</span>
                    <span className={styles.cardLabel}>Despesas</span>
                </div>

                <div
                    className={`${styles.summaryCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('revenue')}
                >
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>📈</span>
                    </div>
                    <span className={`${styles.cardValue} ${styles.profit}`}>{formatCurrency(currentMonth.profit)}</span>
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

            {/* Revenue Chart */}
            <div className={styles.chartSection}>
                <h2 className={styles.sectionTitle}>📊 Faturamento Mensal (Últimos 6 Meses)</h2>
                {monthlyData.length > 0 ? (
                    <div className={styles.chart}>
                        {monthlyData.map((data, index) => (
                            <div key={data.month} className={styles.chartBar}>
                                <div className={styles.barContainer}>
                                    <div
                                        className={styles.bar}
                                        style={{ height: `${(data.revenue / maxRevenue) * 100}%` }}
                                    >
                                        <span className={styles.barValue}>{(data.revenue / 1000).toFixed(0)}k</span>
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
