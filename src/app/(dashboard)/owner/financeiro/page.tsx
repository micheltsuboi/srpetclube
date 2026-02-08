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


    const fetchFinancials = useCallback(async () => {
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

            // Dates logic
            const now = new Date()
            const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

            // Fetch transactions
            const { data: transactions, error } = await supabase
                .from('financial_transactions')
                .select('*')
                .eq('org_id', profile.org_id)
                .gte('date', startOfPrevMonth)
                .order('date', { ascending: true })

            if (error) throw error

            if (transactions) {
                // Process Monthly Data (original logic, adapted to new fetch)
                const sixMonthsAgo = new Date()
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
                sixMonthsAgo.setDate(1)

                const monthMap = new Map<string, MonthlyData>()

                // Initialize last 6 months
                for (let i = 0; i < 6; i++) {
                    const d = new Date(sixMonthsAgo)
                    d.setMonth(d.getMonth() + i)
                    const monthKey = d.toLocaleString('pt-BR', { month: 'short' })
                    monthMap.set(monthKey, { month: monthKey, revenue: 0, expenses: 0, profit: 0 })
                }

                transactions.forEach(t => {
                    const date = new Date(t.date)
                    const monthKey = date.toLocaleString('pt-BR', { month: 'short' })

                    if (monthMap.has(monthKey)) {
                        const data = monthMap.get(monthKey)!
                        if (t.type === 'income') {
                            data.revenue += t.amount
                        } else {
                            data.expenses += t.amount
                        }
                        data.profit = data.revenue - data.expenses
                    }
                })

                setMonthlyData(Array.from(monthMap.values()))

                // Process Category Data (Current Month)
                const currentMonthFilter = (t: FinancialTransaction) => {
                    const d = new Date(t.date)
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                }

                const currentMonthTx = transactions.filter(currentMonthFilter)
                const totalRevenue = currentMonthTx
                    .filter(t => t.type === 'income')
                    .reduce((acc, curr) => acc + curr.amount, 0)

                const catMap = new Map<string, CategoryRevenue>()

                currentMonthTx.filter(t => t.type === 'income').forEach(t => {
                    const cat = t.category || 'Outros'
                    if (!catMap.has(cat)) {
                        catMap.set(cat, { name: cat, revenue: 0, count: 0, percentage: 0 })
                    }
                    const data = catMap.get(cat)!
                    data.revenue += t.amount
                    data.count += 1
                })

                const categories = Array.from(catMap.values()).map(c => ({
                    ...c,
                    percentage: totalRevenue > 0 ? parseFloat(((c.revenue / totalRevenue) * 100).toFixed(1)) : 0
                }))

                setCategoryRevenue(categories.sort((a, b) => b.revenue - a.revenue))
            }

        } catch (error) {
            console.error('Erro ao buscar financeiro:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchFinancials()
    }, [fetchFinancials])

    const currentMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1] : { revenue: 0, expenses: 0, profit: 0 }
    const previousMonth = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : { revenue: 0, expenses: 0, profit: 0 }

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
                <div className={styles.summaryCard}>
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>💵</span>
                        <span className={`${styles.cardGrowth} ${Number(revenueGrowth) >= 0 ? styles.positive : styles.negative}`}>
                            {Number(revenueGrowth) >= 0 ? '+' : ''}{revenueGrowth}%
                        </span>
                    </div>
                    <span className={styles.cardValue}>{formatCurrency(currentMonth.revenue)}</span>
                    <span className={styles.cardLabel}>Faturamento</span>
                </div>

                <div className={styles.summaryCard}>
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>📉</span>
                    </div>
                    <span className={`${styles.cardValue} ${styles.expenses}`}>{formatCurrency(currentMonth.expenses)}</span>
                    <span className={styles.cardLabel}>Despesas</span>
                </div>

                <div className={styles.summaryCard}>
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>📈</span>
                    </div>
                    <span className={`${styles.cardValue} ${styles.profit}`}>{formatCurrency(currentMonth.profit)}</span>
                    <span className={styles.cardLabel}>Lucro Líquido</span>
                </div>

                <div className={styles.summaryCard}>
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>📊</span>
                    </div>
                    <span className={styles.cardValue}>
                        {currentMonth.revenue > 0 ? ((currentMonth.profit / currentMonth.revenue) * 100).toFixed(1) : '0.0'}%
                    </span>
                    <span className={styles.cardLabel}>Margem de Lucro</span>
                </div>
            </div>

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
