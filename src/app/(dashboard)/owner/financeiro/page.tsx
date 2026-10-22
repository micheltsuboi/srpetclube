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
import { updatePackagePaymentStatus } from '@/app/actions/package'
import { addFinancialTransaction, processRecurringExpenses, deleteFinancialTransaction } from '@/app/actions/finance'

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

function getCurrentMonthRange() {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() // 0-indexed
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { startDate: startStr, endDate: endStr }
}

const getCleanDate = (dateStr?: string | null): string => {
    if (!dateStr) return ''
    if (dateStr.length >= 10 && dateStr.charAt(4) === '-' && dateStr.charAt(7) === '-') {
        if (dateStr.includes('T')) {
            const d = new Date(dateStr)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${y}-${m}-${day}`
        }
        return dateStr.slice(0, 10)
    }
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export default function FinanceiroPage() {
    const supabase = createClient()
    const [period, setPeriod] = useState<'month' | 'year'>('month')
    const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
    const [categoryRevenue, setCategoryRevenue] = useState<CategoryRevenue[]>([])
    const [loading, setLoading] = useState(true)
    const [startDate, setStartDate] = useState(() => getCurrentMonthRange().startDate)
    const [endDate, setEndDate] = useState(() => getCurrentMonthRange().endDate)

    const [extractRecords, setExtractRecords] = useState<{
        type: 'revenue' | 'expenses' | 'pending' | null;
        appointments: any[];
        transactions: any[];
        pendingSales: any[];
        pendingPackages: any[];
        allPendingAppts: any[];
    }>({
        type: null,
        appointments: [],
        transactions: [],
        pendingSales: [],
        pendingPackages: [],
        allPendingAppts: []
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
    const [extractSearchTerm, setExtractSearchTerm] = useState('')
    const [pendingTab, setPendingTab] = useState<'realized' | 'forecast' | 'all'>('realized')
    const [pendingSortField, setPendingSortField] = useState<'date' | 'name' | 'amount'>('date')
    const [pendingSortDirection, setPendingSortDirection] = useState<'asc' | 'desc'>('asc')
    const [applyPeriodFilterToPending, setApplyPeriodFilterToPending] = useState(true)

    const isPackageAppt = (a: any): boolean => {
        return !!(a.package_credit_id || a.package_slot_id)
    }

    const isBillableAppt = (a: any): boolean => {
        if (['cancelled', 'canceled', 'no_show'].includes(a.status)) return false
        if (!isPackageAppt(a)) return true
        return Number(a.extras_fee || 0) > 0
    }

    const getApptAmount = (a: any): number => {
        if (a.discount_percent === 100) return 0
        if (isPackageAppt(a)) {
            return Number(a.extras_fee || 0)
        }
        return Number(a.final_price ?? a.calculated_price ?? 0)
    }

    const filterByPeriod = useCallback((dateStr?: string | null) => {
        const clean = getCleanDate(dateStr)
        if (!clean) return false
        return clean >= startDate && clean <= endDate
    }, [startDate, endDate])

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

            // 1. Process recurring expenses incrementally (throttled to once per session)
            const lastSync = sessionStorage.getItem('last_recurring_sync')
            const today = new Date().toISOString().split('T')[0]

            if (lastSync !== today) {
                await processRecurringExpenses()
                sessionStorage.setItem('last_recurring_sync', today)
            }

            // 2. Fetch data for Chart (Last 6 months) and Selected Period (Espelhado 100% com /owner)
            const sixMonthsAgo = new Date()
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
            sixMonthsAgo.setDate(1)
            const chartStart = sixMonthsAgo.toISOString().split('T')[0] + 'T00:00:00Z'

            const prevMonthDate = new Date(startDate)
            prevMonthDate.setMonth(prevMonthDate.getMonth() - 1)
            const fetchStart = prevMonthDate < sixMonthsAgo ? prevMonthDate.toISOString() : chartStart

            const [periodApptsResponse, chartApptsResponse, txsResponse, pendingSalesResponse, pendingPackagesResponse, allPendingApptsResponse] = await Promise.all([
                supabase
                    .from('appointments')
                    .select(`
                        id, status, final_price, calculated_price, discount_percent, extras_fee, payment_status, scheduled_at, paid_at, package_credit_id, package_slot_id,
                        pets ( name, customers ( name ) ),
                        services (
                            name,
                            service_categories ( name )
                        )
                    `)
                    .eq('org_id', profile.org_id)
                    .not('status', 'in', '("cancelled","canceled","no_show")')
                    .or(`and(scheduled_at.gte.${startDate}T00:00:00,scheduled_at.lte.${endDate}T23:59:59Z),and(payment_status.eq.paid,paid_at.gte.${startDate}T00:00:00,paid_at.lte.${endDate}T23:59:59Z)`)
                    .order('scheduled_at', { ascending: true })
                    .limit(5000),
                supabase
                    .from('appointments')
                    .select('id, status, final_price, calculated_price, discount_percent, extras_fee, payment_status, scheduled_at, paid_at, package_credit_id, package_slot_id')
                    .eq('org_id', profile.org_id)
                    .eq('payment_status', 'paid')
                    .not('status', 'in', '("cancelled","canceled","no_show")')
                    .or(`scheduled_at.gte.${fetchStart},paid_at.gte.${fetchStart}`)
                    .limit(5000),
                supabase
                    .from('financial_transactions')
                    .select('*')
                    .eq('org_id', profile.org_id)
                    .gte('date', fetchStart)
                    .order('date', { ascending: false })
                    .limit(5000),
                supabase
                    .from('petshop_sales')
                    .select('id, product_name, total_price, payment_status, created_at, pets ( name, customers ( name ) )')
                    .eq('org_id', profile.org_id)
                    .eq('payment_status', 'pending')
                    .order('created_at', { ascending: true }),
                supabase
                    .from('customer_packages')
                    .select('id, total_paid, calculated_price, discount_percent, payment_status, is_active, purchased_at, payment_due_date, period_label, pets ( name, customers ( name ) ), customers ( name ), service_packages ( name ), package_schedule_slots ( slot_date, status )')
                    .eq('org_id', profile.org_id)
                    .eq('payment_status', 'pending')
                    .or('is_active.is.null,is_active.eq.true')
                    .order('purchased_at', { ascending: true }),
                supabase
                    .from('appointments')
                    .select(`
                        id, status, final_price, calculated_price, discount_percent, extras_fee, payment_status, scheduled_at, paid_at, package_credit_id, package_slot_id,
                        pets ( name, customers ( name ) ),
                        services ( name, service_categories ( name ) )
                    `)
                    .eq('org_id', profile.org_id)
                    .neq('payment_status', 'paid')
                    .not('status', 'in', '("cancelled","canceled","no_show")')
                    .order('scheduled_at', { ascending: true })
                    .limit(5000)
            ])

            if (periodApptsResponse.error) throw periodApptsResponse.error
            if (chartApptsResponse.error) throw chartApptsResponse.error
            if (txsResponse.error) throw txsResponse.error
            if (pendingSalesResponse.error) throw pendingSalesResponse.error
            if (pendingPackagesResponse.error) throw pendingPackagesResponse.error

            const periodAppointments = (periodApptsResponse.data || []).filter((a: any) => isBillableAppt(a))
            const chartAppointments = (chartApptsResponse.data || []).filter((a: any) => isBillableAppt(a))
            const transactions = txsResponse.data || []
            const pendingSales = (pendingSalesResponse.data || [])
            const pendingPackages = (pendingPackagesResponse.data || [])
            const allPendingAppts = (allPendingApptsResponse.data || []).filter((a: any) => isBillableAppt(a))


            // --- Process Monthly Chart Data (Last 6 Months) ---
            const monthMap = new Map<string, MonthlyData>()
            for (let i = 0; i < 6; i++) {
                const d = new Date(sixMonthsAgo)
                d.setMonth(d.getMonth() + i)
                const monthKey = d.toLocaleString('pt-BR', { month: 'short' })
                monthMap.set(monthKey, { month: monthKey, revenue: 0, expenses: 0, profit: 0 })
            }

            // Add Paid Appointments to Chart
            chartAppointments.forEach(appt => {
                if (appt.payment_status === 'paid') {
                    const dateAt = appt.paid_at || appt.scheduled_at
                    const date = new Date(dateAt)
                    const monthKey = date.toLocaleString('pt-BR', { month: 'short' })
                    if (monthMap.has(monthKey)) {
                        const data = monthMap.get(monthKey)!
                        data.revenue += getApptAmount(appt)
                        data.profit = data.revenue - data.expenses
                    }
                }
            })

            // Add Transactions to Chart
            transactions.forEach(t => {
                const date = new Date(t.date)
                const monthKey = date.toLocaleString('pt-BR', { month: 'short' })
                const data = monthMap.get(monthKey)
                if (data) {
                    if (t.type === 'income') data.revenue += Number(t.amount || 0)
                    else data.expenses += Number(t.amount || 0)
                    data.profit = data.revenue - data.expenses
                }
            })
            setMonthlyData(Array.from(monthMap.values()))

            // --- Process Summary and Categories (filtered by startDate/endDate) ---
            const activeAppts = periodAppointments.filter(a => filterByPeriod(a.payment_status === 'paid' ? (a.paid_at || a.scheduled_at) : a.scheduled_at))
            const activeTxs = transactions.filter(t => filterByPeriod(t.date))

            const catMap = new Map<string, CategoryRevenue>()
            let totalRev = 0

            // Combine income sources for categories
            activeAppts.forEach(a => {
                if (a.payment_status === 'paid') {
                    const catName = (a.services as any)?.service_categories?.name || 'Serviços'
                    const amount = getApptAmount(a)
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
                    const amount = Number(t.amount || 0)
                    const current = catMap.get(catName) || { name: catName, revenue: 0, count: 0, percentage: 0 }
                    current.revenue += amount
                    current.count += 1
                    catMap.set(catName, current)
                    totalRev += amount
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

            setExtractRecords(prev => ({
                ...prev,
                appointments: activeAppts,
                transactions: activeTxs,
                pendingSales,
                pendingPackages,
                allPendingAppts
            }))

        } catch (error) {
            console.error('Erro ao buscar financeiro:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase, startDate, endDate, filterByPeriod])

    
    useEffect(() => {
        if (isExtractModalOpen || isAddExpenseModalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; }
    }, [isExtractModalOpen, isAddExpenseModalOpen]);

    useEffect(() => {
        fetchFinancials()
    }, [fetchFinancials])

    const handleOpenExtract = (type: 'revenue' | 'expenses' | 'pending') => {
        setExtractRecords(prev => ({ ...prev, type }))
        setIsExtractModalOpen(true)
    }


    const handlePayAllFiltered = async (appts: any[], sales: any[], pkgs: any[], total: number) => {
        if (!confirm(`Deseja quitar todos os ${appts.length + sales.length + pkgs.length} itens filtrados no valor total de ${formatCurrency(total)}?`)) return;

        const paymentMethod = prompt('Qual a forma de pagamento para TODOS os itens? (pix, cash, credit, debit)', 'pix');
        if (!paymentMethod) return;

        setLoading(true);
        try {
            for (const appt of appts) {
                await supabase.from('appointments').update({
                    payment_status: 'paid',
                    paid_at: new Date().toISOString()
                }).eq('id', appt.id);
            }
            for (const sale of sales) {
                await payPetshopSale(sale.id, paymentMethod);
            }
            for (const pkg of pkgs) {
                await updatePackagePaymentStatus(pkg.id, 'paid', paymentMethod);
            }
            alert('Todos os itens filtrados foram pagos com sucesso!');
            fetchFinancials();
        } catch (error) {
            console.error('Erro ao pagar tudo:', error);
            alert('Houve um erro ao tentar quitar os itens.');
        } finally {
            setLoading(false);
        }
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

    const handleConfirmPackagePayment = async (packageId: string, packageName: string, price: number) => {
        if (confirm(`Confirmar pagamento de R$ ${price.toFixed(2).replace('.', ',')} para o pacote ${packageName}?`)) {
            const paymentMethod = prompt('Qual a forma de pagamento? (pix, cash, credit, debit)', 'pix')
            if (paymentMethod) {
                const res = await updatePackagePaymentStatus(packageId, 'paid', paymentMethod)
                if (res.success) {
                    alert(res.message)
                    fetchFinancials()
                } else {
                    alert(res.message)
                }
            }
        }
    }

    const handlePartialPayment = async (type: 'appointment' | 'sale' | 'package', id: string, currentAmount: number, description: string) => {
        const amountStr = prompt(`Valor pendente atual: R$ ${currentAmount.toFixed(2).replace('.', ',')}\n\nQuanto o cliente deseja pagar agora?`);
        if (!amountStr) return;
        const amountPaid = parseFloat(amountStr.replace(',', '.'));
        if (isNaN(amountPaid) || amountPaid <= 0) {
            alert('Valor inválido.');
            return;
        }

        if (amountPaid >= currentAmount) {
            if (type === 'appointment') return handleConfirmPayment(id);
            if (type === 'sale') return handleConfirmPetshopPayment(id, description, currentAmount);
            if (type === 'package') return handleConfirmPackagePayment(id, description, currentAmount);
        }

        const paymentMethod = prompt('Qual a forma de pagamento? (pix, cash, credit, debit)', 'pix');
        if (!paymentMethod) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user?.id).single();
            if (!profile?.org_id) return;

            const res = await supabase.from('financial_transactions').insert({
                org_id: profile.org_id,
                type: 'income',
                category: 'Pagamento Parcial',
                amount: amountPaid,
                description: `Pagamento parcial: ${description}`,
                payment_method: paymentMethod,
                date: new Date().toISOString()
            });

            if (res.error) throw res.error;

            const remaining = currentAmount - amountPaid;

            if (type === 'appointment') {
                await supabase.from('appointments').update({ final_price: remaining }).eq('id', id);
            } else if (type === 'sale') {
                await supabase.from('petshop_sales').update({ total_price: remaining }).eq('id', id);
            } else if (type === 'package') {
                await supabase.from('customer_packages').update({ total_paid: remaining, calculated_price: remaining }).eq('id', id);
            }

            alert('Pagamento parcial registrado. O valor pendente foi atualizado!');
            fetchFinancials();
        } catch (error) {
            console.error('Erro no pagamento parcial:', error);
            alert('Erro ao processar pagamento parcial.');
        }
    }

    const [selectedCategory, setSelectedCategory] = useState<string>('all')

    const handleDeleteTransaction = async (txId: string) => {
        const tx = extractRecords.transactions.find(t => t.id === txId)
        if (!tx) return

        let options = { cancelRecurrence: false, skipMonth: false }

        if (tx.recurring_id) {
            const mode = confirm(
                'Esta é uma despesa FIXA.\n\n' +
                'OK - Apenas excluir este mês (pular)\n' +
                'CANCELAR - Ver mais opções'
            )

            if (mode) {
                options.skipMonth = true
            } else {
                const stopAll = confirm('Deseja INTERROMPER todas as renovações futuras desta despesa?')
                if (stopAll) {
                    options.cancelRecurrence = true
                } else {
                    return // Cancelou tudo
                }
            }
        } else {
            if (!confirm('Tem certeza que deseja excluir esta transação?')) return
        }

        try {
            const res = await deleteFinancialTransaction(txId, options)

            if (res.success) {
                alert(res.message)
                fetchFinancials()
            } else {
                alert(res.message)
            }
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
                date: new Date(newExpense.date + 'T12:00:00').toISOString(),
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
        .reduce((sum, a) => sum + getApptAmount(a), 0) +
        extractRecords.transactions
            .filter(t => t.type === 'income' && (selectedCategory === 'all' || t.category === selectedCategory))
            .reduce((sum, t) => sum + Number(t.amount || 0), 0)

    const activeExpenses = extractRecords.transactions
        .filter(t => t.type === 'expense' && (selectedCategory === 'all' || t.category === selectedCategory))
        .reduce((sum, t) => sum + Number(t.amount || 0), 0)

    const activeProfit = activeRevenue - activeExpenses

    const isApptRealized = (a: any) => {
        if (a.status === 'no_show' || a.status === 'cancelled' || a.status === 'canceled') return false
        if (a.status === 'done' || a.status === 'completed') return true
        if (a.scheduled_at) {
            const sched = new Date(a.scheduled_at)
            const todayEnd = new Date()
            todayEnd.setHours(23, 59, 59, 999)
            return sched <= todayEnd
        }
        return false
    }

    const getPackageEffectiveDate = (pkg: any): string => {
        if (pkg.payment_due_date) return pkg.payment_due_date
        if (pkg.package_schedule_slots && pkg.package_schedule_slots.length > 0) {
            const sortedSlots = [...pkg.package_schedule_slots].sort((a: any, b: any) => (a.slot_date || '').localeCompare(b.slot_date || ''))
            if (sortedSlots[0]?.slot_date) return sortedSlots[0].slot_date
        }
        return pkg.purchased_at ? pkg.purchased_at.split('T')[0] : ''
    }

    const isPackageRealized = (pkg: any): boolean => {
        // Se alguma sessão do pacote já foi realizada, o serviço começou
        if (pkg.package_schedule_slots?.some((s: any) => s.status === 'done')) {
            return true
        }
        const effectiveDateStr = getPackageEffectiveDate(pkg)
        if (!effectiveDateStr) return true
        
        const effectiveDate = new Date(effectiveDateStr + 'T00:00:00')
        const todayEnd = new Date()
        todayEnd.setHours(23, 59, 59, 999)
        return effectiveDate <= todayEnd
    }

    const getPackageAmount = (p: any): number => {
        if (p.discount_percent === 100) return 0
        if (p.total_paid != null && p.total_paid !== '') return Number(p.total_paid)
        return Number(p.calculated_price || 0)
    }

    // Pendências filtradas pelo período selecionado (Mês Atual por padrão)
    const periodRealizedPending = extractRecords.allPendingAppts
        .filter(a => isApptRealized(a))
        .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)
        .filter(a => filterByPeriod(a.scheduled_at))
        .reduce((sum, a) => sum + getApptAmount(a), 0)
        + extractRecords.pendingSales
            .filter(s => selectedCategory === 'all' || selectedCategory === 'Venda Produto')
            .filter(s => filterByPeriod(s.created_at))
            .reduce((sum, s) => sum + Number(s.total_price || 0), 0)
        + extractRecords.pendingPackages
            .filter(p => isPackageRealized(p))
            .filter(p => selectedCategory === 'all' || selectedCategory === 'Pacotes')
            .filter(p => filterByPeriod(getPackageEffectiveDate(p)))
            .reduce((sum, p) => sum + getPackageAmount(p), 0)

    const periodForecastPending = extractRecords.allPendingAppts
        .filter(a => !isApptRealized(a))
        .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)
        .filter(a => filterByPeriod(a.scheduled_at))
        .reduce((sum, a) => sum + getApptAmount(a), 0)
        + extractRecords.pendingPackages
            .filter(p => !isPackageRealized(p))
            .filter(p => selectedCategory === 'all' || selectedCategory === 'Pacotes')
            .filter(p => filterByPeriod(getPackageEffectiveDate(p)))
            .reduce((sum, p) => sum + getPackageAmount(p), 0)

    // Pendências gerais acumuladas (Histórico total)
    const allTimeRealizedPending = extractRecords.allPendingAppts
        .filter(a => isApptRealized(a))
        .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)
        .reduce((sum, a) => sum + getApptAmount(a), 0)
        + extractRecords.pendingSales
            .filter(s => selectedCategory === 'all' || selectedCategory === 'Venda Produto')
            .reduce((sum, s) => sum + Number(s.total_price || 0), 0)
        + extractRecords.pendingPackages
            .filter(p => isPackageRealized(p))
            .filter(p => selectedCategory === 'all' || selectedCategory === 'Pacotes')
            .reduce((sum, p) => sum + getPackageAmount(p), 0)

    const allTimeForecastPending = extractRecords.allPendingAppts
        .filter(a => !isApptRealized(a))
        .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)
        .reduce((sum, a) => sum + getApptAmount(a), 0)
        + extractRecords.pendingPackages
            .filter(p => !isPackageRealized(p))
            .filter(p => selectedCategory === 'all' || selectedCategory === 'Pacotes')
            .reduce((sum, p) => sum + getPackageAmount(p), 0)

    const realizedPendingTotal = applyPeriodFilterToPending ? periodRealizedPending : allTimeRealizedPending
    const forecastPendingTotal = applyPeriodFilterToPending ? periodForecastPending : allTimeForecastPending
    const pendingTotal = realizedPendingTotal + forecastPendingTotal

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

    const getTimeFromDate = (dateStr?: string | null): number => {
        if (!dateStr) return 0
        if (dateStr.includes('T')) return new Date(dateStr).getTime()
        return new Date(`${dateStr}T12:00:00`).getTime()
    }

    const formatDateBR = (dateStr?: string | null): string => {
        if (!dateStr) return '-'
        if (dateStr.includes('T')) return new Date(dateStr).toLocaleDateString('pt-BR')
        return new Date(`${dateStr}T12:00:00`).toLocaleDateString('pt-BR')
    }

    const getUnifiedExtractItems = () => {
        if (!extractRecords.type) return []

        const search = (extractSearchTerm || '').toLowerCase()
        const rawItems: {
            id: string;
            title: string;
            description?: string;
            category: string;
            rawDate: string;
            amount: number;
        }[] = []

        if (extractRecords.type === 'expenses') {
            extractRecords.transactions
                .filter(t => t.type === 'expense')
                .filter(t => selectedCategory === 'all' || t.category === selectedCategory)
                .filter(t => {
                    if (!search) return true
                    return (t.name || '').toLowerCase().includes(search) ||
                           (t.category || '').toLowerCase().includes(search) ||
                           (t.description || '').toLowerCase().includes(search)
                })
                .forEach(tx => {
                    rawItems.push({
                        id: tx.id,
                        title: tx.category || 'Despesa',
                        description: tx.description || tx.name || '',
                        category: tx.category || 'Outros',
                        rawDate: tx.date,
                        amount: Number(tx.amount || 0)
                    })
                })
        } else if (extractRecords.type === 'revenue') {
            // 1. Agendamentos Pagos
            extractRecords.appointments
                .filter(a => a.payment_status === 'paid')
                .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)
                .filter(a => {
                    if (!search) return true
                    return (a.pets?.name || '').toLowerCase().includes(search) ||
                           (a.services?.name || '').toLowerCase().includes(search) ||
                           (a.pets?.customers?.name || '').toLowerCase().includes(search)
                })
                .forEach(appt => {
                    const dateVal = appt.paid_at || appt.scheduled_at
                    rawItems.push({
                        id: appt.id,
                        title: `${appt.pets?.name || 'Pet'} • ${appt.services?.name || 'Serviço'}${isPackageAppt(appt) ? ' (Adicional de Pacote)' : ''}`,
                        description: (appt.pets as any)?.customers?.name ? `Tutor: ${(appt.pets as any).customers.name}` : '',
                        category: (appt.services as any)?.service_categories?.name || 'Serviços',
                        rawDate: dateVal,
                        amount: getApptAmount(appt)
                    })
                })

            // 2. Transações de Receita (Pacotes, Vendas, Parciais)
            extractRecords.transactions
                .filter(t => t.type === 'income')
                .filter(t => selectedCategory === 'all' || t.category === selectedCategory)
                .filter(t => {
                    if (!search) return true
                    return (t.name || '').toLowerCase().includes(search) ||
                           (t.category || '').toLowerCase().includes(search) ||
                           (t.description || '').toLowerCase().includes(search)
                })
                .forEach(tx => {
                    rawItems.push({
                        id: tx.id,
                        title: tx.name ? `${tx.name}${tx.description ? ` - ${tx.description}` : ''}` : (tx.description || tx.category || 'Transação Avulsa'),
                        description: tx.description || '',
                        category: tx.category || 'Outros',
                        rawDate: tx.date,
                        amount: Number(tx.amount || 0)
                    })
                })
        } else if (extractRecords.type === 'pending') {
            // 1. Agendamentos Pendentes
            extractRecords.allPendingAppts
                .filter(a => a.payment_status !== 'paid')
                .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)
                .filter(a => {
                    if (!search) return true
                    return (a.pets?.name || '').toLowerCase().includes(search) ||
                           (a.services?.name || '').toLowerCase().includes(search) ||
                           (a.pets?.customers?.name || '').toLowerCase().includes(search)
                })
                .forEach(appt => {
                    rawItems.push({
                        id: appt.id,
                        title: `${appt.pets?.name || 'Pet'} • ${appt.services?.name || 'Serviço'}${isPackageAppt(appt) ? ' (Adicional de Pacote)' : ''}`,
                        description: (appt.pets as any)?.customers?.name ? `Tutor: ${(appt.pets as any).customers.name}` : '',
                        category: (appt.services as any)?.service_categories?.name || 'Serviços',
                        rawDate: appt.scheduled_at,
                        amount: getApptAmount(appt)
                    })
                })

            // 2. Vendas Pendentes
            extractRecords.pendingSales
                .filter(s => selectedCategory === 'all' || selectedCategory === 'Venda Produto')
                .filter(s => {
                    if (!search) return true
                    return (s.product_name || s.description || '').toLowerCase().includes(search) ||
                           (s.pets?.name || '').toLowerCase().includes(search) ||
                           (s.pets?.customers?.name || '').toLowerCase().includes(search)
                })
                .forEach(sale => {
                    rawItems.push({
                        id: sale.id,
                        title: `${sale.pets?.name || 'Avulso'} • ${sale.product_name}`,
                        description: sale.pets?.customers?.name ? `Tutor: ${sale.pets.customers.name}` : '',
                        category: 'Venda Produto',
                        rawDate: sale.created_at,
                        amount: Number(sale.total_price || 0)
                    })
                })

            // 3. Pacotes Pendentes
            extractRecords.pendingPackages
                .filter(p => selectedCategory === 'all' || selectedCategory === 'Pacotes')
                .filter(p => {
                    if (!search) return true
                    return (p.service_packages?.name || '').toLowerCase().includes(search) ||
                           (p.pets?.name || '').toLowerCase().includes(search) ||
                           (p.pets?.customers?.name || '').toLowerCase().includes(search) ||
                           (p.customers?.name || '').toLowerCase().includes(search)
                })
                .forEach(pkg => {
                    const effectiveDate = getPackageEffectiveDate(pkg) || pkg.purchased_at
                    const petName = pkg.pets?.name || 'Pet'
                    const tutorName = pkg.pets?.customers?.name || pkg.customers?.name || 'Sem tutor'
                    const pkgName = pkg.service_packages?.name || 'Pacote'
                    rawItems.push({
                        id: pkg.id,
                        title: `${petName} (${tutorName}) • Pacote: ${pkgName}`,
                        description: `Vencimento: ${formatDateBR(effectiveDate)}`,
                        category: 'Pacotes',
                        rawDate: effectiveDate,
                        amount: getPackageAmount(pkg)
                    })
                })
        }

        // Ordenação rigorosamente CRESCENTE por data (do mais antigo para o mais recente)
        return rawItems.sort((a, b) => {
            const timeDiff = getTimeFromDate(a.rawDate) - getTimeFromDate(b.rawDate)
            if (timeDiff !== 0) return timeDiff
            return a.title.localeCompare(b.title)
        })
    }

    const handleExportCSV = () => {
        if (!extractRecords.type) return;

        const headers = extractRecords.type === 'expenses'
            ? ['Categoria', 'Descrição', 'Data', 'Valor (R$)']
            : ['Item', 'Data', 'Valor (R$)', 'Categoria'];

        const items = getUnifiedExtractItems()
        const rows = items.map(item => {
            const dateStr = formatDateBR(item.rawDate)
            if (extractRecords.type === 'expenses') {
                return [
                    item.category,
                    item.description || item.title || '',
                    dateStr,
                    item.amount.toFixed(2).replace('.', ',')
                ]
            }
            return [
                item.title,
                dateStr,
                item.amount.toFixed(2).replace('.', ','),
                item.category
            ]
        })

        exportToCsv(`financeiro_${extractRecords.type}`, headers, rows)
    }

    const handleExportPDF = () => {
        if (!extractRecords.type) return;

        const title =
            extractRecords.type === 'revenue' ? 'Extrato de Faturamento' :
                extractRecords.type === 'expenses' ? 'Extrato de Despesas' : 'Valores a Receber';

        const doc = new jsPDF()

        // Cabeçalho institucional azul marinho
        doc.setFillColor(43, 75, 111) // #2B4B6F
        doc.rect(0, 0, 210, 22, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(14)
        doc.setTextColor(255, 255, 255)
        doc.text('SR PET CLUBE', 14, 11)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(230, 235, 245)
        doc.text(title.toUpperCase(), 14, 18)

        const emissionDate = new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        doc.setFontSize(8)
        doc.text(`Emissão: ${emissionDate}`, 196, 14, { align: 'right' })

        const items = getUnifiedExtractItems()
        const totalVal = items.reduce((sum, item) => sum + item.amount, 0)

        // Linha de contexto do filtro (período, categoria, total e indicação de ordem crescente)
        doc.setFontSize(8.5)
        doc.setTextColor(60, 60, 60)
        const periodText = `Período: ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`
        const catText = selectedCategory !== 'all' ? ` | Categoria: ${selectedCategory}` : ''
        doc.text(`${periodText}${catText} | Total: ${formatCurrency(totalVal)} (${items.length} itens — Ordem Crescente de Data)`, 14, 29)

        const headers = extractRecords.type === 'expenses'
            ? [['Categoria', 'Descrição', 'Data', 'Valor']]
            : [['Item', 'Data', 'Valor', 'Categoria']];

        const rows = items.map(item => {
            const dateStr = formatDateBR(item.rawDate)
            if (extractRecords.type === 'expenses') {
                return [
                    item.category,
                    item.description || item.title || '',
                    dateStr,
                    formatCurrency(item.amount)
                ]
            }
            return [
                item.title,
                dateStr,
                formatCurrency(item.amount),
                item.category
            ]
        })

        if (rows.length === 0) {
            rows.push(['Nenhum registro encontrado no período', '-', '-', '-'])
        }

        autoTable(doc, {
            head: headers,
            body: rows,
            startY: 33,
            theme: 'striped',
            headStyles: {
                fillColor: [43, 75, 111],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9
            },
            bodyStyles: {
                fontSize: 8.5,
                textColor: [40, 40, 40]
            },
            alternateRowStyles: {
                fillColor: [250, 252, 255]
            },
            columnStyles: extractRecords.type === 'expenses'
                ? {
                    0: { cellWidth: 38 },
                    1: { cellWidth: 84 },
                    2: { cellWidth: 28, halign: 'center' },
                    3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
                }
                : {
                    0: { cellWidth: 88 },
                    1: { cellWidth: 28, halign: 'center' },
                    2: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
                    3: { cellWidth: 34 }
                },
            didDrawPage: (data) => {
                const pageCount = (doc as any).internal.getNumberOfPages()
                doc.setFontSize(8)
                doc.setTextColor(140)
                doc.text(`Sr Pet Clube — ${title} • Página ${data.pageNumber} de ${pageCount}`, 14, 288)
            }
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
                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => {
                            const range = getCurrentMonthRange()
                            setStartDate(range.startDate)
                            setEndDate(range.endDate)
                        }}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                        }}
                    >
                        📅 Mês Atual (Completo)
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const range = getCurrentMonthRange()
                            const now = new Date()
                            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
                            setStartDate(range.startDate)
                            setEndDate(todayStr)
                        }}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                        }}
                    >
                        ⏱️ Mês Atual (Até Hoje)
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const now = new Date()
                            const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
                            const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
                            const startStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
                            const lastDay = new Date(prevYear, prevMonth, 0).getDate()
                            const endStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
                            setStartDate(startStr)
                            setEndDate(endStr)
                        }}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                        }}
                    >
                        ⏪ Mês Anterior
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
                    <span className={styles.cardValue}>{formatCurrency(activeRevenue)}</span>
                    <span className={styles.cardLabel}>
                        {startDate === getCurrentMonthRange().startDate && endDate === getCurrentMonthRange().endDate ? 'Faturamento (Mês Atual)' : 'Faturamento (Período)'}
                    </span>
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
                    <span className={`${styles.cardValue} ${styles.profit} ${activeProfit < 0 ? styles.negative : ''}`}>{formatCurrency(activeProfit)}</span>
                    <span className={styles.cardLabel}>Lucro Líquido</span>
                </div>

                <div
                    className={`${styles.summaryCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('pending')}
                >
                    <div className={styles.cardHeader}>
                        <span className={styles.cardIcon}>⏳</span>
                    </div>
                    <span className={styles.cardValue} style={{ color: '#f39c12' }}>{formatCurrency(periodRealizedPending)}</span>
                    <span className={styles.cardLabel}>
                        {startDate === getCurrentMonthRange().startDate && endDate === getCurrentMonthRange().endDate ? 'A Receber (Mês Atual)' : 'A Receber (Período)'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: '0.35rem', display: 'block' }}>
                        + {formatCurrency(periodForecastPending)} previstos no mês
                    </span>
                    {allTimeRealizedPending > periodRealizedPending && (
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem', display: 'block' }}>
                            (Total histórico acumulado: {formatCurrency(allTimeRealizedPending)})
                        </span>
                    )}
                </div>
            </div>

            {/* Extract Modal */}
            {isExtractModalOpen && extractRecords.type && (
                <div className={styles.modalOverlay} onClick={() => setIsExtractModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={() => setIsExtractModalOpen(false)}>×</button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', paddingRight: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
                            <h2 style={{ margin: 0 }}>
                                {extractRecords.type === 'revenue' && '📜 Extrato de Faturamento'}
                                {extractRecords.type === 'expenses' && '📉 Extrato de Despesas'}
                                {extractRecords.type === 'pending' && '⏳ Contas a Receber & Previsões'}
                            </h2>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1, minWidth: '300px' }}>
                                <input
                                    type="text"
                                    placeholder="🔍 Pesquisar por nome..."
                                    value={extractSearchTerm}
                                    onChange={(e) => setExtractSearchTerm(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: '0.4rem 0.8rem',
                                        background: 'rgba(0,0,0,0.2)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '6px',
                                        color: 'white',
                                        fontSize: '0.9rem'
                                    }}
                                />
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
                        </div>

                        {extractRecords.type === 'pending' && (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                marginBottom: '1.25rem',
                                background: 'rgba(255,255,255,0.03)',
                                padding: '0.85rem 1rem',
                                borderRadius: '10px',
                                border: '1px solid rgba(255,255,255,0.08)'
                            }}>
                                {/* Abas de Visualização */}
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => setPendingTab('realized')}
                                        style={{
                                            padding: '0.45rem 0.9rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            background: pendingTab === 'realized' ? '#e67e22' : 'rgba(255,255,255,0.08)',
                                            color: 'white',
                                            boxShadow: pendingTab === 'realized' ? '0 2px 8px rgba(230, 126, 34, 0.4)' : 'none',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        🚨 Pendências Reais ({formatCurrency(realizedPendingTotal)})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPendingTab('forecast')}
                                        style={{
                                            padding: '0.45rem 0.9rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            background: pendingTab === 'forecast' ? '#3498db' : 'rgba(255,255,255,0.08)',
                                            color: 'white',
                                            boxShadow: pendingTab === 'forecast' ? '0 2px 8px rgba(52, 152, 219, 0.4)' : 'none',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        📅 Previsão de Recebimentos ({formatCurrency(forecastPendingTotal)})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPendingTab('all')}
                                        style={{
                                            padding: '0.45rem 0.9rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            background: pendingTab === 'all' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                                            color: 'white',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        📑 Todos ({formatCurrency(pendingTotal)})
                                    </button>
                                </div>

                                {/* Ordenação e Filtro de Período */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.85rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.7)' }}>Ordenar por:</span>
                                        <select
                                            value={pendingSortField}
                                            onChange={(e) => setPendingSortField(e.target.value as any)}
                                            style={{
                                                background: 'rgba(0,0,0,0.4)',
                                                border: '1px solid rgba(255,255,255,0.15)',
                                                color: 'white',
                                                padding: '0.35rem 0.6rem',
                                                borderRadius: '6px',
                                                fontSize: '0.85rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="date">📅 Data</option>
                                            <option value="name">🔤 Nome do Pet</option>
                                            <option value="amount">💰 Valor</option>
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => setPendingSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                            style={{
                                                background: 'rgba(255,255,255,0.1)',
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                color: 'white',
                                                padding: '0.35rem 0.7rem',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.3rem'
                                            }}
                                            title="Alternar entre ordem crescente e decrescente"
                                        >
                                            {pendingSortDirection === 'asc' ? '⬆️ Ordem Crescente' : '⬇️ Ordem Decrescente'}
                                        </button>
                                    </div>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: 'rgba(255,255,255,0.85)', userSelect: 'none' }}>
                                        <input
                                            type="checkbox"
                                            checked={applyPeriodFilterToPending}
                                            onChange={(e) => setApplyPeriodFilterToPending(e.target.checked)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <span>Filtrar pelo período selecionado</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className={styles.extractList}>
{(() => {
    // 1. Filtragem de Agendamentos
    let apptsSource = extractRecords.type === 'revenue' 
        ? extractRecords.appointments.filter(a => a.payment_status === 'paid')
        : (extractRecords.type === 'pending' ? extractRecords.allPendingAppts : [])

    if (extractRecords.type === 'pending') {
        if (pendingTab === 'realized') {
            apptsSource = apptsSource.filter(a => isApptRealized(a))
        } else if (pendingTab === 'forecast') {
            apptsSource = apptsSource.filter(a => !isApptRealized(a))
        }

        if (applyPeriodFilterToPending) {
            apptsSource = apptsSource.filter(a => filterByPeriod(a.scheduled_at))
        }
    }

    const filteredAppts = apptsSource
        .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)
        .filter(a => {
            if (!extractSearchTerm) return true
            const search = extractSearchTerm.toLowerCase()
            return a.pets?.name?.toLowerCase().includes(search) || 
                   a.services?.name?.toLowerCase().includes(search) ||
                   a.pets?.customers?.name?.toLowerCase().includes(search)
        })

    // 2. Filtragem de Vendas (Petshop)
    let salesSource = extractRecords.type === 'pending' && pendingTab !== 'forecast' 
        ? extractRecords.pendingSales 
        : []

    if (extractRecords.type === 'pending' && applyPeriodFilterToPending) {
        salesSource = salesSource.filter(s => filterByPeriod(s.created_at))
    }

    const filteredSales = salesSource
        .filter(s => selectedCategory === 'all' || selectedCategory === 'Venda Produto')
        .filter(s => {
            if (!extractSearchTerm) return true
            const search = extractSearchTerm.toLowerCase()
            return s.pets?.name?.toLowerCase().includes(search) || 
                   s.product_name?.toLowerCase().includes(search) ||
                   s.pets?.customers?.name?.toLowerCase().includes(search)
        })

    // 3. Filtragem de Pacotes
    let pkgsSource = extractRecords.type === 'pending'
        ? extractRecords.pendingPackages
        : []

    if (extractRecords.type === 'pending') {
        if (pendingTab === 'realized') {
            pkgsSource = pkgsSource.filter(p => isPackageRealized(p))
        } else if (pendingTab === 'forecast') {
            pkgsSource = pkgsSource.filter(p => !isPackageRealized(p))
        }

        if (applyPeriodFilterToPending) {
            pkgsSource = pkgsSource.filter(p => filterByPeriod(getPackageEffectiveDate(p)))
        }
    }

    const filteredPkgs = pkgsSource
        .filter(p => selectedCategory === 'all' || selectedCategory === 'Pacotes')
        .filter(p => {
            if (!extractSearchTerm) return true
            const search = extractSearchTerm.toLowerCase()
            return p.pets?.name?.toLowerCase().includes(search) || 
                   p.service_packages?.name?.toLowerCase().includes(search) ||
                   p.pets?.customers?.name?.toLowerCase().includes(search) ||
                   p.customers?.name?.toLowerCase().includes(search)
        })

    // 4. Filtragem de Transações de Receitas/Despesas
    const filteredTxs = extractRecords.type !== 'pending' ? extractRecords.transactions
        .filter(t => extractRecords.type === 'revenue' ? t.type === 'income' : t.type === 'expense')
        .filter(t => selectedCategory === 'all' || t.category === selectedCategory)
        .filter(t => {
            if (!extractSearchTerm) return true
            const search = extractSearchTerm.toLowerCase()
            return t.name?.toLowerCase().includes(search) || 
                   t.category?.toLowerCase().includes(search) ||
                   (t.description || '').toLowerCase().includes(search)
        }) : []

    // 5. Unificação e ordenação para Pendências
    const pendingItems = extractRecords.type === 'pending' ? [
        ...filteredAppts.map(appt => ({
            id: appt.id,
            type: 'appointment' as const,
            petName: appt.pets?.name || 'Pet',
            customerName: appt.pets?.customers?.name || 'Sem tutor',
            title: `${appt.pets?.name || 'Pet'} (${appt.pets?.customers?.name || 'Sem tutor'}) • ${appt.services?.name || 'Serviço'}${appt.package_credit_id ? ' (Adicional de Pacote)' : ''}`,
            date: appt.scheduled_at,
            amount: getApptAmount(appt),
            isRealized: isApptRealized(appt),
            raw: appt
        })),
        ...filteredSales.map(sale => ({
            id: sale.id,
            type: 'sale' as const,
            petName: sale.pets?.name || 'Avulso',
            customerName: sale.pets?.customers?.name || 'Sem tutor',
            title: `${sale.pets?.name || 'Avulso'} (${sale.pets?.customers?.name || 'Sem tutor'}) • ${sale.product_name}`,
            date: sale.created_at,
            amount: Number(sale.total_price || 0),
            isRealized: true,
            raw: sale
        })),
        ...filteredPkgs.map(pkg => {
            const petName = pkg.pets?.name || 'Pet'
            const tutorName = pkg.pets?.customers?.name || pkg.customers?.name || 'Sem tutor'
            const effectiveDate = getPackageEffectiveDate(pkg)
            const isRealized = isPackageRealized(pkg)
            return {
                id: pkg.id,
                type: 'package' as const,
                petName,
                customerName: tutorName,
                title: `${petName} (${tutorName}) • Pacote: ${pkg.service_packages?.name || 'Serviço'}`,
                date: effectiveDate || pkg.purchased_at,
                amount: getPackageAmount(pkg),
                isRealized,
                raw: pkg
            }
        })
    ].sort((a, b) => {
        if (pendingSortField === 'date') {
            const timeA = new Date(a.date).getTime()
            const timeB = new Date(b.date).getTime()
            return pendingSortDirection === 'asc' ? timeA - timeB : timeB - timeA
        }
        if (pendingSortField === 'amount') {
            return pendingSortDirection === 'asc' ? a.amount - b.amount : b.amount - a.amount
        }
        // nome
        const comp = a.petName.localeCompare(b.petName)
        return pendingSortDirection === 'asc' ? comp : -comp
    }) : []

    const totalFiltered = extractRecords.type === 'pending'
        ? pendingItems.reduce((acc, item) => acc + item.amount, 0)
        : filteredAppts.reduce((acc, a) => acc + getApptAmount(a), 0) +
          filteredTxs.reduce((acc, t) => acc + Number(t.amount || 0), 0)

    const isEmpty = extractRecords.type === 'pending'
        ? pendingItems.length === 0
        : (filteredAppts.length === 0 && filteredTxs.length === 0)

    return (
        <>
            {!isEmpty && (
                <div style={{ padding: '0.8rem 1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>{extractRecords.type === 'pending' ? 'Total em Exibição:' : 'Total Filtrado:'}</strong>
                        <span style={{ fontSize: '1.15rem', fontWeight: 'bold', color: extractRecords.type === 'expenses' ? '#ef4444' : '#10b981' }}>
                            {formatCurrency(totalFiltered)}
                        </span>
                        {extractRecords.type === 'pending' && (
                            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                                ({pendingItems.length} {pendingItems.length === 1 ? 'item' : 'itens'})
                            </span>
                        )}
                    </div>
                    
                    {extractRecords.type === 'pending' && pendingItems.length > 0 && (
                        <button
                            className={styles.confirmPayBtn}
                            style={{ backgroundColor: '#10b981', padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                            onClick={() => handlePayAllFiltered(filteredAppts, filteredSales, filteredPkgs, totalFiltered)}
                        >
                            Pagar Tudo Exibido ({formatCurrency(totalFiltered)})
                        </button>
                    )}
                </div>
            )}

            {/* Renderização de itens pendentes unificados e ordenados */}
            {extractRecords.type === 'pending' && pendingItems.map(item => (
                <div key={`${item.type}-${item.id}`} className={styles.extractItem}>
                    <div className={styles.extractInfo}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <strong>{item.title}</strong>
                            {(item.type === 'appointment' || item.type === 'package') && (
                                item.isRealized ? (
                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(230, 126, 34, 0.2)', color: '#e67e22', border: '1px solid rgba(230, 126, 34, 0.4)', fontWeight: 600 }}>
                                        ⚠️ Realizado
                                    </span>
                                ) : (
                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(52, 152, 219, 0.2)', color: '#3498db', border: '1px solid rgba(52, 152, 219, 0.4)', fontWeight: 600 }}>
                                        📅 Previsto
                                    </span>
                                )
                            )}
                            {item.type === 'sale' && (
                                <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)', fontWeight: 600 }}>
                                    🛍️ Venda Petshop
                                </span>
                            )}
                            {item.type === 'package' && (
                                <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(155, 89, 182, 0.2)', color: '#9b59b6', border: '1px solid rgba(155, 89, 182, 0.4)', fontWeight: 600 }}>
                                    📦 Pacote
                                </span>
                            )}
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                            {item.type === 'appointment' ? 'Agendado para: ' : (item.type === 'package' ? 'Previsão / Vencimento: ' : 'Data: ')}
                            {item.date ? new Date(item.date.includes('T') ? item.date : item.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                        </span>
                    </div>
                    <div className={styles.extractActions}>
                        <span className={styles.extractAmount}>
                            {formatCurrency(item.amount)}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {item.type === 'appointment' && (
                                <>
                                    <button
                                        className={styles.confirmPayBtn}
                                        onClick={() => handleConfirmPayment(item.id)}
                                    >
                                        Confirmar Pago
                                    </button>
                                    <button
                                        className={styles.confirmPayBtn}
                                        style={{ backgroundColor: '#f39c12' }}
                                        onClick={() => handlePartialPayment('appointment', item.id, item.amount, item.title)}
                                    >
                                        Pagar Parcial
                                    </button>
                                </>
                            )}
                            {item.type === 'sale' && (
                                <>
                                    <button
                                        className={styles.confirmPayBtn}
                                        onClick={() => handleConfirmPetshopPayment(item.id, item.raw.product_name, item.amount)}
                                    >
                                        Confirmar Pago
                                    </button>
                                    <button
                                        className={styles.confirmPayBtn}
                                        style={{ backgroundColor: '#f39c12' }}
                                        onClick={() => handlePartialPayment('sale', item.id, item.amount, `Venda: ${item.raw.product_name}`)}
                                    >
                                        Pagar Parcial
                                    </button>
                                </>
                            )}
                            {item.type === 'package' && (
                                <>
                                    <button
                                        className={styles.confirmPayBtn}
                                        onClick={() => handleConfirmPackagePayment(item.id, item.raw.service_packages?.name || 'Pacote', item.amount)}
                                    >
                                        Confirmar Pago
                                    </button>
                                    <button
                                        className={styles.confirmPayBtn}
                                        style={{ backgroundColor: '#f39c12' }}
                                        onClick={() => handlePartialPayment('package', item.id, item.amount, `Pacote: ${item.raw.service_packages?.name || 'Pacote'}`)}
                                    >
                                        Pagar Parcial
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            {/* Renderização de itens de receita paga - UNIFICADO E ORDENADO POR DATA CRESCENTE */}
            {extractRecords.type === 'revenue' && (() => {
                const revenueItems = [
                    ...filteredAppts.map(appt => ({
                        id: `appt_${appt.id}`,
                        type: 'appointment' as const,
                        title: `${appt.pets?.name || 'Pet'} (${appt.pets?.customers?.name || 'Sem tutor'}) • ${appt.services?.name || 'Serviço'}${isPackageAppt(appt) ? ' (Adicional de Pacote)' : ''}`,
                        description: '',
                        rawDate: appt.paid_at || appt.scheduled_at,
                        amount: getApptAmount(appt),
                        category: (appt.services as any)?.service_categories?.name || 'Serviços',
                        rawTx: null as any
                    })),
                    ...filteredTxs.map(tx => ({
                        id: `tx_${tx.id}`,
                        type: 'transaction' as const,
                        title: tx.name ? `${tx.name}${tx.description ? ` - ${tx.description}` : ''}` : (tx.description || tx.category || 'Receita'),
                        description: tx.description || '',
                        rawDate: tx.date,
                        amount: Number(tx.amount || 0),
                        category: tx.category || 'Outros',
                        rawTx: tx
                    }))
                ].sort((a, b) => {
                    const timeDiff = getTimeFromDate(a.rawDate) - getTimeFromDate(b.rawDate)
                    if (timeDiff !== 0) return timeDiff
                    return a.title.localeCompare(b.title)
                })

                return revenueItems.map(item => (
                    <div key={item.id} className={styles.extractItem}>
                        <div className={styles.extractInfo}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <strong>{item.title}</strong>
                                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>({item.category})</span>
                            </div>
                            {item.description && <span>{item.description}</span>}
                            <span>{formatDateBR(item.rawDate)}</span>
                        </div>
                        <div className={styles.extractActions}>
                            <span className={styles.extractAmount}>
                                {formatCurrency(item.amount)}
                            </span>
                            {item.type === 'transaction' && item.rawTx && (
                                <button
                                    className={styles.deleteBtn}
                                    onClick={() => handleDeleteTransaction(item.rawTx.id)}
                                >
                                    Excluir
                                </button>
                            )}
                        </div>
                    </div>
                ))
            })()}

            {/* Renderização de despesas - ORDENADO POR DATA CRESCENTE */}
            {extractRecords.type === 'expenses' && (() => {
                const sortedExpenses = [...filteredTxs].sort((a, b) => {
                    const timeDiff = getTimeFromDate(a.date) - getTimeFromDate(b.date)
                    if (timeDiff !== 0) return timeDiff
                    return (a.name || a.category || '').localeCompare(b.name || b.category || '')
                })

                return sortedExpenses.map(tx => (
                    <div key={tx.id} className={styles.extractItem}>
                        <div className={styles.extractInfo}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <strong>{tx.name || tx.category}</strong>
                                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>({tx.category})</span>
                            </div>
                            {tx.description && <span>{tx.description}</span>}
                            <span>{formatDateBR(tx.date)}</span>
                        </div>
                        <div className={styles.extractActions}>
                            <span className={`${styles.extractAmount} ${styles.negativeValue}`}>
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
                ))
            })()}

            {isEmpty && (
                <p className={styles.emptyExtract}>Nenhum registro encontrado para este termo/período/categoria.</p>
            )}
        </>
    )
})()}

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
