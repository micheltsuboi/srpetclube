'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'

type ServiceArea = 'all' | 'banho_tosa' | 'creche' | 'hotel'

interface FinancialMetrics {
    revenue: number
    expenses: number
    profit: number
    pendingPayments: number
    monthlyGrowth: number
}

interface ServiceStats {
    area: ServiceArea
    todayCount: number
    monthCount: number
    revenue: number
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

// Mock data
const mockFinancials: FinancialMetrics = {
    revenue: 28750.00,
    expenses: 8420.00,
    profit: 20330.00,
    pendingPayments: 3200.00,
    monthlyGrowth: 12.5
}

const mockServiceStats: ServiceStats[] = [
    { area: 'banho_tosa', todayCount: 8, monthCount: 156, revenue: 14200 },
    { area: 'creche', todayCount: 12, monthCount: 280, revenue: 9800 },
    { area: 'hotel', todayCount: 4, monthCount: 45, revenue: 4750 }
]

const mockPetsToday: PetToday[] = [
    { id: '1', name: 'Thor', breed: 'Golden Retriever', area: 'banho_tosa', service: 'Banho + Tosa', status: 'in_progress', checkedInAt: '09:30', ownerName: 'João Silva' },
    { id: '2', name: 'Luna', breed: 'Poodle', area: 'banho_tosa', service: 'Banho', status: 'waiting', checkedInAt: null, ownerName: 'Maria Santos' },
    { id: '3', name: 'Bob', breed: 'Bulldog', area: 'creche', service: 'Creche Diária', status: 'in_progress', checkedInAt: '08:00', ownerName: 'Carlos Lima' },
    { id: '4', name: 'Mel', breed: 'Shih Tzu', area: 'creche', service: 'Creche Diária', status: 'in_progress', checkedInAt: '07:45', ownerName: 'Ana Oliveira' },
    { id: '5', name: 'Rex', breed: 'Labrador', area: 'hotel', service: 'Hospedagem 3 dias', status: 'in_progress', checkedInAt: '05/02', ownerName: 'Pedro Costa' },
    { id: '6', name: 'Mia', breed: 'Yorkshire', area: 'banho_tosa', service: 'Tosa Higiênica', status: 'done', checkedInAt: '08:15', ownerName: 'Julia Ferreira' },
    { id: '7', name: 'Max', breed: 'Beagle', area: 'creche', service: 'Creche Diária', status: 'in_progress', checkedInAt: '08:30', ownerName: 'Fernanda Souza' },
    { id: '8', name: 'Nina', breed: 'Maltês', area: 'hotel', service: 'Hospedagem 5 dias', status: 'in_progress', checkedInAt: '03/02', ownerName: 'Ricardo Alves' },
]

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
    const [selectedArea, setSelectedArea] = useState<ServiceArea>('all')
    const [financials] = useState<FinancialMetrics>(mockFinancials)
    const [serviceStats] = useState<ServiceStats[]>(mockServiceStats)
    const [petsToday] = useState<PetToday[]>(mockPetsToday)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setTimeout(() => setLoading(false), 500)
    }, [])

    const filteredPets = selectedArea === 'all'
        ? petsToday
        : petsToday.filter(p => p.area === selectedArea)

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const getAreaStats = (area: ServiceArea) => {
        if (area === 'all') {
            return {
                todayCount: serviceStats.reduce((a, b) => a + b.todayCount, 0),
                monthCount: serviceStats.reduce((a, b) => a + b.monthCount, 0),
                revenue: serviceStats.reduce((a, b) => a + b.revenue, 0)
            }
        }
        return serviceStats.find(s => s.area === area) || { todayCount: 0, monthCount: 0, revenue: 0 }
    }

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
                <p>Carregando dashboard...</p>
            </div>
        )
    }

    const currentStats = getAreaStats(selectedArea)

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>👋 Olá, Proprietário</h1>
                    <p className={styles.subtitle}>Painel de Gestão do Pet Shop</p>
                </div>
                <div className={styles.headerActions}>
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

            {/* Financial Summary */}
            <div className={styles.financialGrid}>
                <div className={styles.financialCard}>
                    <div className={styles.cardIcon}>💰</div>
                    <div className={styles.cardContent}>
                        <span className={styles.cardValue}>{formatCurrency(financials.revenue)}</span>
                        <span className={styles.cardLabel}>Faturamento do Mês</span>
                    </div>
                    <span className={`${styles.growth} ${styles.positive}`}>+{financials.monthlyGrowth}%</span>
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
                <div className={styles.financialCard}>
                    <div className={styles.cardIcon}>⏳</div>
                    <div className={styles.cardContent}>
                        <span className={`${styles.cardValue} ${styles.pending}`}>{formatCurrency(financials.pendingPayments)}</span>
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
                        <p>Nenhum pet nesta área hoje</p>
                    </div>
                )}
            </div>
        </div>
    )
}
