'use client'

import { useState, useEffect, useCallback, useActionState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import {
    createServicePackage,
    updateServicePackage,
    deleteServicePackage,
    togglePackageStatus,
    addPackageItem,
    deletePackageItem
} from '@/app/actions/package'

interface Service {
    id: string
    name: string
    category: string
    base_price: number
}

interface PackageItem {
    id: string
    service_id: string
    quantity: number
    services: Service
}

interface ServicePackage {
    id: string
    name: string
    description: string | null
    total_price: number
    validity_days: number | null
    validity_type: 'weekly' | 'monthly' | 'none' | null
    is_active: boolean
    package_items: PackageItem[]
}

const initialState = { message: '', success: false }

export default function PackagesPage() {
    const supabase = createClient()
    const [packages, setPackages] = useState<ServicePackage[]>([])
    const [services, setServices] = useState<Service[]>([])

    // Modal State
    const [showModal, setShowModal] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [selectedPackage, setSelectedPackage] = useState<ServicePackage | null>(null)

    // Form Action States
    const [createState, createAction, isCreatePending] = useActionState(createServicePackage, initialState)
    const [updateState, updateAction, isUpdatePending] = useActionState(updateServicePackage, initialState)

    // Add service to package state
    const [selectedServiceId, setSelectedServiceId] = useState('')
    const [serviceQuantity, setServiceQuantity] = useState(1)
    const [addingService, setAddingService] = useState(false)

    const formatCategory = (category: string) => {
        if (!category) return ''
        const mapping: Record<string, string> = {
            'creche': 'Creche',
            'hotel': 'Hospedagem',
            'banho_tosa': 'Banho e Tosa',
            'hospedagem': 'Hospedagem'
        }

        if (mapping[category.toLowerCase()]) return mapping[category.toLowerCase()]

        return category
            .replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
    }

    const fetchData = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile?.org_id) return

            // Fetch packages
            const { data: packagesData } = await supabase
                .from('service_packages')
                .select(`
                    *,
                    package_items (
                        id,
                        service_id,
                        quantity,
                        services (id, name, category, base_price)
                    )
                `)
                .eq('org_id', profile.org_id)
                .order('created_at', { ascending: false })

            if (packagesData) setPackages(packagesData as ServicePackage[])

            // Fetch services for dropdown
            const { data: servicesData } = await supabase
                .from('services')
                .select('id, name, category, base_price')
                .eq('org_id', profile.org_id)
                .eq('is_active', true)
                .order('name')

            if (servicesData) setServices(servicesData)

        } catch (error) {
            console.error(error)
        }
    }, [supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        if (createState.success || updateState.success) {
            setShowModal(false)
            fetchData()
            alert(createState.message || updateState.message)
        } else if (createState.message || updateState.message) {
            alert(createState.message || updateState.message)
        }
    }, [createState, updateState, fetchData])

    const handleEdit = (pkg: ServicePackage) => {
        setSelectedPackage(pkg)
        setIsEditing(true)
        setShowModal(true)
    }

    const handleCreate = () => {
        setSelectedPackage(null)
        setIsEditing(false)
        setShowModal(true)
    }

    const handleDelete = async () => {
        if (!selectedPackage) return
        if (confirm(`Tem certeza que deseja excluir o pacote "${selectedPackage.name}"?`)) {
            const res = await deleteServicePackage(selectedPackage.id)
            if (res.success) {
                setShowModal(false)
                fetchData()
                alert(res.message)
            } else {
                alert(res.message)
            }
        }
    }

    const handleToggleStatus = async (pkg: ServicePackage) => {
        const res = await togglePackageStatus(pkg.id, !pkg.is_active)
        if (res.success) {
            fetchData()
        } else {
            alert(res.message)
        }
    }

    const handleAddService = async () => {
        if (!selectedPackage || !selectedServiceId) return
        setAddingService(true)
        const res = await addPackageItem(selectedPackage.id, selectedServiceId, serviceQuantity)
        if (res.success) {
            // Refresh package data
            const { data } = await supabase
                .from('service_packages')
                .select(`
                    *,
                    package_items (
                        id,
                        service_id,
                        quantity,
                        services (id, name, category, base_price)
                    )
                `)
                .eq('id', selectedPackage.id)
                .single()

            if (data) {
                setSelectedPackage(data as ServicePackage)
                setSelectedServiceId('')
                setServiceQuantity(1)
            }
            fetchData()
        } else {
            alert(res.message)
        }
        setAddingService(false)
    }

    const handleRemoveService = async (itemId: string) => {
        if (!confirm('Remover serviço do pacote?')) return
        const res = await deletePackageItem(itemId)
        if (res.success && selectedPackage) {
            const { data } = await supabase
                .from('service_packages')
                .select(`
                    *,
                    package_items (
                        id,
                        service_id,
                        quantity,
                        services (id, name, category, base_price)
                    )
                `)
                .eq('id', selectedPackage.id)
                .single()

            if (data) setSelectedPackage(data as ServicePackage)
            fetchData()
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <Link href="/owner" style={{ color: 'var(--primary)', marginBottom: '0.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>← Voltar</Link>
                    <h1 className={styles.title}>Pacotes de Serviços</h1>
                    <p style={{ color: '#666', fontSize: '0.9rem' }}>
                        Crie pacotes mensais com múltiplos serviços. Créditos não utilizados acumulam para o próximo mês.
                    </p>
                </div>
                <button className={styles.actionButton} onClick={handleCreate}>
                    + Novo Pacote
                </button>
            </div>

            <div className={styles.grid}>
                {packages.map(pkg => (
                    <div key={pkg.id} className={`${styles.card} ${!pkg.is_active ? styles.inactiveCard : ''}`} onClick={() => handleEdit(pkg)}>
                        <div className={styles.cardHeader}>
                            <div>
                                <span className={styles.cardTitle}>{pkg.name}</span>
                                {!pkg.is_active && <span className={styles.badge}>Inativo</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className={styles.cardPrice}>R$ {pkg.total_price.toFixed(2)}</span>
                                <button
                                    className={styles.toggleBtn}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleToggleStatus(pkg)
                                    }}
                                    title={pkg.is_active ? 'Desativar' : 'Ativar'}
                                >
                                    {pkg.is_active ? '✓' : '✗'}
                                </button>
                            </div>
                        </div>
                        {pkg.description && (
                            <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
                                {pkg.description}
                            </div>
                        )}
                        <div className={styles.cardMeta}>
                            {pkg.validity_type === 'weekly' && pkg.validity_days
                                ? `🔄 Renovação a cada ${pkg.validity_days / 7} semana(s)`
                                : 'Sem renovação automática'}
                        </div>
                        <div className={styles.servicesList}>
                            {pkg.package_items?.map(item => (
                                <div key={item.id} className={styles.serviceItem}>
                                    <span>{item.quantity}x {item.services.name}</span>
                                </div>
                            ))}
                            {(!pkg.package_items || pkg.package_items.length === 0) && (
                                <div style={{ fontSize: '0.8rem', color: '#999' }}>Nenhum serviço adicionado</div>
                            )}
                        </div>
                    </div>
                ))}
                {packages.length === 0 && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: '#999' }}>
                        Nenhum pacote criado ainda. Clique em "Novo Pacote" para começar.
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.title}>{isEditing ? 'Editar Pacote' : 'Novo Pacote'}</h2>

                        {/* Main Package Form */}
                        <form action={isEditing ? updateAction : createAction} id="packageForm">
                            {isEditing && <input type="hidden" name="id" value={selectedPackage!.id} />}
                            <div className={styles.formGrid}>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Nome do Pacote *</label>
                                    <input
                                        name="name"
                                        className={styles.input}
                                        defaultValue={selectedPackage?.name}
                                        placeholder="Ex: Pacote Mensal Premium"
                                        required
                                    />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Preço Total (R$) *</label>
                                    <input
                                        name="total_price"
                                        type="number"
                                        step="0.01"
                                        className={styles.input}
                                        defaultValue={selectedPackage?.total_price}
                                        required
                                    />
                                </div>
                                <div className={styles.inputGroup} style={{ gridColumn: '1/-1' }}>
                                    <label className={styles.label}>Descrição</label>
                                    <input
                                        name="description"
                                        className={styles.input}
                                        defaultValue={selectedPackage?.description || ''}
                                        placeholder="Descrição opcional do pacote"
                                    />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Renovação *</label>
                                    <select
                                        name="validity_type"
                                        className={styles.select || styles.input}
                                        defaultValue={selectedPackage?.validity_type === 'none' ? 'none' : 'weekly'}
                                        style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                    >
                                        <option value="none">Sem renovação automática</option>
                                        <option value="weekly">Ativo – Renovação por Semanas</option>
                                    </select>
                                    <small style={{ fontSize: '0.75rem', color: '#666' }}>
                                        Para pacotes com período de duração em semanas.
                                    </small>
                                </div>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Validade (Semanas) *</label>
                                    <input
                                        name="validity_weeks"
                                        type="number"
                                        min="1"
                                        className={styles.input}
                                        defaultValue={selectedPackage?.validity_days ? selectedPackage.validity_days / 7 : 5}
                                        required
                                    />
                                    <small style={{ fontSize: '0.75rem', color: '#666' }}>
                                        Duração antes da renovação (ex: 5 semanas).
                                    </small>
                                </div>
                            </div>

                            <div className={styles.modalActions} style={{ marginTop: '1rem', marginBottom: '2rem' }}>
                                {isEditing && (
                                    <button type="button" className={styles.deleteBtn} onClick={handleDelete}>
                                        Excluir Pacote
                                    </button>
                                )}
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" form="packageForm" className={styles.submitBtn} disabled={isCreatePending || isUpdatePending}>
                                    {isEditing ? 'Salvar Alterações' : 'Criar Pacote'}
                                </button>
                            </div>
                        </form>

                        {/* Services in Package - Only in Edit Mode */}
                        {isEditing && selectedPackage && (
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                                <h3 className={styles.sectionTitle}>Serviços Inclusos no Pacote</h3>
                                <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1rem' }}>
                                    Defina quais serviços e quantidades fazem parte deste pacote. Diferentes categorias (Creche, Hotel, Banho) podem ser misturadas!
                                </p>

                                {/* Current Services */}
                                <div className={styles.servicesTable}>
                                    {selectedPackage.package_items?.map(item => (
                                        <div key={item.id} className={styles.serviceRow}>
                                            <div className={styles.serviceInfo}>
                                                <span className={styles.serviceName}>{item.services.name}</span>
                                                <span className={styles.serviceCategory}>{formatCategory(item.services.category)}</span>
                                            </div>
                                            <div className={styles.serviceQty}>
                                                <span className={styles.qtyBadge}>{item.quantity}x</span>
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.deleteBtnSmall}
                                                onClick={() => handleRemoveService(item.id)}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    ))}
                                    {(!selectedPackage.package_items || selectedPackage.package_items.length === 0) && (
                                        <div style={{ textAlign: 'center', padding: '1rem', color: '#999' }}>
                                            Nenhum serviço adicionado ainda
                                        </div>
                                    )}
                                </div>

                                {/* Add Service Form */}
                                <div className={styles.addServiceForm}>
                                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Adicionar Serviço</h4>
                                    <div className={styles.addServiceControls}>
                                        <div className={`${styles.inputGroup} ${styles.flex2}`}>
                                            <label className={styles.label}>Serviço</label>
                                            <select
                                                className={styles.select}
                                                value={selectedServiceId}
                                                onChange={(e) => setSelectedServiceId(e.target.value)}
                                            >
                                                <option value="">Selecione um serviço</option>
                                                {services.map(service => (
                                                    <option key={service.id} value={service.id}>
                                                        [{formatCategory(service.category)}] {service.name} - R$ {service.base_price.toFixed(2)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className={`${styles.inputGroup} ${styles.flex1}`}>
                                            <label className={styles.label}>Quantidade</label>
                                            <input
                                                type="number"
                                                min="1"
                                                className={styles.input}
                                                value={serviceQuantity}
                                                onChange={(e) => setServiceQuantity(parseInt(e.target.value) || 1)}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.addBtn}
                                            onClick={handleAddService}
                                            disabled={!selectedServiceId || addingService}
                                        >
                                            + Adicionar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
