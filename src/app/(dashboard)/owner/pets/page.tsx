'use client'

import { useState, useEffect, useCallback, useActionState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { createPet, updatePet, deletePet } from '@/app/actions/pet'
import { sellPackageToPet, getPetPackagesWithUsage } from '@/app/actions/package'

// Interfaces
interface Pet {
    id: string
    name: string
    species: 'dog' | 'cat' | 'other'
    breed: string | null
    gender: 'male' | 'female'
    size: 'small' | 'medium' | 'large' | 'giant' | null
    birth_date: string | null
    weight_kg: number | null
    is_neutered: boolean
    existing_conditions: string | null
    vaccination_up_to_date: boolean
    customer_id: string
    customers: { id: string, name: string } | null
}

interface Customer {
    id: string
    name: string
}

const initialState = {
    message: '',
    success: false
}

export default function PetsPage() {
    const router = useRouter()
    const supabase = createClient()
    const [pets, setPets] = useState<Pet[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [selectedPet, setSelectedPet] = useState<Pet | null>(null)
    const [activeTab, setActiveTab] = useState<'details' | 'packages'>('details')

    // Package States
    const [petPackages, setPetPackages] = useState<any[]>([])
    const [availablePackages, setAvailablePackages] = useState<any[]>([])
    const [selectedPackageId, setSelectedPackageId] = useState('')
    const [isSelling, setIsSelling] = useState(false)

    // Server Action State
    const [createState, createAction, isCreatePending] = useActionState(createPet, initialState)
    const [updateState, updateAction, isUpdatePending] = useActionState(updatePet, initialState)

    const isPending = isCreatePending || isUpdatePending

    const fetchData = useCallback(async () => {
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

            // Fetch Pets
            const { data: petsData, error: petsError } = await supabase
                .from('pets')
                .select(`
                    id, name, species, breed, gender, size, weight_kg, birth_date, is_neutered,
                    existing_conditions, vaccination_up_to_date, customer_id,
                    customers ( id, name )
                `)
                .order('name')

            if (petsError) throw petsError

            // Fetch Customers for select
            const { data: customersData, error: customersError } = await supabase
                .from('customers')
                .select('id, name')
                .eq('org_id', profile.org_id)
                .order('name')

            if (customersError) throw customersError

            // Fetch Available Service Packages
            const { data: packagesData } = await supabase
                .from('service_packages')
                .select('id, name, total_price, description')
                .eq('org_id', profile.org_id)
                .eq('is_active', true)
                .order('total_price')

            if (petsData) setPets(petsData as unknown as Pet[])
            if (customersData) setCustomers(customersData)
            if (packagesData) setAvailablePackages(packagesData)

        } catch (error) {
            console.error('Erro ao buscar dados:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase])

    // Buscar pacotes do pet quando a aba muda ou o pet é selecionado
    const fetchPetPackageSummary = useCallback(async () => {
        if (!selectedPet || activeTab !== 'packages') return

        try {
            const data = await getPetPackagesWithUsage(selectedPet.id)
            setPetPackages(data || [])
        } catch (error) {
            console.error('Erro:', error)
        }
    }, [selectedPet, activeTab])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        fetchPetPackageSummary()
    }, [fetchPetPackageSummary])

    // Feedback handling
    useEffect(() => {
        if (createState.success) {
            setShowModal(false)
            fetchData()
            alert(createState.message)
        } else if (createState.message) {
            alert(createState.message)
        }
    }, [createState, fetchData])

    useEffect(() => {
        if (updateState.success) {
            setShowModal(false)
            setSelectedPet(null)
            fetchData()
            alert(updateState.message)
        } else if (updateState.message) {
            alert(updateState.message)
        }
    }, [updateState, fetchData])

    const handleRowClick = (pet: Pet) => {
        setSelectedPet(pet)
        setActiveTab('details')
        setShowModal(true)
    }

    const handleNewPet = () => {
        setSelectedPet(null)
        setActiveTab('details')
        setShowModal(true)
    }

    const handleDelete = async () => {
        if (!selectedPet) return
        if (!confirm(`Tem certeza que deseja excluir o pet ${selectedPet.name}?`)) return

        const res = await deletePet(selectedPet.id)
        if (res.success) {
            alert(res.message)
            setShowModal(false)
            setSelectedPet(null)
            fetchData()
        } else {
            alert(res.message)
        }
    }

    const handleSellPackage = async () => {
        if (!selectedPet || !selectedPackageId) return

        const pkg = availablePackages.find(p => p.id === selectedPackageId)
        if (!confirm(`Confirmar venda do pacote "${pkg.name}" para ${selectedPet.name} por R$ ${pkg.total_price.toFixed(2)}?`)) return

        setIsSelling(true)
        try {
            const res = await sellPackageToPet(selectedPet.id, selectedPackageId, pkg.total_price, 'other')

            if (res.success) {
                alert(res.message)
                fetchPetPackageSummary()
                setSelectedPackageId('')
            } else {
                alert(res.message)
            }
        } catch (error) {
            console.error(error)
            alert('Erro ao vender pacote.')
        } finally {
            setIsSelling(false)
        }
    }

    if (loading) {
        return (
            <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ fontSize: '1.2rem', color: '#666' }}>Carregando pets...</div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <Link href="/owner" className={styles.backLink}>← Voltar</Link>
                    <h1 className={styles.title}>🐾 Gestão de Pets</h1>
                    <p className={styles.subtitle}>Gerencie os animais cadastrados no sistema</p>
                </div>
                <button className={styles.addButton} onClick={handleNewPet}>
                    + Novo Pet
                </button>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Pet</th>
                            <th>Tutor</th>
                            <th>Características</th>
                            <th>Idade</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pets.map(pet => (
                            <tr key={pet.id} onClick={() => handleRowClick(pet)} style={{ cursor: 'pointer' }}>
                                <td>
                                    <div className={styles.itemInfo}>
                                        <div className={styles.avatar}>
                                            {pet.species === 'cat' ? '🐱' : '🐶'}
                                        </div>
                                        <div>
                                            <span className={styles.itemName}>{pet.name}</span>
                                            <span className={styles.itemSub}>{pet.breed || 'Sem raça definida'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div className={styles.itemName} style={{ fontSize: '0.9rem' }}>
                                        {pet.customers?.name || 'Tutor não encontrado'}
                                    </div>
                                </td>
                                <td>
                                    <div className={styles.itemSub}>
                                        {pet.gender === 'male' ? 'Macho' : 'Fêmea'} • {
                                            pet.size === 'small' ? 'Pequeno' :
                                                pet.size === 'medium' ? 'Médio' :
                                                    pet.size === 'large' ? 'Grande' : 'Gigante'
                                        }
                                        {pet.is_neutered && ' • Castrado'}
                                    </div>
                                </td>
                                <td>
                                    <div className={styles.itemSub}>
                                        {pet.birth_date ? new Date(pet.birth_date).toLocaleDateString('pt-BR') : '-'}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {pets.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>Nenhum pet cadastrado.</p>
                )}
            </div>

            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>
                                {activeTab === 'details'
                                    ? (selectedPet ? `Editar ${selectedPet.name}` : 'Cadastrar Novo Pet')
                                    : `Pacotes de ${selectedPet?.name}`
                                }
                            </h2>
                            {selectedPet && (
                                <div className={styles.tabButtons}>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('details')}
                                        className={`${styles.tabButton} ${activeTab === 'details' ? styles.activeTab : ''}`}
                                    >
                                        Dados
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('packages')}
                                        className={`${styles.tabButton} ${activeTab === 'packages' ? styles.activeTab : ''}`}
                                    >
                                        Pacotes
                                    </button>
                                </div>
                            )}
                        </div>

                        {activeTab === 'details' ? (
                            <form action={selectedPet ? updateAction : createAction}>
                                {selectedPet && <input type="hidden" name="id" value={selectedPet.id} />}

                                <div className={styles.formGrid}>
                                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                        <label htmlFor="customerId" className={styles.label}>Tutor *</label>
                                        <select
                                            id="customerId" name="customerId" className={styles.select} required
                                            defaultValue={selectedPet?.customer_id || ''}
                                        >
                                            <option value="">Selecione um tutor...</option>
                                            {customers.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                        <label htmlFor="name" className={styles.label}>Nome do Pet *</label>
                                        <input
                                            id="name" name="name" type="text" className={styles.input} required
                                            placeholder="Ex: Rex"
                                            defaultValue={selectedPet?.name || ''}
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label htmlFor="species" className={styles.label}>Espécie *</label>
                                        <select
                                            id="species" name="species" className={styles.select} required
                                            defaultValue={selectedPet?.species || 'dog'}
                                        >
                                            <option value="dog">Cão</option>
                                            <option value="cat">Gato</option>
                                            <option value="other">Outro</option>
                                        </select>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label htmlFor="breed" className={styles.label}>Raça</label>
                                        <input
                                            id="breed" name="breed" type="text" className={styles.input}
                                            placeholder="Ex: Labrador"
                                            defaultValue={selectedPet?.breed || ''}
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label htmlFor="gender" className={styles.label}>Sexo *</label>
                                        <select
                                            id="gender" name="gender" className={styles.select} required
                                            defaultValue={selectedPet?.gender || 'male'}
                                        >
                                            <option value="male">Macho</option>
                                            <option value="female">Fêmea</option>
                                        </select>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label htmlFor="size" className={styles.label}>Porte *</label>
                                        <select
                                            id="size" name="size" className={styles.select} required
                                            defaultValue={selectedPet?.size || 'medium'}
                                        >
                                            <option value="small">Pequeno</option>
                                            <option value="medium">Médio</option>
                                            <option value="large">Grande</option>
                                            <option value="giant">Gigante</option>
                                        </select>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label htmlFor="birthDate" className={styles.label}>Data de Nascimento</label>
                                        <input
                                            id="birthDate" name="birthDate" type="date" className={styles.input}
                                            defaultValue={selectedPet?.birth_date || ''}
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label htmlFor="weight" className={styles.label}>Peso (kg)</label>
                                        <input
                                            id="weight" name="weight" type="number" step="0.1" className={styles.input}
                                            placeholder="0.0"
                                            defaultValue={selectedPet?.weight_kg?.toString() || ''}
                                        />
                                    </div>
                                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                        <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox" name="isNeutered"
                                                defaultChecked={selectedPet?.is_neutered || false}
                                            />
                                            É castrado?
                                        </label>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>
                                            <input
                                                type="checkbox"
                                                name="vaccination_up_to_date"
                                                defaultChecked={selectedPet?.vaccination_up_to_date}
                                                style={{ marginRight: '0.5rem' }}
                                            />
                                            Vacinação em dia
                                        </label>
                                    </div>

                                    <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                                        <label className={styles.label}>Doença Pré-existente</label>
                                        <input
                                            name="existing_conditions"
                                            className={styles.input}
                                            defaultValue={selectedPet?.existing_conditions || ''}
                                            placeholder="Ex: Diabetes, Alergia..."
                                        />
                                    </div>
                                </div>

                                <div className={styles.modalActions} style={{ justifyContent: 'space-between' }}>
                                    <div>
                                        {selectedPet && (
                                            <button
                                                type="button"
                                                className={styles.cancelBtn}
                                                style={{ color: 'red', borderColor: 'red', background: 'rgba(255,0,0,0.05)' }}
                                                onClick={handleDelete}
                                            >
                                                Excluir
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)} disabled={isPending}>
                                            Cancelar
                                        </button>
                                        <button type="submit" className={styles.submitButton} disabled={isPending}>
                                            {isPending ? 'Salvando...' : (selectedPet ? 'Salvar Alterações' : 'Cadastrar Pet')}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        ) : (
                            // PACKAGES TAB
                            <div className={styles.packagesContainer}>
                                <div className={styles.addPackageSection}>
                                    <h3 className={styles.sectionTitle}>Contratar Novo Pacote</h3>
                                    <div className={styles.packageSelection}>
                                        <select
                                            className={styles.select}
                                            value={selectedPackageId}
                                            onChange={e => setSelectedPackageId(e.target.value)}
                                        >
                                            <option value="">Selecione um pacote...</option>
                                            {availablePackages.map(pkg => (
                                                <option key={pkg.id} value={pkg.id}>
                                                    {pkg.name} - R$ {pkg.total_price.toFixed(2)}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className={styles.submitButton}
                                            disabled={!selectedPackageId || isSelling}
                                            onClick={handleSellPackage}
                                        >
                                            {isSelling ? 'Processando...' : 'Contratar'}
                                        </button>
                                    </div>
                                </div>

                                <h3 className={styles.sectionTitle} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                                    Pacotes Ativos & Créditos
                                </h3>

                                {petPackages.length === 0 ? (
                                    <div className={styles.emptyState}>
                                        Nenhum pacote ativo para este pet.
                                    </div>
                                ) : (
                                    <div className={styles.packagesContainer} style={{ marginTop: '0' }}>
                                        {petPackages.map((pkg, index) => {
                                            const total = pkg.total_qty || 0
                                            const used = pkg.used_qty || 0
                                            const rawAppointments = pkg.appointments || []
                                            // Ordenar agendamentos por data (antigo -> recente) para preencher os slots sequencialmente
                                            const appointments = [...rawAppointments].sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

                                            const slots = []
                                            for (let i = 0; i < total; i++) {
                                                let status = 'available'
                                                let appointment = null

                                                if (i < used) {
                                                    status = 'used'
                                                    if (i < appointments.length) {
                                                        appointment = appointments[i]
                                                    }
                                                }
                                                slots.push({ index: i + 1, status, appointment })
                                            }

                                            return (
                                                <div key={`${pkg.customer_package_id}-${pkg.service_id}-${index}`} className={styles.packageCard}
                                                    style={{
                                                        flexDirection: 'column',
                                                        alignItems: 'stretch',
                                                        backgroundColor: pkg.is_expired ? 'rgba(255,0,0,0.05)' : 'var(--bg-secondary)',
                                                        opacity: pkg.is_expired ? 0.7 : 1
                                                    }}
                                                >
                                                    <div className={styles.packageHeader}>
                                                        <div className={styles.packageInfo}>
                                                            <h4>{pkg.service_name}</h4>
                                                            <span className={styles.packageName}>Pacote: {pkg.package_name}</span>
                                                            <div className={styles.packageDate}>
                                                                Validade: {pkg.expires_at ? new Date(pkg.expires_at).toLocaleDateString('pt-BR') : 'Indeterminada'}
                                                            </div>
                                                        </div>
                                                        <div className={styles.creditsInfo} style={{ textAlign: 'right' }}>
                                                            <div className={styles.creditCount} style={{
                                                                color: pkg.remaining_qty > 0 ? 'var(--primary)' : 'var(--text-secondary)'
                                                            }}>
                                                                {pkg.remaining_qty}
                                                                <span style={{ fontSize: '0.5em', fontWeight: '400', verticalAlign: 'middle', marginLeft: '2px' }}>
                                                                    restantes
                                                                </span>
                                                            </div>
                                                            <span className={styles.creditLabel}>
                                                                Total contratado: {pkg.total_qty}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className={styles.slotsContainer}>
                                                        {slots.map(slot => (
                                                            <div key={slot.index} className={`${styles.slotItem} ${slot.status === 'used' ? styles.used : styles.available}`}>
                                                                <span className={styles.slotNumber}>#{slot.index}</span>

                                                                {slot.status === 'used' ? (
                                                                    <>
                                                                        <div style={{ color: 'var(--success, #00c853)', fontSize: '1.2rem', marginBottom: '0.25rem' }}>✓</div>
                                                                        <span className={styles.slotStatus} style={{ color: 'var(--success, #00c853)', fontSize: '0.8rem' }}>Realizado</span>
                                                                        {slot.appointment && (
                                                                            <span className={styles.usedDate}>
                                                                                {new Date(slot.appointment.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '0.25rem', opacity: 0.3 }}>📅</div>
                                                                        <button
                                                                            type="button"
                                                                            className={styles.scheduleBtnSmall}
                                                                            onClick={() => {
                                                                                if (selectedPet) {
                                                                                    router.push(`/owner/calendar?petId=${selectedPet.id}&serviceId=${pkg.service_id}&package=true`)
                                                                                }
                                                                            }}
                                                                        >
                                                                            Agendar
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                <div className={styles.modalActions} style={{ marginTop: 'auto' }}>
                                    <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
