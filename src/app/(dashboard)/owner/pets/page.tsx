'use client'

import { useState, useEffect, useCallback, useActionState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { createPet, updatePet, deletePet } from '@/app/actions/pet'
import { sellPackageToPet, getPetPackagesWithUsage } from '@/app/actions/package'
import { getPetAssessment } from '@/app/actions/petAssessment'
import { getPetAppointmentsByCategory as getPetAppointments } from '@/app/actions/appointment'
import PetAssessmentForm from '@/components/PetAssessmentForm'

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

function PetsContent() {
    const router = useRouter()
    const supabase = createClient()
    const [pets, setPets] = useState<Pet[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [selectedPet, setSelectedPet] = useState<Pet | null>(null)

    // Package States
    const [petPackages, setPetPackages] = useState<any[]>([])
    const [availablePackages, setAvailablePackages] = useState<any[]>([])
    const [selectedPackageId, setSelectedPackageId] = useState('')
    const [isSelling, setIsSelling] = useState(false)

    // Assessment State
    const [petAssessment, setPetAssessment] = useState<any>(null)

    // Server Action State
    const [createState, createAction, isCreatePending] = useActionState(createPet, initialState)
    const [updateState, updateAction, isUpdatePending] = useActionState(updatePet, initialState)

    const isPending = isCreatePending || isUpdatePending

    const calculateAge = (birthDate: string | null) => {
        if (!birthDate) return '-'
        const today = new Date()
        const birth = new Date(birthDate)
        let years = today.getFullYear() - birth.getFullYear()
        let months = today.getMonth() - birth.getMonth()
        if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) {
            years--
            months += 12
        }
        if (years === 0) return `${months} meses`
        if (years === 1) return months > 0 ? `1 ano e ${months} m` : `1 ano`
        return `${years} anos`
    }

    // Accordion State
    const [accordions, setAccordions] = useState({ details: true, packages: false, creche: false, hotel: false, assessment: false })

    const toggleAccordion = async (key: keyof typeof accordions) => {
        setAccordions(prev => {
            const newState = { ...prev, [key]: !prev[key] }

            // Fetch Assessment manually if opening relevant sections
            // We use setTimeout to allow state update or just call async here referencing !prev[key]
            return newState
        })

        const isOpen = !accordions[key]

        if (isOpen && (key === 'assessment' || key === 'creche' || key === 'hotel')) {
            // Only fetch if we have a pet and no assessment yet
            // Wait, selectedPet might be changing? No, accordion toggling happens when pet is selected.
            if (selectedPet && !petAssessment) {
                try {
                    console.log('[DEBUG] Fetching assessment for accordion:', key)
                    const data = await getPetAssessment(selectedPet.id)
                    setPetAssessment(data)
                } catch (error) {
                    console.error('Error fetching assessment:', error)
                }
            }
        }
    }

    const manualCheckAssessment = async () => {
        if (!selectedPet) return
        try {
            const data = await getPetAssessment(selectedPet.id)
            if (data) {
                setPetAssessment(data)
                // Force open sections if needed or just notify
                alert('Avaliação encontrada e carregada!')
            } else {
                alert('Nenhuma avaliação encontrada para este pet.')
            }
        } catch (error) {
            console.error(error)
            alert('Erro ao verificar avaliação.')
        }
    }

    // History State
    // History State
    const [crecheHistory, setCrecheHistory] = useState<any[]>([])
    const [hotelHistory, setHotelHistory] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState('')

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
            let query = supabase
                .from('pets')
                .select(`
                    id, name, species, breed, gender, size, weight_kg, birth_date, is_neutered,
                    existing_conditions, vaccination_up_to_date, customer_id,
                    customers ( id, name )
                `)
                .order('name')

            if (searchTerm) {
                query = query.or(`name.ilike.%${searchTerm}%,breed.ilike.%${searchTerm}%`)
            } else {
                query = query.limit(50)
            }

            const { data: petsData, error: petsError } = await query

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
    }, [supabase, searchTerm])

    // Buscar pacotes do pet quando o accordion muda ou o pet é selecionado
    const fetchPetPackageSummary = useCallback(async () => {
        if (!selectedPet || !accordions.packages) return

        try {
            const data = await getPetPackagesWithUsage(selectedPet.id)
            setPetPackages(data || [])
        } catch (error) {
            console.error('Erro:', error)
        }
    }, [selectedPet, accordions.packages])

    // Buscar histórico de agendamentos
    useEffect(() => {
        if (!selectedPet) return

        if (accordions.creche) {
            getPetAppointments(selectedPet.id, 'Creche').then(setCrecheHistory)
        }
        if (accordions.hotel) {
            getPetAppointments(selectedPet.id, 'Hospedagem').then(setHotelHistory)
        }
    }, [selectedPet, accordions.creche, accordions.hotel])

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

    // Handle return from Agenda (Re-open modal)
    const searchParams = useSearchParams()
    useEffect(() => {
        const openPetId = searchParams.get('openPetId')
        if (openPetId && pets.length > 0 && !selectedPet && !showModal) {
            const pet = pets.find(p => p.id === openPetId)
            if (pet) {
                setSelectedPet(pet)
                setAccordions({ details: true, packages: true, creche: false, hotel: false, assessment: false }) // Open packages when returning from agenda
                setShowModal(true)
                // Clean URL
                const url = new URL(window.location.href)
                url.searchParams.delete('openPetId')
                window.history.replaceState({}, '', url)
            }
        }
    }, [searchParams, pets, selectedPet, showModal])

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

    const handleRowClick = async (pet: Pet) => {
        setSelectedPet(pet)
        setAccordions({ details: true, packages: false, creche: false, hotel: false, assessment: false })

        // Eagerly fetch assessment BEFORE showing modal
        try {
            console.log('[DEBUG] Eagerly fetching assessment for pet:', pet.id)
            const assessmentData = await getPetAssessment(pet.id)
            console.log('[DEBUG] Assessment data received:', assessmentData)
            setPetAssessment(assessmentData)
        } catch (error) {
            console.error('Error fetching assessment:', error)
            setPetAssessment(null)
        }

        setShowModal(true)
    }

    const handleNewPet = () => {
        setSelectedPet(null)
        setPetAssessment(null)
        setAccordions({ details: true, packages: false, creche: false, hotel: false, assessment: false })
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

            <div style={{ marginBottom: '1rem' }}>
                <input
                    type="text"
                    placeholder="🔍 Buscar pet por nome ou raça..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.input}
                    style={{ maxWidth: '400px' }}
                />
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
                                        {calculateAge(pet.birth_date)}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                            <h2 style={{ margin: 0 }}>
                                {selectedPet ? `Ficha Pet: ${selectedPet.name}` : 'Novo Pet'}
                            </h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '2rem', lineHeight: '1rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                &times;
                            </button>
                        </div>

                        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 100px)', paddingRight: '0.5rem' }}>

                            {/* 1. DADOS CADASTRAIS */}
                            <div className={styles.accordionItem} style={{ borderBottom: '1px solid var(--border)', marginBottom: '0.5rem' }}>
                                <button type="button" onClick={() => toggleAccordion('details')} style={{ width: '100%', padding: '1rem', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', fontWeight: '600', color: 'var(--text-primary)', borderRadius: '8px', alignItems: 'center' }}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>👤 Dados Cadastrais</span>
                                    <span>{accordions.details ? '−' : '+'}</span>
                                </button>
                                {accordions.details && (
                                    <div style={{ padding: '1rem' }}>
                                        <form action={selectedPet ? updateAction : createAction}>
                                            {selectedPet && <input type="hidden" name="id" value={selectedPet.id} />}
                                            <div className={styles.formGrid}>
                                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                                    <label htmlFor="customerId" className={styles.label}>Tutor *</label>
                                                    <select id="customerId" name="customerId" className={styles.select} required defaultValue={selectedPet?.customer_id || ''}>
                                                        <option value="">Selecione um tutor...</option>
                                                        {customers.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                                                    </select>
                                                </div>
                                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                                    <label htmlFor="name" className={styles.label}>Nome do Pet *</label>
                                                    <input id="name" name="name" type="text" className={styles.input} required placeholder="Ex: Rex" defaultValue={selectedPet?.name || ''} />
                                                </div>

                                                <div className={styles.formGroup}>
                                                    <label htmlFor="species" className={styles.label}>Espécie *</label>
                                                    <select id="species" name="species" className={styles.select} required defaultValue={selectedPet?.species || 'dog'}>
                                                        <option value="dog">Cão</option>
                                                        <option value="cat">Gato</option>
                                                        <option value="other">Outro</option>
                                                    </select>
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label htmlFor="breed" className={styles.label}>Raça</label>
                                                    <input id="breed" name="breed" type="text" className={styles.input} defaultValue={selectedPet?.breed || ''} placeholder="Ex: Labrador" />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label htmlFor="gender" className={styles.label}>Sexo *</label>
                                                    <select id="gender" name="gender" className={styles.select} required defaultValue={selectedPet?.gender || 'male'}>
                                                        <option value="male">Macho</option>
                                                        <option value="female">Fêmea</option>
                                                    </select>
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label htmlFor="size" className={styles.label}>Porte *</label>
                                                    <select id="size" name="size" className={styles.select} required defaultValue={selectedPet?.size || 'medium'}>
                                                        <option value="small">Pequeno</option>
                                                        <option value="medium">Médio</option>
                                                        <option value="large">Grande</option>
                                                        <option value="giant">Gigante</option>
                                                    </select>
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label htmlFor="birthDate" className={styles.label}>Data de Nascimento</label>
                                                    <input id="birthDate" name="birthDate" type="date" className={styles.input} defaultValue={selectedPet?.birth_date || ''} />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label htmlFor="weight" className={styles.label}>Peso (kg)</label>
                                                    <input id="weight" name="weight" type="number" step="0.1" className={styles.input} defaultValue={selectedPet?.weight_kg?.toString() || ''} placeholder="0.0" />
                                                </div>
                                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                                    <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                        <input type="checkbox" name="isNeutered" defaultChecked={selectedPet?.is_neutered || false} /> É castrado?
                                                    </label>
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                        <input type="checkbox" name="vaccination_up_to_date" defaultChecked={selectedPet?.vaccination_up_to_date} /> Vacinação em dia
                                                    </label>
                                                </div>
                                                <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                                                    <label className={styles.label}>Doença Pré-existente</label>
                                                    <input name="existing_conditions" className={styles.input} defaultValue={selectedPet?.existing_conditions || ''} placeholder="Ex: Diabetes, Alergia..." />
                                                </div>
                                            </div>
                                            <div className={styles.modalActions} style={{ justifyContent: 'space-between', marginTop: '1rem' }}>
                                                <div>
                                                    {selectedPet && (
                                                        <button type="button" className={styles.cancelBtn} style={{ color: 'red', borderColor: 'red', background: 'rgba(255,0,0,0.05)' }} onClick={handleDelete}>Excluir</button>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '1rem' }}>
                                                    <button type="submit" className={styles.submitButton} disabled={isPending}>
                                                        {isPending ? 'Salvando...' : (selectedPet ? 'Salvar Alterações' : 'Cadastrar Pet')}
                                                    </button>
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                )}
                            </div>

                            {/* 2. Banho e Tosa */}
                            <div className={styles.accordionItem} style={{ borderBottom: '1px solid var(--border)', marginBottom: '0.5rem' }}>
                                <button type="button" onClick={() => toggleAccordion('packages')} style={{ width: '100%', padding: '1rem', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', fontWeight: '600', color: 'var(--text-primary)', borderRadius: '8px', alignItems: 'center' }}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>🚿 Banho e Tosa / Pacotes</span>
                                    <span>{accordions.packages ? '−' : '+'}</span>
                                </button>
                                {accordions.packages && (
                                    <div style={{ padding: '1rem' }}>
                                        {selectedPet ? (
                                            <>
                                                <div className={styles.addPackageSection}>
                                                    <h3 className={styles.sectionTitle}>Contratar Novo Pacote</h3>
                                                    <div className={styles.packageSelection}>
                                                        <select className={styles.select} value={selectedPackageId} onChange={e => setSelectedPackageId(e.target.value)}>
                                                            <option value="">Selecione um pacote...</option>
                                                            {availablePackages.map(pkg => (<option key={pkg.id} value={pkg.id}>{pkg.name} - R$ {pkg.total_price.toFixed(2)}</option>))}
                                                        </select>
                                                        <button type="button" className={styles.submitButton} disabled={!selectedPackageId || isSelling} onClick={handleSellPackage}>
                                                            {isSelling ? 'Processando...' : 'Contratar'}
                                                        </button>
                                                    </div>
                                                </div>
                                                <h3 className={styles.sectionTitle} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginTop: '1rem' }}>Pacotes Ativos & Créditos</h3>

                                                {petPackages.length === 0 ? (
                                                    <div className={styles.emptyState}>Nenhum pacote ativo para este pet.</div>
                                                ) : (
                                                    <div className={styles.packagesContainer} style={{ marginTop: '0' }}>
                                                        {petPackages.map((pkg, index) => {
                                                            const total = pkg.total_qty || 0
                                                            const used = pkg.used_qty || 0
                                                            const rawAppointments = pkg.appointments || []
                                                            const appointments = [...rawAppointments].sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                                                            const slots = []
                                                            for (let i = 0; i < total; i++) {
                                                                let status = 'available'
                                                                let appointment = null
                                                                if (i < appointments.length) { appointment = appointments[i]; status = appointment.status === 'done' ? 'used' : 'scheduled' }
                                                                else if (i < used) { status = 'used' }
                                                                slots.push({ index: i + 1, status, appointment })
                                                            }
                                                            return (
                                                                <div key={`${pkg.customer_package_id}-${pkg.service_id}-${index}`} className={styles.packageCard} style={{ flexDirection: 'column', alignItems: 'stretch', backgroundColor: pkg.is_expired ? 'rgba(255,0,0,0.05)' : 'var(--bg-secondary)', opacity: pkg.is_expired ? 0.7 : 1 }}>
                                                                    <div className={styles.packageHeader}>
                                                                        <div className={styles.packageInfo}>
                                                                            <h4>{pkg.service_name}</h4>
                                                                            <span className={styles.packageName}>Pacote: {pkg.package_name}</span>
                                                                            <div className={styles.packageDate}>Validade: {pkg.expires_at ? new Date(pkg.expires_at).toLocaleDateString('pt-BR') : 'Indeterminada'}</div>
                                                                        </div>
                                                                        <div className={styles.creditsInfo} style={{ textAlign: 'right' }}>
                                                                            <div className={styles.creditCount} style={{ color: pkg.remaining_qty > 0 ? 'var(--primary)' : 'var(--text-secondary)' }}>{pkg.remaining_qty}<span style={{ fontSize: '0.5em', fontWeight: '400', verticalAlign: 'middle', marginLeft: '2px' }}>restantes</span></div>
                                                                            <span className={styles.creditLabel}>Total contratado: {pkg.total_qty}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className={styles.slotsContainer}>
                                                                        {slots.map(slot => (
                                                                            <div key={slot.index} className={`${styles.slotItem} ${slot.status === 'used' ? styles.used : slot.status === 'scheduled' ? styles.scheduled : styles.available}`} style={slot.status === 'scheduled' ? { borderColor: 'var(--primary)', backgroundColor: 'rgba(59, 130, 246, 0.05)' } : {}}>
                                                                                <span className={styles.slotNumber}>#{slot.index}</span>
                                                                                {slot.status === 'used' ? (
                                                                                    <>
                                                                                        <div style={{ color: 'var(--success, #00c853)', fontSize: '1.2rem', marginBottom: '0.25rem' }}>✓</div>
                                                                                        <span className={styles.slotStatus} style={{ color: 'var(--success, #00c853)', fontSize: '0.8rem' }}>Realizado</span>
                                                                                        {slot.appointment && <span className={styles.usedDate}>{new Date(slot.appointment.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>}
                                                                                    </>
                                                                                ) : slot.status === 'scheduled' ? (
                                                                                    <>
                                                                                        <div style={{ color: 'var(--primary)', fontSize: '1.2rem', marginBottom: '0.25rem' }}>🕒</div>
                                                                                        <span className={styles.slotStatus} style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>Agendado</span>
                                                                                        {slot.appointment && <span className={styles.usedDate} style={{ color: 'var(--text-primary)' }}>{new Date(slot.appointment.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}<br />{new Date(slot.appointment.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '0.25rem', opacity: 0.3 }}>📅</div>
                                                                                        <button type="button" className={styles.scheduleBtnSmall} onClick={() => { if (selectedPet) { const returnUrl = encodeURIComponent(`/owner/pets?openPetId=${selectedPet.id}`); router.push(`/owner/agenda?petId=${selectedPet.id}&serviceId=${pkg.service_id}&package=true&returnUrl=${returnUrl}`) } }}>Agendar</button>
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
                                            </>
                                        ) : (
                                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Salve o pet primeiro para gerenciar pacotes.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {/* 3. Creche */}
                            <div className={styles.accordionItem} style={{ borderBottom: '1px solid var(--border)', marginBottom: '0.5rem' }}>
                                <button type="button" onClick={() => toggleAccordion('creche')} style={{ width: '100%', padding: '1rem', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', fontWeight: '600', color: 'var(--text-primary)', borderRadius: '8px', alignItems: 'center' }}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>🎾 Agendar Creche</span>
                                    <span>{accordions.creche ? '−' : '+'}</span>
                                </button>
                                {accordions.creche && (
                                    <div style={{ padding: '1rem' }}>
                                        {selectedPet ? (
                                            <>
                                                {/* Check Assessment */}
                                                {!petAssessment ? (
                                                    <div style={{ padding: '1rem', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '1rem', color: '#92400E' }}>
                                                        <strong>⚠️ Avaliação Pendente</strong>
                                                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>É necessário preencher a Avaliação Comportamental antes de agendar creche.</p>
                                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
                                                            <button
                                                                onClick={() => toggleAccordion('assessment')}
                                                                style={{ background: 'none', border: 'none', color: '#D97706', textDecoration: 'underline', cursor: 'pointer' }}>
                                                                Ir para Avaliação
                                                            </button>
                                                            <button
                                                                onClick={manualCheckAssessment}
                                                                style={{ padding: '0.25rem 0.5rem', background: '#F59E0B', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                                🔄 Verificar Novamente
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <button
                                                            onClick={() => router.push(`/owner/agenda?petId=${selectedPet.id}&category=Creche&mode=new`)}
                                                            className={styles.submitButton}
                                                            style={{ width: '100%' }}>
                                                            + Novo Agendamento de Creche
                                                        </button>
                                                    </div>
                                                )}

                                                <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Histórico Recente</h4>
                                                {crecheHistory.length === 0 ? (
                                                    <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Nenhum agendamento recente.</p>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {crecheHistory.map((appt: any) => (
                                                            <div key={appt.id} style={{ padding: '0.75rem', borderRadius: '6px', background: 'var(--bg-secondary)', borderLeft: `4px solid #10B981` }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                    <span style={{ fontWeight: 600 }}>{new Date(appt.scheduled_at).toLocaleDateString('pt-BR')}</span>
                                                                    <span style={{ fontSize: '0.85rem' }}>{appt.status}</span>
                                                                </div>
                                                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{new Date(appt.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Salve o pet primeiro.</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 4. Hospedagem */}
                            <div className={styles.accordionItem} style={{ borderBottom: '1px solid var(--border)', marginBottom: '0.5rem' }}>
                                <button type="button" onClick={() => toggleAccordion('hotel')} style={{ width: '100%', padding: '1rem', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', fontWeight: '600', color: 'var(--text-primary)', borderRadius: '8px', alignItems: 'center' }}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>🏨 Agendar Hospedagem</span>
                                    <span>{accordions.hotel ? '−' : '+'}</span>
                                </button>
                                {accordions.hotel && (
                                    <div style={{ padding: '1rem' }}>
                                        {selectedPet ? (
                                            <>
                                                {/* Check Assessment */}
                                                {!petAssessment ? (
                                                    <div style={{ padding: '1rem', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '1rem', color: '#92400E' }}>
                                                        <strong>⚠️ Avaliação Pendente</strong>
                                                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>É necessário preencher a Avaliação Comportamental antes de agendar hospedagem.</p>
                                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
                                                            <button
                                                                onClick={() => toggleAccordion('assessment')}
                                                                style={{ background: 'none', border: 'none', color: '#D97706', textDecoration: 'underline', cursor: 'pointer' }}>
                                                                Ir para Avaliação
                                                            </button>
                                                            <button
                                                                onClick={manualCheckAssessment}
                                                                style={{ padding: '0.25rem 0.5rem', background: '#F59E0B', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                                                🔄 Verificar Novamente
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <button
                                                            onClick={() => router.push(`/owner/agenda?petId=${selectedPet.id}&category=Hospedagem&mode=new`)}
                                                            className={styles.submitButton}
                                                            style={{ width: '100%' }}>
                                                            + Novo Agendamento de Hospedagem
                                                        </button>
                                                    </div>
                                                )}

                                                <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Histórico Recente</h4>
                                                {hotelHistory.length === 0 ? (
                                                    <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Nenhum agendamento recente.</p>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {hotelHistory.map((appt: any) => {
                                                            const isRange = appt.check_in_date && appt.check_out_date
                                                            return (
                                                                <div key={appt.id} style={{ padding: '0.75rem', borderRadius: '6px', background: 'var(--bg-secondary)', borderLeft: `4px solid #F59E0B` }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                        <span style={{ fontWeight: 600 }}>
                                                                            {isRange
                                                                                ? `${new Date(appt.check_in_date).toLocaleDateString('pt-BR')} - ${new Date(appt.check_out_date).toLocaleDateString('pt-BR')}`
                                                                                : new Date(appt.scheduled_at).toLocaleDateString('pt-BR')
                                                                            }
                                                                        </span>
                                                                        <span style={{ fontSize: '0.85rem' }}>{appt.status}</span>
                                                                    </div>
                                                                    {!isRange && <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{new Date(appt.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Salve o pet primeiro.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className={styles.accordionItem} style={{ borderBottom: '1px solid var(--border)', marginBottom: '0.5rem' }}>
                                <button type="button" onClick={() => toggleAccordion('assessment')} style={{ width: '100%', padding: '1rem', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer', fontWeight: '600', color: 'var(--text-primary)', borderRadius: '8px', alignItems: 'center' }}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>📋 Avaliação Comportamental / Saúde</span>
                                    <span>{accordions.assessment ? '−' : '+'}</span>
                                </button>
                                {accordions.assessment && (
                                    <div style={{ padding: '1rem' }}>
                                        {selectedPet ? (
                                            <>
                                                {petAssessment ? (
                                                    <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', marginBottom: '1rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10B981', fontWeight: '600', marginBottom: '0.5rem' }}>
                                                            ✓ Avaliação preenchida
                                                        </div>
                                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                                                            Pet avaliado em {new Date(petAssessment.created_at).toLocaleDateString('pt-BR')}
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPetAssessment(null)}
                                                            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                                        >
                                                            Editar Avaliação
                                                        </button>
                                                    </div>
                                                ) : null}

                                                {!petAssessment && (
                                                    <>
                                                        <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px', marginBottom: '1rem' }}>
                                                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                                                                ℹ️ Para poder agendar serviços de <strong>Creche</strong> ou <strong>Hospedagem</strong>, é necessário preencher a avaliação comportamental e de saúde do pet.
                                                            </p>
                                                        </div>
                                                        <PetAssessmentForm
                                                            petId={selectedPet.id}
                                                            existingData={petAssessment}
                                                            onSuccess={async () => {
                                                                // Force update parent state immediately
                                                                const data = await getPetAssessment(selectedPet.id)
                                                                setPetAssessment(data)
                                                            }}
                                                        />
                                                    </>
                                                )}
                                            </>
                                        ) : (
                                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                                Salve o pet primeiro para preencher a avaliação.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    <div className={styles.modalActions} style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>
                            Fechar
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function PetsPage() {
    return (
        <Suspense fallback={<div>Carregando...</div>}>
            <PetsContent />
        </Suspense>
    )
}
