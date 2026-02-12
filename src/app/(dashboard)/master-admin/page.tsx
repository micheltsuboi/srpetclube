'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './page.module.css'

interface PetShop {
    id: string
    name: string
    cnpj: string
    city: string
    state: string
    status: 'active' | 'trial' | 'suspended'
    total_revenue: number
    total_services: number
    created_at: string
}

interface Analytics {
    totalShops: number
    activeShops: number
    totalRevenue: number
    totalServices: number
    growth: number
}

// Mock data para demonstração
const mockShops: PetShop[] = [
    {
        id: '1',
        name: 'Sr. Pet Clube',
        cnpj: '12.345.678/0001-00',
        city: 'São Paulo',
        state: 'SP',
        status: 'active',
        total_revenue: 45750.00,
        total_services: 342,
        created_at: '2024-01-15'
    },
    {
        id: '2',
        name: 'PetLove Care',
        cnpj: '98.765.432/0001-00',
        city: 'Rio de Janeiro',
        state: 'RJ',
        status: 'active',
        total_revenue: 38200.00,
        total_services: 287,
        created_at: '2024-03-20'
    },
    {
        id: '3',
        name: 'Mundo Animal',
        cnpj: '11.222.333/0001-00',
        city: 'Belo Horizonte',
        state: 'MG',
        status: 'trial',
        total_revenue: 5400.00,
        total_services: 45,
        created_at: '2025-12-01'
    },
    {
        id: '4',
        name: 'Pet Paradise',
        cnpj: '44.555.666/0001-00',
        city: 'Curitiba',
        state: 'PR',
        status: 'suspended',
        total_revenue: 12300.00,
        total_services: 98,
        created_at: '2024-06-10'
    },
    {
        id: '5',
        name: 'Cantinho Pet',
        cnpj: '77.888.999/0001-00',
        city: 'Porto Alegre',
        state: 'RS',
        status: 'active',
        total_revenue: 28950.00,
        total_services: 215,
        created_at: '2024-08-25'
    }
]

const mockAnalytics: Analytics = {
    totalShops: 127,
    activeShops: 98,
    totalRevenue: 2845000.00,
    totalServices: 18542,
    growth: 23.5
}

const statusLabels: Record<string, string> = {
    active: 'Ativo',
    trial: 'Trial',
    suspended: 'Suspenso'
}

export default function AdminPage() {
    const [shops, setShops] = useState<PetShop[]>([])
    const [analytics, setAnalytics] = useState<Analytics | null>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    const supabase = createClient()
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('role, org_id')
                .eq('id', user.id)
                .single()

            // Only SaaS level superadmins (no org_id) can access master admin
            if (!profile || profile.role !== 'superadmin' || profile.org_id) {
                router.push('/owner') // Redirect unauthorized users to regular dashboard
                return
            }

            setShops(mockShops)
            setAnalytics(mockAnalytics)
            setLoading(false)
        }

        checkAuth()
    }, [supabase, router])

    const filteredShops = shops.filter(shop => {
        const matchesSearch = shop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            shop.city.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesStatus = statusFilter === 'all' || shop.status === statusFilter
        return matchesSearch && matchesStatus
    })

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
                <p>Carregando painel...</p>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>🏢 Painel Administrativo</h1>
                    <p className={styles.subtitle}>Gestão de tenants SaaS</p>
                </div>
            </div>

            {/* Analytics Cards */}
            {analytics && (
                <div className={styles.analyticsGrid}>
                    <div className={styles.analyticsCard}>
                        <div className={styles.cardIcon}>🏪</div>
                        <div className={styles.cardContent}>
                            <span className={styles.cardValue}>{analytics.totalShops}</span>
                            <span className={styles.cardLabel}>Pet Shops</span>
                        </div>
                    </div>
                    <div className={styles.analyticsCard}>
                        <div className={styles.cardIcon}>✅</div>
                        <div className={styles.cardContent}>
                            <span className={styles.cardValue}>{analytics.activeShops}</span>
                            <span className={styles.cardLabel}>Ativos</span>
                        </div>
                    </div>
                    <div className={styles.analyticsCard}>
                        <div className={styles.cardIcon}>💰</div>
                        <div className={styles.cardContent}>
                            <span className={styles.cardValue}>{formatCurrency(analytics.totalRevenue)}</span>
                            <span className={styles.cardLabel}>Faturamento Total</span>
                        </div>
                    </div>
                    <div className={styles.analyticsCard}>
                        <div className={styles.cardIcon}>📈</div>
                        <div className={styles.cardContent}>
                            <span className={`${styles.cardValue} ${styles.growth}`}>+{analytics.growth}%</span>
                            <span className={styles.cardLabel}>Crescimento</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className={styles.filters}>
                <input
                    type="text"
                    placeholder="🔍 Buscar pet shop..."
                    className={styles.searchInput}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className={styles.statusFilters}>
                    <button
                        className={`${styles.filterBtn} ${statusFilter === 'all' ? styles.active : ''}`}
                        onClick={() => setStatusFilter('all')}
                    >
                        Todos
                    </button>
                    <button
                        className={`${styles.filterBtn} ${statusFilter === 'active' ? styles.active : ''}`}
                        onClick={() => setStatusFilter('active')}
                    >
                        Ativos
                    </button>
                    <button
                        className={`${styles.filterBtn} ${statusFilter === 'trial' ? styles.active : ''}`}
                        onClick={() => setStatusFilter('trial')}
                    >
                        Trial
                    </button>
                    <button
                        className={`${styles.filterBtn} ${statusFilter === 'suspended' ? styles.active : ''}`}
                        onClick={() => setStatusFilter('suspended')}
                    >
                        Suspensos
                    </button>
                </div>
            </div>

            {/* Shops Table */}
            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Pet Shop</th>
                            <th>Localização</th>
                            <th>Status</th>
                            <th>Faturamento</th>
                            <th>Serviços</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredShops.map((shop) => (
                            <tr key={shop.id}>
                                <td>
                                    <div className={styles.shopInfo}>
                                        <span className={styles.shopName}>{shop.name}</span>
                                        <span className={styles.shopCnpj}>{shop.cnpj}</span>
                                    </div>
                                </td>
                                <td>
                                    <span className={styles.location}>{shop.city}, {shop.state}</span>
                                </td>
                                <td>
                                    <span className={`${styles.statusBadge} ${styles[shop.status]}`}>
                                        {statusLabels[shop.status]}
                                    </span>
                                </td>
                                <td>
                                    <span className={styles.revenue}>{formatCurrency(shop.total_revenue)}</span>
                                </td>
                                <td>
                                    <span className={styles.services}>{shop.total_services}</span>
                                </td>
                                <td>
                                    <div className={styles.actions}>
                                        <button className={styles.actionBtn} title="Ver detalhes">👁️</button>
                                        <button className={styles.actionBtn} title="Editar">✏️</button>
                                        <button className={styles.actionBtn} title="Configurações">⚙️</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {filteredShops.length === 0 && (
                <div className={styles.emptyState}>
                    <span>🔍</span>
                    <p>Nenhum pet shop encontrado</p>
                </div>
            )}
        </div>
    )
}
