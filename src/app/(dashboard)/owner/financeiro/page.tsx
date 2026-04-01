'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { FinancialTransaction } from '@/types/database'
import { exportToCsv } from '@/utils/export'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { payPetshopSale } from '@/app/actions/petshop'
import { addFinancialTransaction, processRecurringExpenses } from '@/app/actions/finance'

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

    const [extractRecords, setExtractRecords] = useState<{
        type: 'revenue' | 'expenses' | 'pending' | null;
        appointments: any[];
        transactions: any[];
        pendingSales: any[];
    }>({
        type: null,
        appointments: [],
        transactions: [],
        pendingSales: []
    })
    const [isExtractModalOpen, setIsExtractModalOpen] = useState(false)
    const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false)
    const [newExpense, setNewExpense] = useState({
        category: 'Outros',
        name: '',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        payment_method: 'pix',
        type: 'variable' as 'variable' | 'fixed'
    })
    const [isSubmitting, setIsSubmitting] = useState(false)

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

            // 1. Process recurring expenses before fetching
            await processRecurringExpenses()

            // 2. Fetch data for Chart (Last 6 months)
            const sixMonthsAgo = new Date()
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
            sixMonthsAgo.setDate(1)
            const chartStart = sixMonthsAgo.toISOString()

            // 2. Fetch data for Summary and Categories (Selected Period)
            // We fetch a bit more for the previous month to calculate growth
            const prevMonthDate = new Date(startDate)
            prevMonthDate.setMonth(prevMonthDate.getMonth() - 1)
            const fetchStart = prevMonthDate < sixMonthsAgo ? prevMonthDate.toISOString() : chartStart

            const [apptsResponse, txsResponse, pendingSalesResponse] = await Promise.all([
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
                    .gte('date', fetchStart),
                supabase
                    .from('petshop_sales')
                    .select('id, product_name, total_price, payment_status, created_at, pets ( name )')
                    .eq('org_id', profile.org_id)
                    .eq('payment_status', 'pending')
                    .order('created_at', { ascending: true })
            ])

            if (apptsResponse.error) throw apptsResponse.error
            if (txsResponse.error) throw txsResponse.error
            if (pendingSalesResponse.error) throw pendingSalesResponse.error

            const appointments = apptsResponse.data || []
            const transactions = txsResponse.data || []
            const pendingSales = pendingSalesResponse.data || []

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
                transactions: activeTxs,
                pendingSales
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

    const handleConfirmPetshopPayment = async (saleId: string, productName: string, price: number) => {
        if (confirm(`Confirmar pagamento de R$ ${price.toFixed(2).replace('.', ',')} para ${productName}?`)) {
            const paymentMethod = prompt('Qual a forma de pagamento? (pix, cash, credit, debit)', 'pix')
            if (paymentMethod) {
                const res = await payPetshopSale(saleId, paymentMethod)
                if (res.success) {
                    alert(res.message)
                    fetchFinancials()
                } else {
                    alert(res.message)
                }
            }
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

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newExpense.amount || !newExpense.category || !newExpense.name) {
            alert('Por favor, preencha o nome, o valor e a categoria.')
            return
        }

        try {
            setIsSubmitting(true)
            const res = await addFinancialTransaction({
                type: 'expense',
                category: newExpense.category,
                name: newExpense.name,
                amount: parseFloat(newExpense.amount),
                description: newExpense.description,
                date: new Date(newExpense.date).toISOString(),
                payment_method: newExpense.payment_method,
                is_recurring: newExpense.type === 'fixed'
            })

            if (res.success) {
                alert(res.message)
                setIsAddExpenseModalOpen(false)
                setNewExpense({
                    category: 'Outros',
                    name: '',
                    amount: '',
                    description: '',
                    date: new Date().toISOString().split('T')[0],
                    payment_method: 'pix',
                    type: 'variable'
                })
                fetchFinancials()
            } else {
                alert(res.message)
            }
        } catch (error) {
            console.error('Erro ao adicionar despesa:', error)
            alert('Erro ao adicionar despesa.')
        } finally {
            setIsSubmitting(false)
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
        + extractRecords.pendingSales
            .filter(s => selectedCategory === 'all' || selectedCategory === 'Venda Produto')
            .reduce((sum, s) => sum + s.total_price, 0)

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

    const handleExportCSV = () => {
        if (!extractRecords.type) return;

        const headers = extractRecords.type === 'expenses'
            ? ['Categoria', 'Descrição', 'Data', 'Valor']
            : ['Item', 'Data', 'Valor', 'Categoria'];

        const rows: any[][] = [];

        if (extractRecords.type !== 'expenses') {
            extractRecords.appointments
                .filter(a => extractRecords.type === 'revenue' ? a.payment_status === 'paid' : a.payment_status !== 'paid')
                .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)
                .forEach(appt => {
                    const dateVal = appt.payment_status === 'paid' ? appt.paid_at! : appt.scheduled_at;
                    rows.push([
                        `${appt.pets?.name || 'Pet'} • ${appt.services?.name || 'Serviço'}`,
                        new Date(dateVal).toLocaleDateString('pt-BR'),
                        (appt.final_price || appt.calculated_price || 0).toFixed(2).replace('.', ','),
                        (appt.services as any)?.service_categories?.name || 'Serviços'
                    ])
                })
        }

        if (extractRecords.type !== 'pending') {
            extractRecords.transactions
                .filter(t => extractRecords.type === 'revenue' ? t.type === 'income' : t.type === 'expense')
                .filter(t => selectedCategory === 'all' || t.category === selectedCategory)
                .forEach(tx => {
                    if (extractRecords.type === 'expenses') {
                        rows.push([
                            tx.category,
                            tx.description || '',
                            new Date(tx.date).toLocaleDateString('pt-BR'),
                            tx.amount.toFixed(2).replace('.', ',')
                        ])
                    } else {
                        rows.push([
                            tx.description || 'Transação Avulsa',
                            new Date(tx.date).toLocaleDateString('pt-BR'),
                            tx.amount.toFixed(2).replace('.', ','),
                            tx.category
                        ])
                    }
                })
        }

        if (extractRecords.type === 'pending') {
            extractRecords.pendingSales
                .filter(s => selectedCategory === 'all' || selectedCategory === 'Venda Produto')
                .forEach(sale => {
                    const dateVal = sale.created_at;
                    rows.push([
                        `${sale.pets?.name || 'Avulso'} • ${sale.product_name}`,
                        new Date(dateVal).toLocaleDateString('pt-BR'),
                        sale.total_price.toFixed(2).replace('.', ','),
                        'Venda Produto'
                    ])
                })
        }

        exportToCsv(`financeiro_${extractRecords.type}`, headers, rows)
    }

    const handleExportPDF = () => {
        if (!extractRecords.type) return;

        const title =
            extractRecords.type === 'revenue' ? 'Extrato de Faturamento' :
                extractRecords.type === 'expenses' ? 'Extrato de Despesas' : 'Valores a Receber';

        const doc = new jsPDF()
        doc.text(title, 14, 15)

        const headers = extractRecords.type === 'expenses'
            ? [['Categoria', 'Descrição', 'Data', 'Valor']]
            : [['Item', 'Data', 'Valor', 'Categoria']];

        const rows: any[][] = [];

        if (extractRecords.type !== 'expenses') {
            extractRecords.appointments
                .filter(a => extractRecords.type === 'revenue' ? a.payment_status === 'paid' : a.payment_status !== 'paid')
                .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)
                .forEach(appt => {
                    const dateVal = appt.payment_status === 'paid' ? appt.paid_at! : appt.scheduled_at;
                    rows.push([
                        `${appt.pets?.name || 'Pet'} • ${appt.services?.name || 'Serviço'}`,
                        new Date(dateVal).toLocaleDateString('pt-BR'),
                        formatCurrency(appt.final_price || appt.calculated_price || 0),
                        (appt.services as any)?.service_categories?.name || 'Serviços'
                    ])
                })
        }

        if (extractRecords.type !== 'pending') {
            extractRecords.transactions
                .filter(t => extractRecords.type === 'revenue' ? t.type === 'income' : t.type === 'expense')
                .filter(t => selectedCategory === 'all' || t.category === selectedCategory)
                .forEach(tx => {
                    if (extractRecords.type === 'expenses') {
                        rows.push([
                            tx.category,
                            tx.description || '',
                            new Date(tx.date).toLocaleDateString('pt-BR'),
                            formatCurrency(tx.amount)
                        ])
                    } else {
                        rows.push([
                            tx.description || 'Transação Avulsa',
                            new Date(tx.date).toLocaleDateString('pt-BR'),
                            formatCurrency(tx.amount),
                            tx.category
                        ])
                    }
                })
        }

        if (extractRecords.type === 'pending') {
            extractRecords.pendingSales
                .filter(s => selectedCategory === 'all' || selectedCategory === 'Venda Produto')
                .forEach(sale => {
                    const dateVal = sale.created_at;
                    rows.push([
                        `${sale.pets?.name || 'Avulso'} • ${sale.product_name}`,
                        new Date(dateVal).toLocaleDateString('pt-BR'),
                        formatCurrency(sale.total_price),
                        'Venda Produto'
                    ])
                })
        }

        autoTable(doc, {
            head: headers,
            body: rows,
            startY: 20,
            styles: { fontSize: 9 },
            theme: 'striped'
        })

        doc.save(`financeiro_${extractRecords.type}.pdf`)
    }

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
                        <button
                            className={styles.addExpenseBtnMini}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsAddExpenseModalOpen(true);
                            }}
                        >
                            ➕ Nova
                        </button>
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

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', paddingRight: '2rem' }}>
                            <h2 style={{ margin: 0 }}>
                                {extractRecords.type === 'revenue' && '📜 Extrato de Faturamento'}
                                {extractRecords.type === 'expenses' && '📉 Extrato de Despesas'}
                                {extractRecords.type === 'pending' && '⏳ Valores a Receber'}
                            </h2>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={handleExportCSV}
                                    style={{ padding: '0.4rem 0.8rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                >
                                    Exportar CSV
                                </button>
                                <button
                                    onClick={handleExportPDF}
                                    style={{ padding: '0.4rem 0.8rem', background: '#3498db', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
                                >
                                    Exportar PDF
                                </button>
                            </div>
                        </div>

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

                            {/* Pending Pet Shop Sales list */}
                            {extractRecords.type === 'pending' && extractRecords.pendingSales
                                .filter(s => selectedCategory === 'all' || selectedCategory === 'Venda Produto')
                                .map(sale => (
                                    <div key={sale.id} className={styles.extractItem}>
                                        <div className={styles.extractInfo}>
                                            <strong>{sale.pets?.name || 'Cliente Avulso'} • {sale.product_name}</strong>
                                            <span>{new Date(sale.created_at).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <div className={styles.extractActions}>
                                            <span className={styles.extractAmount}>
                                                {formatCurrency(sale.total_price)}
                                            </span>
                                            <button
                                                className={styles.confirmPayBtn}
                                                onClick={() => handleConfirmPetshopPayment(sale.id, sale.product_name, sale.total_price)}
                                            >
                                                Confirmar Pago
                                            </button>
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
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                                                <strong>{tx.name || tx.category}</strong>
                                                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>({tx.category})</span>
                                            </div>
                                            {tx.description && <span>{tx.description}</span>}
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
                            {((extractRecords.type === 'pending' &&
                                extractRecords.appointments.filter(a => a.payment_status !== 'paid' && (selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)).length === 0 &&
                                extractRecords.pendingSales.filter(s => selectedCategory === 'all' || selectedCategory === 'Venda Produto').length === 0) ||
                                (extractRecords.type === 'expenses' && extractRecords.transactions.filter(t => t.type === 'expense' && (selectedCategory === 'all' || t.category === selectedCategory)).length === 0) ||
                                (extractRecords.type === 'revenue' &&
                                    extractRecords.appointments.filter(a => a.payment_status === 'paid' && (selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)).length === 0 &&
                                    extractRecords.transactions.filter(t => t.type === 'income' && (selectedCategory === 'all' || t.category === selectedCategory)).length === 0)) && (
                                    <p className={styles.emptyExtract}>Nenhum registro encontrado para este período/categoria.</p>
                                )}
                        </div>
                    </div>
                </div >
            )
            }

            {/* Add Expense Modal */}
            {isAddExpenseModalOpen && (
                <div className={styles.modalOverlay} onClick={() => setIsAddExpenseModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={() => setIsAddExpenseModalOpen(false)}>×</button>

                        <div className={styles.modalHeader}>
                            <h2>📉 Cadastrar Nova Despesa</h2>
                            <p>Registre gastos variáveis para controle de caixa</p>
                        </div>

                        <form onSubmit={handleAddExpense} className={styles.expenseForm}>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <div className={styles.typeSelector}>
                                    <button
                                        type="button"
                                        className={newExpense.type === 'variable' ? styles.activeType : ''}
                                        onClick={() => setNewExpense({ ...newExpense, type: 'variable' })}
                                    >
                                        Variável
                                    </button>
                                    <button
                                        type="button"
                                        className={newExpense.type === 'fixed' ? styles.activeType : ''}
                                        onClick={() => setNewExpense({ ...newExpense, type: 'fixed' })}
                                    >
                                        Fixa (Recorrente)
                                    </button>
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label>Nome da Despesa</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Compra de Shampoos, Conta de Luz..."
                                    value={newExpense.name}
                                    onChange={e => setNewExpense({ ...newExpense, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>Categoria</label>
                                    <select
                                        value={newExpense.category}
                                        onChange={e => setNewExpense({ ...newExpense, category: e.target.value })}
                                        required
                                    >
                                        <option value="Salário">Salário</option>
                                        <option value="Aluguel">Aluguel</option>
                                        <option value="Energia">Energia</option>
                                        <option value="Água">Água</option>
                                        <option value="Internet">Internet</option>
                                        <option value="Pró-Labore">Pró-Labore</option>
                                        <option value="Marketing">Marketing</option>
                                        <option value="Manutenção">Manutenção</option>
                                        <option value="Limpeza">Limpeza</option>
                                        <option value="Reposição de Estoque">Reposição de Estoque</option>
                                        <option value="Impostos">Impostos</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Valor (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0,00"
                                        value={newExpense.amount}
                                        onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Data</label>
                                    <input
                                        type="date"
                                        value={newExpense.date}
                                        onChange={e => setNewExpense({ ...newExpense, date: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Forma de Pagamento</label>
                                    <select
                                        value={newExpense.payment_method}
                                        onChange={e => setNewExpense({ ...newExpense, payment_method: e.target.value })}
                                    >
                                        <option value="pix">PIX</option>
                                        <option value="cash">Dinheiro</option>
                                        <option value="credit">Cartão de Crédito</option>
                                        <option value="debit">Cartão de Débito</option>
                                    </select>
                                </div>
                            </div>

                            <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
                                <label>Descrição/Observação (Opcional)</label>
                                <textarea
                                    placeholder="Ex: Ref. troca de lâmpada da recepção"
                                    value={newExpense.description}
                                    onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                                />
                            </div>

                            <div className={styles.formActions}>
                                <button
                                    type="button"
                                    className={styles.cancelBtn}
                                    onClick={() => setIsAddExpenseModalOpen(false)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className={styles.submitBtn}
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Salvando...' : 'Salvar Despesa'}
                                </button>
                            </div>
                        </form>
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
        </div >
    )
}
