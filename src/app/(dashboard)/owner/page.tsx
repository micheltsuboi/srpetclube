'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { processRecurringExpenses, deleteFinancialTransaction } from '@/app/actions/finance'
import { payPetshopSale } from '@/app/actions/petshop'
import { updatePackagePaymentStatus } from '@/app/actions/package'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

type ServiceArea = 'all' | 'banho_tosa' | 'creche' | 'hotel'

interface FinancialMetrics {
    revenue: number
    expenses: number
    profit: number
    pendingPayments: number
    forecastPayments: number
    monthlyGrowth: number
    expenseGrowth: number
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
        forecastPayments: 0,
        monthlyGrowth: 0,
        expenseGrowth: 0
    })
    const router = useRouter()
    const pathname = usePathname()
    const [petsToday, setPetsToday] = useState<PetToday[]>([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        tutors: 0,
        pets: 0,
        appointmentsToday: 0
    })
    const [recentExpenses, setRecentExpenses] = useState<any[]>([])
    
    // Novas estatísticas para gráficos
    const [petDistribution, setPetDistribution] = useState<{
        gender: { name: string, value: number, color: string }[],
        species: { name: string, value: number, color: string }[],
        services: { name: string, value: number, color: string }[]
    }>({
        gender: [],
        species: [],
        services: []
    })
    const [activePackagesCount, setActivePackagesCount] = useState(0)

    // Records for drill-down
    const [extractRecords, setExtractRecords] = useState<{
        type: 'revenue' | 'expenses' | 'pending' | null;
        appointments: any[];
        transactions: any[];
        allPending: any[];
        pendingSales: any[];
        pendingPackages: any[];
    }>({
        type: null,
        appointments: [],
        transactions: [],
        allPending: [],
        pendingSales: [],
        pendingPackages: []
    })

    const [isExtractModalOpen, setIsExtractModalOpen] = useState(false)
    const [extractSearchTerm, setExtractSearchTerm] = useState('')
    const [pendingTab, setPendingTab] = useState<'realized' | 'forecast' | 'all'>('realized')
    const [pendingSortField, setPendingSortField] = useState<'date' | 'name' | 'amount'>('date')
    const [pendingSortDirection, setPendingSortDirection] = useState<'asc' | 'desc'>('asc')

    const isApptRealized = (a: any) => {
        if (a.status === 'done' || a.status === 'completed') return true
        if (a.scheduled_at) {
            const sched = new Date(a.scheduled_at)
            const todayEnd = new Date()
            todayEnd.setHours(23, 59, 59, 999)
            return sched <= todayEnd
        }
        return false
    }

    
    useEffect(() => {
        if (isExtractModalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; }
    }, [isExtractModalOpen]);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                // Get user's organization
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('org_id, role')
                    .eq('id', user.id)
                    .single()

                const profile = profileData as { org_id: string; role: string } | null

                if (!profile?.org_id) return

                // Basic Authorization Check
                if (profile.role !== 'admin' && profile.role !== 'staff' && profile.role !== 'superadmin') {
                    router.push('/')
                    return
                }

                // 1. Fetch Financial Data from APPOINTMENTS
                const now = new Date()
                // Usando format YYYY-MM-DD para evitar problemas de fuso horário na busca do banco
                const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
                const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0] + 'T23:59:59Z'
                const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
                const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0] + 'T23:59:59Z'

                const { data: currentMonthAppts } = await supabase
                    .from('appointments')
                    .select(`
                        id, final_price, calculated_price, payment_status, scheduled_at, paid_at, package_credit_id,
                        pets ( name, customers ( name ) ),
                        services ( name, service_categories ( name ) )
                    `)
                    .eq('org_id', profile.org_id)
                    .gte('scheduled_at', startOfCurrentMonth)
                    .lte('scheduled_at', endOfCurrentMonth)

                const { data: allPendingAppts } = await supabase
                    .from('appointments')
                    .select(`
                        id, status, final_price, calculated_price, payment_status, scheduled_at, paid_at, package_credit_id,
                        pets ( name, customers ( name ) ),
                        services ( name, service_categories ( name ) )
                    `)
                    .eq('org_id', profile.org_id)
                    .neq('payment_status', 'paid')
                    .neq('status', 'cancelled')

                // Previous month paid appointments (for growth)
                const { data: prevMonthAppts } = await supabase
                    .from('appointments')
                    .select('final_price, calculated_price, payment_status, package_credit_id')
                    .eq('org_id', profile.org_id)
                    .gte('scheduled_at', startOfPreviousMonth)
                    .lte('scheduled_at', endOfPreviousMonth)

                
                const { data: pendingSalesData } = await supabase
                    .from('petshop_sales')
                    .select('id, total_price, payment_status, created_at, description, pets ( name, customers ( name ) )')
                    .eq('org_id', profile.org_id)
                    .eq('payment_status', 'pending')
                    .order('created_at', { ascending: true })

                const { data: pendingPackagesData } = await supabase
                    .from('customer_packages')
                    .select('id, total_paid, calculated_price, payment_status, purchased_at, pets ( name, customers ( name ) ), customers ( name ), service_packages ( name )')
                    .eq('org_id', profile.org_id)
                    .eq('payment_status', 'pending')
                    .order('purchased_at', { ascending: true })

                const paidAppts = (currentMonthAppts || []).filter(a => a.payment_status === 'paid' && !(a as any).package_credit_id)
                const pendingAppts = (allPendingAppts || []).filter(a => !(a as any).package_credit_id)
                
                const currentRevenue = paidAppts
                    .reduce((sum, a) => sum + Number(a.final_price ?? a.calculated_price ?? 0), 0)

                const realizedAppts = pendingAppts.filter(a => isApptRealized(a))
                const forecastAppts = pendingAppts.filter(a => !isApptRealized(a))

                const realizedPendingTotal = realizedAppts.reduce((sum, a) => sum + Number(a.final_price ?? a.calculated_price ?? 0), 0)
                    + (pendingSalesData || []).reduce((sum, s) => sum + Number(s.total_price), 0)
                    + (pendingPackagesData || []).reduce((sum, p) => sum + Number(p.total_paid || p.calculated_price || 0), 0)

                const forecastPendingTotal = forecastAppts.reduce((sum, a) => sum + Number(a.final_price ?? a.calculated_price ?? 0), 0)

                const prevRevenue = (prevMonthAppts || [])
                    .filter(a => a.payment_status === 'paid' && !(a as any).package_credit_id)
                    .reduce((sum, a) => sum + Number(a.final_price ?? a.calculated_price ?? 0), 0)

                const revenueGrowth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0

                // 2. Process recurring expenses incrementally (throttled to once per session)
                const lastSync = sessionStorage.getItem('last_recurring_sync')
                const today = new Date().toISOString().split('T')[0]
                
                if (lastSync !== today) {
                    await processRecurringExpenses()
                    sessionStorage.setItem('last_recurring_sync', today)
                }

                // 3. Fetch all financial transactions (income and expenses) for the month
                const { data: transactions } = await supabase
                    .from('financial_transactions')
                    .select('*')
                    .eq('org_id', profile.org_id)
                    .gte('date', startOfCurrentMonth)
                    .lte('date', endOfCurrentMonth)

                const incomeTxs = (transactions || []).filter(t => t.type === 'income')
                const expenseTxs = (transactions || []).filter(t => t.type === 'expense')

                const productRevenue = incomeTxs.reduce((sum, t) => sum + t.amount, 0)
                const expenses = expenseTxs.reduce((sum, t) => sum + t.amount, 0)

                const totalRevenue = currentRevenue + productRevenue

                // Get recent 5 expenses for the new section
                const { data: recentExp } = await supabase
                    .from('financial_transactions')
                    .select('*')
                    .eq('org_id', profile.org_id)
                    .eq('type', 'expense')
                    .gte('date', startOfCurrentMonth)
                    .lte('date', endOfCurrentMonth)
                    .order('date', { ascending: false })
                    .limit(5)
                
                setRecentExpenses(recentExp || [])

                // Calculate Expense Growth
                const { data: prevMonthTxs } = await supabase
                    .from('financial_transactions')
                    .select('amount')
                    .eq('org_id', profile.org_id)
                    .eq('type', 'expense')
                    .gte('date', startOfPreviousMonth)
                    .lte('date', endOfPreviousMonth)
                
                const prevExpenses = (prevMonthTxs || []).reduce((sum, t) => sum + t.amount, 0)
                const expenseGrowth = prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : 0

                setFinancials({
                    revenue: totalRevenue,
                    expenses,
                    profit: totalRevenue - expenses,
                    pendingPayments: realizedPendingTotal,
                    forecastPayments: forecastPendingTotal,
                    monthlyGrowth: parseFloat(revenueGrowth.toFixed(1)),
                    expenseGrowth: parseFloat(expenseGrowth.toFixed(1))
                })

                // Store records for extract
                setExtractRecords({
                    type: null, // Keep null until a card is clicked
                    appointments: (currentMonthAppts || []).filter(a => !(a as any).package_credit_id),
                    transactions: transactions || [],
                    allPending: (allPendingAppts || []).filter(a => !(a as any).package_credit_id),
                    pendingSales: pendingSalesData || [],
                    pendingPackages: pendingPackagesData || []
                })

                // 2. Fetch Operational Stats
                const { count: tutorsCount } = await supabase
                    .from('customers')
                    .select('*', { count: 'exact', head: true })
                    .eq('org_id', profile.org_id)

                const { count: petsCount } = await supabase
                    .from('pets')
                    .select('*', { count: 'exact', head: true })

                // Today's appointments for petsToday list and count
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
                const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
                const { data: appts, error: apptError } = await supabase
                    .from('appointments')
                    .select(`
                        id, scheduled_at, status, check_in_date, check_out_date,
                        pets ( id, name, breed, species, customers ( name ) ),
                        services ( name, service_categories ( name ) )
                    `)
                    .eq('org_id', profile.org_id)
                    // Match today's single-day spots OR multi-day checking where today is inside the range
                    .or(`and(scheduled_at.gte.${todayStart},scheduled_at.lte.${todayEnd}),and(check_in_date.lte.${todayStart.split('T')[0]},check_out_date.gte.${todayStart.split('T')[0]})`)
                    .neq('status', 'cancelled')
                    .order('scheduled_at', { ascending: true })

                if (apptError) {
                    console.error("Error fetching owner appointments:", apptError)
                }

                let mappedPets: PetToday[] = []
                if (appts) {
                    mappedPets = appts.map(a => {
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
                            ownerName: (a.pets as any)?.customers?.name || 'Cliente'
                        }
                    })
                    setPetsToday(mappedPets)
                }

                setStats({
                    tutors: tutorsCount || 0,
                    pets: petsCount || 0,
                    appointmentsToday: mappedPets.length
                })

                // 3. Fetch Pet Distribution Data (Gender, Species and Modalities)
                const { data: petData } = await supabase
                    .from('pets')
                    .select('gender, species')
                
                // Modalidades: Buscamos agendamentos recentes (últimos 90 dias / futuros) e pacotes ativos para mapear pets por serviço
                const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
                const { data: recentModalitiesAppts } = await supabase
                    .from('appointments')
                    .select(`
                        pet_id,
                        services (
                            name,
                            service_categories ( name )
                        )
                    `)
                    .eq('org_id', profile.org_id)
                    .gte('scheduled_at', ninetyDaysAgo)
                    .neq('status', 'cancelled')

                const { data: activePkgModalities } = await supabase
                    .from('customer_packages')
                    .select(`
                        pet_id,
                        service_packages ( name )
                    `)
                    .eq('org_id', profile.org_id)
                    .eq('is_active', true)

                const crechePets = new Set<string>()
                const hotelPets = new Set<string>()
                const banhoPets = new Set<string>()

                ;(recentModalitiesAppts || []).forEach((a: any) => {
                    if (!a.pet_id) return
                    const cat = (a.services as any)?.service_categories?.name || a.services?.name || ''
                    if (cat.includes('Creche')) crechePets.add(a.pet_id)
                    else if (cat.includes('Hospedagem') || cat.includes('Hotel')) hotelPets.add(a.pet_id)
                    else if (cat.includes('Banho') || cat.includes('Tosa')) banhoPets.add(a.pet_id)
                })

                ;(activePkgModalities || []).forEach((p: any) => {
                    if (!p.pet_id) return
                    const name = p.service_packages?.name?.toUpperCase() || ''
                    if (name.includes('CRECHE')) crechePets.add(p.pet_id)
                    else if (name.includes('HOTEL') || name.includes('HOSPEDAGEM')) hotelPets.add(p.pet_id)
                    else if (name.includes('BANHO') || name.includes('TOSA') || name.includes('ESSENCIAL') || name.includes('PREMIUM')) banhoPets.add(p.pet_id)
                })

                const serviceModalityData = [
                    { name: 'Banho e Tosa', value: banhoPets.size, color: '#2563EB' },
                    { name: 'Creche', value: crechePets.size, color: '#10B981' },
                    { name: 'Hotel / Hosp.', value: hotelPets.size, color: '#F97316' }
                ]

                if (petData) {
                    const genderCounts = petData.reduce((acc: any, pet) => {
                        const g = pet.gender === 'female' ? 'Fêmeas' : pet.gender === 'male' ? 'Machos' : 'Não Inf.'
                        acc[g] = (acc[g] || 0) + 1
                        return acc
                    }, {})

                    const speciesCounts = petData.reduce((acc: any, pet) => {
                        const s = pet.species === 'dog' ? 'Cachorros' : pet.species === 'cat' ? 'Gatos' : 'Outros'
                        acc[s] = (acc[s] || 0) + 1
                        return acc
                    }, {})

                    setPetDistribution({
                        gender: Object.entries(genderCounts).map(([name, value]) => ({
                            name,
                            value: value as number,
                            color: name === 'Fêmeas' ? '#ec4899' : name === 'Machos' ? '#3b82f6' : '#94a3b8'
                        })),
                        species: Object.entries(speciesCounts).map(([name, value]) => ({
                            name,
                            value: value as number,
                            color: name === 'Cachorros' ? '#f59e0b' : name === 'Gatos' ? '#06b6d4' : '#8b5cf6'
                        })),
                        services: serviceModalityData
                    })
                }

                // 4. Fetch Active Packages Count
                const { count: activePkgs } = await supabase
                    .from('customer_packages')
                    .select('*', { count: 'exact', head: true })
                    .eq('org_id', profile.org_id)
                    .eq('is_active', true)
                
                setActivePackagesCount(activePkgs || 0)

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


    const handleConfirmPetshopPayment = async (saleId: string, productName: string, price: number) => {
        if (confirm(`Confirmar pagamento de R$ ${price.toFixed(2).replace('.', ',')} para ${productName}?`)) {
            const paymentMethod = prompt('Qual a forma de pagamento? (pix, cash, credit, debit)', 'pix')
            if (paymentMethod) {
                const res = await payPetshopSale(saleId, paymentMethod)
                if (res.success) {
                    alert(res.message)
                    window.location.reload()
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
                    window.location.reload()
                } else {
                    alert(res.message)
                }
            }
        }
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
            window.location.reload();
        } catch (error) {
            console.error('Erro ao pagar tudo:', error);
            alert('Houve um erro ao tentar quitar os itens.');
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
            // Refresh data
            window.location.reload()
        } catch (error) {
            console.error('Erro ao confirmar pagamento:', error)
            alert('Erro ao confirmar pagamento.')
        }
    }

    const handleDeleteTransaction = async (txId: string) => {
        const tx = recentExpenses.find(t => t.id === txId) || extractRecords.transactions.find(t => t.id === txId)
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
                window.location.reload()
            } else {
                alert(res.message)
            }
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
        const todayCount = selectedArea === 'all'
            ? petsToday.length
            : petsToday.filter(p => p.area === selectedArea).length

        const monthAppts = extractRecords.appointments.filter(a => {
            if (selectedArea === 'all') return true
            const catName = (a.services as any)?.service_categories?.name || ''
            if (selectedArea === 'banho_tosa') return catName.includes('Banho') || catName.includes('Tosa')
            if (selectedArea === 'creche') return catName.includes('Creche')
            if (selectedArea === 'hotel') return catName.includes('Hospedagem') || catName.includes('Hotel')
            return false
        })

        const monthCount = monthAppts.length
        const revenue = monthAppts
            .filter(a => a.payment_status === 'paid')
            .reduce((sum, a) => sum + Number(a.final_price ?? a.calculated_price ?? 0), 0)

        return { todayCount, monthCount, revenue }
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
                        <span className={`${styles.cardValue} ${styles.expense}`}>{formatCurrency(financials.expenses)}</span>
                        <span className={styles.cardLabel}>Despesas</span>
                    </div>
                    <span className={`${styles.growth} ${financials.expenseGrowth <= 0 ? styles.positive : styles.negative}`}>
                        {financials.expenseGrowth >= 0 ? '+' : ''}{financials.expenseGrowth}%
                    </span>
                </div>
                <div
                    className={`${styles.financialCard} ${styles.clickable}`}
                    onClick={() => handleOpenExtract('revenue')}
                >
                    <div className={styles.cardIcon}>📈</div>
                    <div className={styles.cardContent}>
                        <span className={`${styles.cardValue} ${styles.profit} ${financials.profit < 0 ? styles.negative : ''}`}>
                            {formatCurrency(financials.profit)}
                        </span>
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
                        <span className={styles.cardLabel}>A Receber (Realizados)</span>
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', marginTop: '0.2rem', display: 'block' }}>
                            + {formatCurrency(financials.forecastPayments)} previstos futuros
                        </span>
                    </div>
                </div>
            </div>

            {/* New Stats Charts Section */}
            <h2 className={styles.sectionTitle}>📊 Perfil dos Pets & Contratos</h2>
            <div className={styles.statsGrid}>
                <div className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>Gênero dos Pets</h3>
                    <div className={styles.chartWrapper}>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                    <Pie
                                        data={petDistribution.gender}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        label={false}
                                        labelLine={false}
                                    >
                                        {petDistribution.gender.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                <Tooltip 
                                    contentStyle={{ background: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend 
                                    verticalAlign="bottom" 
                                    height={40} 
                                    wrapperStyle={{ paddingTop: '30px', fontSize: '12px' }}
                                    formatter={(value, entry: any) => `${value} (${entry.payload.value})`}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>Espécie dos Pets</h3>
                    <div className={styles.chartWrapper}>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                    <Pie
                                        data={petDistribution.species}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        label={false}
                                        labelLine={false}
                                    >
                                        {petDistribution.species.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                <Tooltip 
                                    contentStyle={{ background: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend 
                                    verticalAlign="bottom" 
                                    height={36} 
                                    wrapperStyle={{ paddingTop: '20px' }}
                                    formatter={(value, entry: any) => `${value} (${entry.payload.value})`}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>Pets por Modalidade</h3>
                    <div className={styles.chartWrapper}>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={petDistribution.services}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={false}
                                    labelLine={false}
                                >
                                    {petDistribution.services.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ background: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend 
                                    verticalAlign="bottom" 
                                    height={36} 
                                    wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }}
                                    formatter={(value, entry: any) => `${value} (${entry.payload.value})`}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className={styles.counterCard}>
                    <div className={styles.counterIcon}>📦</div>
                    <div className={styles.counterContent}>
                        <span className={styles.counterValue}>{activePackagesCount}</span>
                        <span className={styles.counterLabel}>Pacotes em Contrato</span>
                        <Link href="/owner/packages" className={styles.counterLink}>Gerenciar Pacotes</Link>
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

            {/* Dashboard Content Grid */}
            <div className={styles.mainGrid}>
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

                {/* Recent Expenses Section */}
                <div className={styles.sidebarSection}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>📉 Últimas Despesas</h2>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <Link href="/owner/financeiro" className={styles.addExpenseBtn}>+ Nova</Link>
                            <Link href="/owner/financeiro" className={styles.viewMoreLink}>Ver Tudo</Link>
                        </div>
                    </div>
                    <div className={styles.recentExpensesList}>
                        {recentExpenses.map(expense => (
                            <div key={expense.id} className={styles.expenseItem}>
                                <div className={styles.expenseMain}>
                                    <span className={styles.expenseName}>{expense.name || expense.category}</span>
                                    <span className={styles.expenseDate}>
                                        {new Date(expense.date).toLocaleDateString('pt-BR')}
                                    </span>
                                </div>
                                <span className={styles.expenseAmount}>
                                    {formatCurrency(expense.amount)}
                                </span>
                            </div>
                        ))}
                        {recentExpenses.length === 0 && (
                            <div className={styles.emptyRecent}>
                                <p>Nenhuma despesa registrada.</p>
                            </div>
                        )}
                    </div>
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
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <input
                                    type="text"
                                    placeholder="🔍 Pesquisar por nome..."
                                    value={extractSearchTerm}
                                    onChange={(e) => setExtractSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.4rem 0.8rem',
                                        background: 'rgba(0,0,0,0.2)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '6px',
                                        color: 'white',
                                        fontSize: '0.9rem'
                                    }}
                                />
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
                                        🚨 Pendências Reais ({formatCurrency(financials.pendingPayments)})
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
                                        📅 Previsão de Recebimentos ({formatCurrency(financials.forecastPayments)})
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
                                        📑 Todos ({formatCurrency(financials.pendingPayments + financials.forecastPayments)})
                                    </button>
                                </div>

                                {/* Ordenação */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
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
                            </div>
                        )}

                        <div className={styles.extractList}>
{(() => {
    // 1. Filtragem de Agendamentos
    let apptsSource = extractRecords.type === 'revenue' 
        ? extractRecords.appointments.filter(a => a.payment_status === 'paid')
        : (extractRecords.type === 'pending' ? extractRecords.allPending : [])

    if (extractRecords.type === 'pending') {
        if (pendingTab === 'realized') {
            apptsSource = apptsSource.filter(a => isApptRealized(a))
        } else if (pendingTab === 'forecast') {
            apptsSource = apptsSource.filter(a => !isApptRealized(a))
        }
    }

    const filteredAppts = apptsSource
        .filter(a => {
            if (!extractSearchTerm) return true
            const search = extractSearchTerm.toLowerCase()
            return a.pets?.name?.toLowerCase().includes(search) || 
                   a.services?.name?.toLowerCase().includes(search) ||
                   a.pets?.customers?.name?.toLowerCase().includes(search)
        })

    // 2. Filtragem de Vendas (Petshop)
    const salesSource = extractRecords.type === 'pending' && pendingTab !== 'forecast'
        ? extractRecords.pendingSales
        : []

    const filteredSales = salesSource
        .filter(s => {
            if (!extractSearchTerm) return true
            const search = extractSearchTerm.toLowerCase()
            return s.description?.toLowerCase().includes(search) || 
                   s.pets?.name?.toLowerCase().includes(search) ||
                   s.pets?.customers?.name?.toLowerCase().includes(search)
        })

    // 3. Filtragem de Pacotes
    const pkgsSource = extractRecords.type === 'pending' && pendingTab !== 'forecast'
        ? extractRecords.pendingPackages
        : []

    const filteredPackages = pkgsSource
        .filter(p => {
            if (!extractSearchTerm) return true
            const search = extractSearchTerm.toLowerCase()
            return p.service_packages?.name?.toLowerCase().includes(search) || 
                   p.pets?.name?.toLowerCase().includes(search) ||
                   p.pets?.customers?.name?.toLowerCase().includes(search) ||
                   p.customers?.name?.toLowerCase().includes(search)
        })

    // 4. Filtragem de Transações de Receitas/Despesas
    const filteredTxs = extractRecords.type !== 'pending' ? extractRecords.transactions
        .filter(t => extractRecords.type === 'revenue' ? t.type === 'income' : t.type === 'expense')
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
            title: `${appt.pets?.name || 'Pet'} (${appt.pets?.customers?.name || 'Sem tutor'}) • ${appt.services?.name || 'Serviço'}`,
            date: appt.scheduled_at,
            amount: appt.final_price ?? appt.calculated_price ?? 0,
            isRealized: isApptRealized(appt),
            raw: appt
        })),
        ...filteredSales.map(sale => ({
            id: sale.id,
            type: 'sale' as const,
            petName: sale.pets?.name || 'Avulso',
            customerName: sale.pets?.customers?.name || 'Sem tutor',
            title: `🛍️ ${sale.description || 'Venda'} (${sale.pets?.customers?.name || 'Sem tutor'})`,
            date: sale.created_at,
            amount: sale.total_price,
            isRealized: true,
            raw: sale
        })),
        ...filteredPackages.map(pkg => {
            const petName = pkg.pets?.name || 'Pet'
            const tutorName = pkg.pets?.customers?.name || pkg.customers?.name || 'Sem tutor'
            return {
                id: pkg.id,
                type: 'package' as const,
                petName,
                customerName: tutorName,
                title: `${petName} (${tutorName}) • Pacote: ${pkg.service_packages?.name || 'Serviço'}`,
                date: pkg.purchased_at,
                amount: pkg.total_paid || pkg.calculated_price || 0,
                isRealized: true,
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
        : filteredAppts.reduce((acc, a) => acc + (a.final_price ?? a.calculated_price ?? 0), 0) +
          filteredTxs.reduce((acc, t) => acc + t.amount, 0)

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
                            onClick={() => handlePayAllFiltered(filteredAppts, filteredSales, filteredPackages, totalFiltered)}
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
                            {item.type === 'appointment' && (
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
                            {item.type === 'appointment' ? 'Agendado para: ' : 'Data: '}
                            {new Date(item.date).toLocaleDateString('pt-BR')}
                        </span>
                    </div>
                    <div className={styles.extractActions}>
                        <span className={styles.extractAmount}>
                            {formatCurrency(item.amount)}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {item.type === 'appointment' && (
                                <button
                                    className={styles.confirmPayBtn}
                                    onClick={() => handleConfirmPayment(item.id)}
                                >
                                    Confirmar Pago
                                </button>
                            )}
                            {item.type === 'sale' && (
                                <button
                                    className={styles.confirmPayBtn}
                                    onClick={() => handleConfirmPetshopPayment(item.id, item.raw.description || 'Venda', item.amount)}
                                >
                                    Confirmar Pago
                                </button>
                            )}
                            {item.type === 'package' && (
                                <button
                                    className={styles.confirmPayBtn}
                                    onClick={() => handleConfirmPackagePayment(item.id, item.raw.service_packages?.name || 'Pacote', item.amount)}
                                >
                                    Confirmar Pago
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            {/* Renderização de itens de receita paga */}
            {extractRecords.type === 'revenue' && filteredAppts.map(appt => (
                <div key={appt.id} className={styles.extractItem}>
                    <div className={styles.extractInfo}>
                        <strong>{appt.pets?.name || 'Pet'} ({appt.pets?.customers?.name || 'Sem tutor'}) • {appt.services?.name || 'Serviço'}</strong>
                        <span>{new Date(appt.scheduled_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div className={styles.extractActions}>
                        <span className={styles.extractAmount}>
                            {formatCurrency(appt.final_price ?? appt.calculated_price ?? 0)}
                        </span>
                    </div>
                </div>
            ))}

            {filteredTxs.map(tx => (
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
                        <span className={`${styles.extractAmount} ${tx.type === 'expense' ? styles.negativeValue : ''}`}>
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

            {isEmpty && (
                <p className={styles.emptyExtract}>Nenhum registro encontrado para este termo/período.</p>
            )}
        </>
    )
})()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
