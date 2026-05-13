
'use client'

import { useState, useEffect, useCallback, useActionState, Suspense, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { createPet, updatePet, deletePet, updatePetVaccineCard, searchPets } from '@/app/actions/pet'
import { sellPackageToPet, getPetPackagesWithUsage, deleteCustomerPackage, updatePackageAutoRenew } from '@/app/actions/package'
import { getPetAssessment } from '@/app/actions/petAssessment'
import { getPetAppointmentsByCategory as getPetAppointments } from '@/app/actions/appointment'
import { getPetshopHistory, payPetshopSale } from '@/app/actions/petshop'
import { createVaccine, deleteVaccine, getPetVaccines } from '@/app/actions/vaccine'
import PetAssessmentForm from '@/components/PetAssessmentForm'
import ImageUpload from '@/components/ImageUpload'
import PackagePaymentControls from '@/components/PackagePaymentControls'
import { maskPhone, getWhatsAppLink } from '@/utils/mask'
import BookingModal from '@/components/BookingModal'

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
    responsible2_name: string | null
    responsible2_phone: string | null
    // vaccination_up_to_date: boolean (remodelado: removido da UI)
    customer_id: string
    customers: { id: string, name: string, phone_1: string | null } | null
    photo_url?: string | null
    vaccine_card_urls?: string[] | null
    is_adapted?: boolean
    color?: string | null
    characteristics?: string | null
}

interface Customer {
    id: string
    name: string
    phone_1: string | null
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
    const [prefWeekdays, setPrefWeekdays] = useState<number[]>([])
    const [prefTime, setPrefTime] = useState('')
    const [scheduleStartDate, setScheduleStartDate] = useState('') // Data de início das sessões
    const [hasTaxiPackage, setHasTaxiPackage] = useState(false)
    const [taxiFeePackage, setTaxiFeePackage] = useState(0)
    const [isAutoSchedule, setIsAutoSchedule] = useState(true)
    const [isAutoRenew, setIsAutoRenew] = useState(true)
    const [petSlots, setPetSlots] = useState<Record<string, any[]>>({})
    const [expandedSlotPackage, setExpandedSlotPackage] = useState<string | null>(null)
    const [reschedulingSlot, setReschedulingSlot] = useState<any | null>(null)
    const [slotNewDate, setSlotNewDate] = useState('')
    const [slotNewTime, setSlotNewTime] = useState('')
    
    // Pagination
    const [displayLimit, setDisplayLimit] = useState(50)
    const [hasMore, setHasMore] = useState(false)

    // Vaccine State
    const [vaccines, setVaccines] = useState<any[]>([])
    const [isVaccineLoading, setIsVaccineLoading] = useState(false)

    // Assessment State
    const [petAssessment, setPetAssessment] = useState<any>(null)
    const [isViewingAssessment, setIsViewingAssessment] = useState(false)
    const [isEditingAssessment, setIsEditingAssessment] = useState(false)

    // Booking Modal States
    const [showBookingModal, setShowBookingModal] = useState(false)
    const [bookingCategory, setBookingCategory] = useState<string | undefined>(undefined)
    const [allServices, setAllServices] = useState<any[]>([])
    const [scheduleBlocks, setScheduleBlocks] = useState<any[]>([])

    // Server Action State
    const [createState, createAction, isCreatePending] = useActionState(createPet, initialState)
    const [updateState, updateAction, isUpdatePending] = useActionState(updatePet, initialState)
    const [responsible2Phone, setResponsible2Phone] = useState('')
    const [selectedCustomerId, setSelectedCustomerId] = useState('')
    const [expandedVaccineCard, setExpandedVaccineCard] = useState<string | null>(null)

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
    const [accordions, setAccordions] = useState({ details: false, bathGrooming: false, packages: false, creche: false, hotel: false, assessment: false, vaccines: false, petshop: false })

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
    const [crecheHistory, setCrecheHistory] = useState<any[]>([])
    const [hotelHistory, setHotelHistory] = useState<any[]>([])
    const [bathHistory, setBathHistory] = useState<any[]>([])
    const [petshopHistory, setPetshopHistory] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    // Debounce search term
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm)
        }, 500)
        return () => clearTimeout(timer)
    }, [searchTerm])

    const fetchData = useCallback(async (isInitial = false) => {
        try {
            if (isInitial) setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', user.id)
                .single()

            if (!profile?.org_id) return

            // Fetch Services and Blocks once (cached in ref or state)
            if (allServices.length === 0) {
                const { data: s } = await supabase
                    .from('services')
                    .select('id, name, duration_minutes, base_price, category_id, target_species, scheduling_rules, service_categories (id, name, color, icon)')
                    .eq('org_id', profile.org_id)
                    .order('name')
                if (s) setAllServices(s as any)

                const { data: blks } = await supabase
                    .from('schedule_blocks')
                    .select('*')
                    .eq('org_id', profile.org_id)
                if (blks) setScheduleBlocks(blks)
            }

            // Fetch Pets
            let query = supabase
                .from('pets')
                .select(`
                    id, name, species, breed, gender, size, weight_kg, birth_date, is_neutered,
                    existing_conditions, responsible2_name, responsible2_phone, vaccination_up_to_date, customer_id, photo_url, vaccine_card_urls, is_adapted,
                    color, characteristics,
                    customers ( id, name, phone_1 )
                `)
                .order('name')

            if (debouncedSearch) {
                query = query.or(`name.ilike.%${debouncedSearch}%,breed.ilike.%${debouncedSearch}%`)
            } else {
                query = query.limit(displayLimit + 1)
            }

            const { data: petsData, error: petsError } = await query

            if (petsError) throw petsError

            let finalPets = petsData || []
            if (!debouncedSearch && finalPets.length > displayLimit) {
                setHasMore(true)
                finalPets = finalPets.slice(0, displayLimit)
            } else {
                setHasMore(false)
            }


            if (finalPets) setPets(finalPets as unknown as Pet[])

            // Fetch Customers for select
            const { data: customersData, error: customersError } = await supabase
                .from('customers')
                .select('id, name, phone_1')
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

            if (customersData) setCustomers(customersData)
            if (packagesData) setAvailablePackages(packagesData)

        } catch (error) {
            console.error('Erro ao buscar dados:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase, debouncedSearch, displayLimit])

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

    // Buscar vacinas
    useEffect(() => {
        if (!selectedPet || !accordions.vaccines) return
        setIsVaccineLoading(true)
        getPetVaccines(selectedPet.id)
            .then(setVaccines)
            .finally(() => setIsVaccineLoading(false))
    }, [selectedPet, accordions.vaccines])

    // Buscar histórico de agendamentos
    useEffect(() => {
        if (!selectedPet) return

        if (accordions.creche) {
            getPetAppointments(selectedPet.id, 'Creche').then(setCrecheHistory)
        }
        if (accordions.hotel) {
            getPetAppointments(selectedPet.id, 'Hospedagem').then(setHotelHistory)
        }
        if (accordions.bathGrooming) {
            getPetAppointments(selectedPet.id, 'Banho e Tosa').then(setBathHistory)
        }
        if (accordions.petshop) {
            getPetshopHistory(selectedPet.id).then(res => setPetshopHistory(res.data || []))
        }
    }, [selectedPet, accordions.creche, accordions.hotel, accordions.bathGrooming, accordions.petshop])

    const isFirstRender = useRef(true)

    useEffect(() => {
        fetchData(isFirstRender.current)
        if (isFirstRender.current) isFirstRender.current = false
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
    }, [createState]) // Removido fetchData das dependências para evitar múltiplos alertas ao buscar

    // Handle return from Agenda (Re-open modal)
    const searchParams = useSearchParams()
    useEffect(() => {
        const openPetId = searchParams.get('openPetId')
        if (openPetId && pets.length > 0 && !selectedPet && !showModal) {
            const pet = pets.find(p => p.id === openPetId)
            if (pet) {
                setSelectedPet(pet)
                setAccordions({ details: true, bathGrooming: false, packages: true, creche: false, hotel: false, assessment: false, vaccines: false, petshop: false }) // Open packages when returning from agenda
                setShowModal(true)
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
    }, [updateState]) // Removido fetchData das dependências para evitar múltiplos alertas ao buscar

    const handleRowClick = async (pet: Pet) => {
        setSelectedPet(pet)
        setIsViewingAssessment(false)
        setIsEditingAssessment(false)
        setAccordions({ details: false, bathGrooming: false, packages: false, creche: false, hotel: false, assessment: false, vaccines: false, petshop: false })

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

        setSelectedCustomerId(pet.customer_id)
        setResponsible2Phone(pet.responsible2_phone || '')
        setShowModal(true)
    }

    const handleOpenBooking = (category: string) => {
        setBookingCategory(category)
        setShowBookingModal(true)
    }

    const handleNewPet = () => {
        setSelectedPet(null)
        setPetAssessment(null)
        setIsViewingAssessment(false)
        setIsEditingAssessment(false)
        setAccordions({ details: true, bathGrooming: false, packages: false, creche: false, hotel: false, assessment: false, vaccines: false, petshop: false })
        setResponsible2Phone('')
        setSelectedCustomerId('')
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
        const weekdaysNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
        const selectedDaysNames = prefWeekdays.sort().map(d => weekdaysNames[d]).join(', ')
        const autoInfo = isAutoSchedule && prefWeekdays.length > 0
            ? ` | Dias: ${selectedDaysNames} às ${prefTime || '09:00'}`
            : ' | Agendamento manual'
        const taxiInfo = hasTaxiPackage ? ` | Taxi Dog: R$ ${taxiFeePackage.toFixed(2)}` : ''
        const renewInfo = isAutoRenew ? ' | Renovação automática: Sim' : ' | Renovação automática: Não'
        const finalTotal = pkg.total_price + (hasTaxiPackage ? taxiFeePackage : 0)
        
        if (isAutoSchedule && prefWeekdays.length === 0) {
            alert('Por favor, selecione pelo menos um dia da semana para o agendamento automático.')
            return
        }

        if (!confirm(`Confirmar contratação do pacote "${pkg.name}" para ${selectedPet.name} por R$ ${finalTotal.toFixed(2)}?${autoInfo}${taxiInfo}${renewInfo}`)) return

        setIsSelling(true)
        try {
            const res = await sellPackageToPet(
                selectedPet.id,
                selectedPackageId,
                pkg.total_price,
                'other',
                isAutoSchedule && prefWeekdays.length > 0 ? prefWeekdays : undefined,
                isAutoSchedule && prefTime ? prefTime : undefined,
                isAutoSchedule && prefWeekdays.length > 0,
                hasTaxiPackage,
                taxiFeePackage,
                isAutoSchedule && scheduleStartDate ? scheduleStartDate : undefined,
                isAutoRenew
            )

            if (res.success) {
                alert(res.message)
                fetchPetPackageSummary()
                setSelectedPackageId('')
                setPrefWeekdays([])
                setPrefTime('')
                setScheduleStartDate('')
                setIsAutoSchedule(false)
                setHasTaxiPackage(false)
                setTaxiFeePackage(0)
                setIsAutoRenew(true)
            } else {
                alert(res.message)
            }
        } catch (error) {
            console.error(error)
            alert('Erro ao contratar pacote.')
        } finally {
            setIsSelling(false)
        }
    }

    const handleDeleteCustomerPackage = async (customerPackageId: string) => {
        if (!confirm('Deseja realmente EXCLUIR este pacote? Todos os créditos, sessões e agendamentos vinculados a este pacote poderão ser afetados ou cancelados. Esta ação não pode ser desfeita.')) return;

        try {
            const res = await deleteCustomerPackage(customerPackageId)
            if (res.success) {
                alert(res.message)
                fetchPetPackageSummary()
            } else {
                alert('Erro ao excluir: ' + res.message)
            }
        } catch (error) {
            console.error(error)
            alert('Erro inesperado ao excluir o pacote. Tente novamente.')
        }
    }

    const handleToggleAutoRenew = async (customerPackageId: string, currentValue: boolean) => {
        const res = await updatePackageAutoRenew(customerPackageId, !currentValue)
        if (res.success) {
            fetchPetPackageSummary()
        } else {
            alert(res.message)
        }
    }

    const fetchSlotsForPackage = async (customerPackageId: string) => {
        try {
            const { getPackageSlotsHistory } = await import('@/app/actions/package')
            const slots = await getPackageSlotsHistory(customerPackageId)
            setPetSlots(prev => ({ ...prev, [customerPackageId]: slots }))
        } catch (e) {
            console.error(e)
        }
    }

    const handleRescheduleSlot = async () => {
        if (!reschedulingSlot || !slotNewDate) return
        const { reschedulePackageSlot } = await import('@/app/actions/package')
        const res = await reschedulePackageSlot(reschedulingSlot.id, slotNewDate, slotNewTime || '09:00')
        if (res.success) {
            alert(res.message)
            fetchSlotsForPackage(reschedulingSlot.customer_package_id)
            setReschedulingSlot(null)
        } else {
            alert(res.message)
        }
    }

    if (loading && pets.length === 0) {
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

            <div className={styles.actionGroup || ''} style={{ marginBottom: '1rem', width: '100%' }}>
                <input
                    type="text"
                    placeholder="🔍 Buscar pet por nome ou raça..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.input}
                    style={{ width: '100%', maxWidth: '100%' }}
                />
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Pet</th>
                            <th>Responsável 1</th>
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
                                            {pet.photo_url ? (
                                                <img
                                                    src={pet.photo_url}
                                                    alt={pet.name}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                                />
                                            ) : (
                                                pet.species === 'cat' ? '🐱' : '🐶'
                                            )}
                                        </div>
                                        <div>
                                            <span className={styles.itemName}>{pet.name}</span>
                                            <span className={styles.itemSub}>{pet.breed || 'Sem raça definida'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div className={styles.itemName} style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {pet.customers?.name || 'Responsável não encontrado'}
                                        {pet.customers?.phone_1 && (
                                            <a 
                                                href={getWhatsAppLink(pet.customers.phone_1) || '#'} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                title="Abrir WhatsApp"
                                                style={{ color: '#25D366', display: 'flex', alignItems: 'center' }}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                                                </svg>
                                            </a>
                                        )}
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
                                        {pet.color && ` • ${pet.color}`}
                                        {pet.characteristics && (
                                            <div style={{ fontSize: '0.75rem', marginTop: '4px', fontStyle: 'italic', opacity: 0.8 }}>
                                                "{pet.characteristics}"
                                            </div>
                                        )}
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
                {hasMore && !debouncedSearch && (
                    <div style={{ textAlign: 'center', padding: '1.5rem', borderTop: '1px solid var(--border)' }}>
                        <button 
                            onClick={() => setDisplayLimit(prev => prev + 50)}
                            className={styles.backLink}
                            style={{ background: 'var(--bg-tertiary)', padding: '0.6rem 2rem', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border)' }}
                        >
                            ⬇️ Carregar mais pets...
                        </button>
                    </div>
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
                            <div className={styles.accordionItem}>
                                <button type="button" onClick={() => toggleAccordion('details')} className={styles.accordionHeader}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>👤 Dados Cadastrais</span>
                                    <span>{accordions.details ? '−' : '+'}</span>
                                </button>
                                {accordions.details && (
                                    <div className={styles.accordionContent}>
                                        <form action={selectedPet ? updateAction : createAction}>
                                            {selectedPet && <input type="hidden" name="id" value={selectedPet.id} />}
                                            <div className={styles.formGrid}>
                                                <div className={styles.formGroup} style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                                                    <ImageUpload
                                                        bucket="pets"
                                                        url={selectedPet?.photo_url || null}
                                                        onUpload={(url) => {
                                                            const input = document.getElementById('photo_url_input') as HTMLInputElement;
                                                            if (input) input.value = url;
                                                        }}
                                                        onRemove={() => {
                                                            const input = document.getElementById('photo_url_input') as HTMLInputElement;
                                                            if (input) input.value = '';
                                                        }}
                                                        label="Foto do Pet"
                                                        circle={true}
                                                        aspect={1}
                                                    />
                                                    <input type="hidden" id="photo_url_input" name="photo_url" defaultValue={selectedPet?.photo_url || ''} />
                                                    <input type="hidden" id="vaccine_card_urls_input" name="vaccine_card_urls" defaultValue={JSON.stringify(selectedPet?.vaccine_card_urls || [])} />
                                                </div>

                                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                                    <label htmlFor="customerId" className={styles.label}>Responsável 1 (puxa do cadastro) *</label>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                        <select
                                                            id="customerId"
                                                            name="customerId"
                                                            className={styles.select}
                                                            required
                                                            value={selectedCustomerId}
                                                            onChange={(e) => setSelectedCustomerId(e.target.value)}
                                                        >
                                                            <option value="">Selecione um responsável...</option>
                                                            {customers.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                                                        </select>
                                                        <div className={styles.input} style={{ backgroundColor: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', opacity: 0.8 }}>
                                                            📞 {customers.find(c => c.id === selectedCustomerId)?.phone_1 || 'Sem telefone'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={styles.formGroup}>
                                                    <label htmlFor="responsible2_name" className={styles.label}>Responsável 2 (Nome)</label>
                                                    <input id="responsible2_name" name="responsible2_name" type="text" className={styles.input} defaultValue={selectedPet?.responsible2_name || ''} placeholder="Ex: Maria" />
                                                </div>

                                                <div className={styles.formGroup}>
                                                    <label htmlFor="responsible2_phone" className={styles.label}>Responsável 2 (Celular)</label>
                                                    <input
                                                        id="responsible2_phone"
                                                        name="responsible2_phone"
                                                        type="text"
                                                        className={styles.input}
                                                        value={responsible2Phone}
                                                        onChange={(e) => setResponsible2Phone(maskPhone(e.target.value))}
                                                        placeholder="Ex: (11) 99999-9999"
                                                    />
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
                                                    <label htmlFor="birthDate" className={styles.label}>Data de Nascimento (Opcional)</label>
                                                    <input id="birthDate" name="birthDate" type="date" className={styles.input} defaultValue={selectedPet?.birth_date || ''} />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label htmlFor="weight" className={styles.label}>Peso (kg)</label>
                                                    <input id="weight" name="weight" type="number" step="0.1" className={styles.input} defaultValue={selectedPet?.weight_kg?.toString() || ''} placeholder="0.0" />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label htmlFor="color" className={styles.label}>Cor</label>
                                                    <input id="color" name="color" type="text" className={styles.input} defaultValue={selectedPet?.color || ''} placeholder="Ex: Caramelo, Preto..." />
                                                </div>
                                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                                    <label htmlFor="characteristics" className={styles.label}>Características</label>
                                                    <textarea id="characteristics" name="characteristics" className={styles.input} defaultValue={selectedPet?.characteristics || ''} placeholder="Ex: Dócil, agitado, gosta de outros cães..." rows={2} style={{ resize: 'none' }} />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                        <input type="checkbox" name="isNeutered" defaultChecked={selectedPet?.is_neutered || false} /> É castrado?
                                                    </label>
                                                </div>
                                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                                    <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--accent)' }}>
                                                        <input type="checkbox" name="is_adapted" defaultChecked={selectedPet?.is_adapted || false} />
                                                        Adaptação Realizada (Necessário para Creche/Hotel)
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

                            {/* 1.1 VACINAS */}
                            <div className={styles.accordionItem}>
                                <button type="button" onClick={() => toggleAccordion('vaccines')} className={styles.accordionHeader}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>💉 Carteira de Vacinação</span>
                                    <span>{accordions.vaccines ? '−' : '+'}</span>
                                </button>
                                {accordions.vaccines && (
                                    <div className={styles.accordionContent}>
                                        {selectedPet ? (
                                            <>
                                                {/* Upload da Carteira (Foto) */}
                                                <div style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                        <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>📄 Carteira de Vacinação (Galeria)</h4>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: '12px' }}>
                                                            {selectedPet.vaccine_card_urls?.length || 0} fotos salvas
                                                        </span>
                                                    </div>

                                                    <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                                        Adicione fotos de todas as páginas da carteira de vacinação do pet para backup e consulta rápida.
                                                    </p>

                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                                                        {selectedPet.vaccine_card_urls?.map((url, index) => (
                                                            <div key={index} style={{ position: 'relative', aspectRatio: '3/4', borderRadius: '8px', overflow: 'hidden', border: '2px solid var(--border)', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                                                                <img
                                                                    src={url}
                                                                    alt={`Página ${index + 1}`}
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
                                                                    onClick={() => setExpandedVaccineCard(url)}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        if (confirm('Deseja remover esta página da carteira?')) {
                                                                            const newUrls = selectedPet.vaccine_card_urls!.filter((_, i) => i !== index);
                                                                            const res = await updatePetVaccineCard(selectedPet.id, newUrls);
                                                                            if (res.success) {
                                                                                setSelectedPet({ ...selectedPet, vaccine_card_urls: newUrls });
                                                                                const input = document.getElementById('vaccine_card_urls_input') as HTMLInputElement;
                                                                                if (input) input.value = JSON.stringify(newUrls);
                                                                                fetchData();
                                                                            }
                                                                        }
                                                                    }}
                                                                    style={{ position: 'absolute', top: '4px', right: '4px', padding: '4px', background: 'rgba(239, 68, 68, 0.9)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex' }}
                                                                >
                                                                    <span style={{ fontSize: '14px', lineHeight: '1' }}>&times;</span>
                                                                </button>
                                                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '10px', textAlign: 'center', padding: '2px' }}>
                                                                    Pág {index + 1}
                                                                </div>
                                                            </div>
                                                        ))}

                                                        {/* Botão de Adicionar Mais */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                            <ImageUpload
                                                                bucket="pets"
                                                                onUpload={async (url) => {
                                                                    const currentUrls = selectedPet.vaccine_card_urls || [];
                                                                    const newUrls = [...currentUrls, url];
                                                                    const res = await updatePetVaccineCard(selectedPet.id, newUrls);
                                                                    if (res.success) {
                                                                        setSelectedPet({ ...selectedPet, vaccine_card_urls: newUrls });
                                                                        const input = document.getElementById('vaccine_card_urls_input') as HTMLInputElement;
                                                                        if (input) input.value = JSON.stringify(newUrls);
                                                                        fetchData();
                                                                    } else {
                                                                        alert(res.message);
                                                                    }
                                                                }}
                                                                onRemove={() => { }}
                                                                label=""
                                                                resetAfterUpload={true}
                                                                aspect={3/4}
                                                            />
                                                            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: '600' }}>Adicionar Página</p>
                                                        </div>
                                                    </div>

                                                    {selectedPet.vaccine_card_urls && selectedPet.vaccine_card_urls.length > 0 && (
                                                        <div style={{ textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                                💡 Clique em uma imagem para ver detalhes ampliado.
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Form to add new vaccine */}
                                                <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                                                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem' }}>Adicionar Nova Vacina</h4>
                                                    <form action={async (formData) => {
                                                        const res = await createVaccine(formData)
                                                        if (res.success) {
                                                            alert(res.message)
                                                            getPetVaccines(selectedPet.id).then(setVaccines)
                                                            const form = document.querySelector('#vaccineForm') as HTMLFormElement
                                                            if (form) form.reset()
                                                        } else {
                                                            alert(res.message)
                                                        }
                                                    }} id="vaccineForm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                        <input type="hidden" name="pet_id" value={selectedPet.id} />

                                                        <div style={{ gridColumn: '1 / -1' }}>
                                                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Nome da Vacina</label>
                                                            <input name="name" required className={styles.input} placeholder="Ex: V10, Antirrábica..." />
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Data Aplicação</label>
                                                            <input name="application_date" type="date" className={styles.input} />
                                                        </div>
                                                        <div>
                                                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Validade *</label>
                                                            <input name="expiry_date" type="date" required className={styles.input} />
                                                        </div>
                                                        <div style={{ gridColumn: '1 / -1' }}>
                                                            <button type="submit" className={styles.submitButton} style={{ width: '100%' }}>Adicionar Vacina</button>
                                                        </div>
                                                    </form>
                                                </div>

                                                {/* List of registered vaccines */}
                                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Vacinas Cadastradas</h4>
                                                {isVaccineLoading ? (
                                                    <div>Carregando...</div>
                                                ) : vaccines.length === 0 ? (
                                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Nenhuma vacina registrada.</p>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {vaccines.map(vac => {
                                                            const expiry = new Date(vac.expiry_date)
                                                            const isExpired = expiry < new Date()
                                                            return (
                                                                <div key={vac.id} style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px', borderLeft: `4px solid ${isExpired ? '#EF4444' : '#10B981'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <div>
                                                                        <div style={{ fontWeight: '600' }}>{vac.name}</div>
                                                                        <div style={{ fontSize: '0.8rem', color: isExpired ? '#EF4444' : 'var(--text-secondary)' }}>
                                                                            Vence: {expiry.toLocaleDateString('pt-BR')} {isExpired && '(VENCIDA)'}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={async () => {
                                                                            if (confirm('Excluir esta vacina?')) {
                                                                                await deleteVaccine(vac.id)
                                                                                getPetVaccines(selectedPet.id).then(setVaccines)
                                                                            }
                                                                        }}
                                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#EF4444', opacity: 0.7 }}
                                                                    >
                                                                        &times;
                                                                    </button>
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

                            {/* 2. Banho e Tosa */}
                            <div className={styles.accordionItem}>
                                <button type="button" onClick={() => toggleAccordion('bathGrooming')} className={styles.accordionHeader}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>🚿 Banho e Tosa</span>
                                    <span>{accordions.bathGrooming ? '−' : '+'}</span>
                                </button>
                                {accordions.bathGrooming && (
                                    <div className={styles.accordionContent}>
                                        {selectedPet ? (
                                            <>
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <button
                                                        onClick={() => handleOpenBooking('Banho e Tosa')}
                                                        className={styles.submitButton}
                                                        style={{ width: '100%' }}>
                                                        + Novo Agendamento de Banho e Tosa
                                                    </button>
                                                </div>

                                                <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Histórico Recente</h4>
                                                {bathHistory.length === 0 ? (
                                                    <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Nenhum agendamento recente.</p>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {bathHistory.map((appt: any) => (
                                                            <div key={appt.id} style={{ padding: '0.75rem', borderRadius: '6px', background: 'var(--bg-secondary)', borderLeft: `4px solid #3B82F6` }}>
                                                                {appt.package_credit_id && appt.package_usage_index && (() => {
                                                                    const pg = appt.package_credits;
                                                                    const cpData = Array.isArray(pg?.customer_packages) ? pg.customer_packages[0] : pg?.customer_packages;
                                                                    const allCredits = cpData?.package_credits || [];
                                                                    const total = Array.isArray(allCredits) 
                                                                        ? allCredits.reduce((sum: number, c: any) => sum + (c.total_quantity || 0), 0)
                                                                        : (pg?.total_quantity || 0);
                                                                    const idx = total ? Math.min(appt.package_usage_index, total) : appt.package_usage_index;
                                                                    return (
                                                                        <div style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 600, marginBottom: '2px' }}>
                                                                            Sessão {idx} {total ? ` de ${total}` : ''}
                                                                        </div>
                                                                    );
                                                                })()}
                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                    <span style={{ fontWeight: 600 }}>{new Date(appt.scheduled_at).toLocaleDateString('pt-BR')}</span>
                                                                    <span style={{ fontSize: '0.85rem' }}>{appt.status}</span>
                                                                </div>
                                                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{new Date(appt.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {appt.services?.name}</div>
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

                            {/* 2.1 Pacotes */}
                            <div className={styles.accordionItem}>
                                <button type="button" onClick={() => toggleAccordion('packages')} className={styles.accordionHeader}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>🎁 Pacotes de Serviços</span>
                                    <span>{accordions.packages ? '−' : '+'}</span>
                                </button>
                                {accordions.packages && (
                                    <div className={styles.accordionContent}>
                                        {selectedPet ? (
                                            <>
                                                <div className={styles.addPackageSection}>
                                                    <h3 className={styles.sectionTitle}>Contratar Novo Pacote</h3>
                                                    <div className={styles.packageSelection}>
                                                        <select className={styles.select} value={selectedPackageId} onChange={e => setSelectedPackageId(e.target.value)}>
                                                            <option value="">Selecione um pacote...</option>
                                                            {availablePackages.map(pkg => (<option key={pkg.id} value={pkg.id}>{pkg.name} - R$ {pkg.total_price.toFixed(2)}</option>))}
                                                        </select>
                                                    </div>

                                                    {/* Configuração de agendamento automático */}
                                                    {selectedPackageId && (
                                                        <div style={{ marginTop: '1rem', padding: '1.25rem', background: 'rgba(var(--primary-rgb), 0.1)', borderRadius: '12px', border: '1px solid rgba(var(--primary-rgb), 0.2)' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isAutoSchedule}
                                                                    onChange={e => setIsAutoSchedule(e.target.checked)}
                                                                />
                                                                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>📅 Agendar automaticamente</span>
                                                            </label>
                                                            {isAutoSchedule && (
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                                    <div style={{ gridColumn: 'span 2' }}>
                                                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Dias da semana</label>
                                                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                            {[
                                                                                { label: 'S', value: 1, name: 'Segunda' },
                                                                                { label: 'T', value: 2, name: 'Terça' },
                                                                                { label: 'Q', value: 3, name: 'Quarta' },
                                                                                { label: 'Q', value: 4, name: 'Quinta' },
                                                                                { label: 'S', value: 5, name: 'Sexta' },
                                                                                { label: 'S', value: 6, name: 'Sábado' },
                                                                                { label: 'D', value: 0, name: 'Domingo' }
                                                                            ].map(day => {
                                                                                const isSelected = prefWeekdays.includes(day.value)
                                                                                return (
                                                                                    <button
                                                                                        key={day.value}
                                                                                        type="button"
                                                                                        title={day.name}
                                                                                        onClick={() => {
                                                                                            if (isSelected) {
                                                                                                setPrefWeekdays(prefWeekdays.filter(d => d !== day.value))
                                                                                            } else {
                                                                                                setPrefWeekdays([...prefWeekdays, day.value])
                                                                                            }
                                                                                        }}
                                                                                        style={{
                                                                                            width: '36px',
                                                                                            height: '36px',
                                                                                            borderRadius: '50%',
                                                                                            border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border)',
                                                                                            background: isSelected ? 'rgba(var(--primary-rgb), 0.15)' : 'transparent',
                                                                                            color: isSelected ? 'var(--primary-color)' : 'var(--text-secondary)',
                                                                                            fontWeight: isSelected ? '700' : '400',
                                                                                            cursor: 'pointer',
                                                                                            transition: 'all 0.2s ease',
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            justifyContent: 'center',
                                                                                            fontSize: '0.85rem'
                                                                                        }}
                                                                                    >
                                                                                        {day.label}
                                                                                    </button>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ gridColumn: 'span 2' }}>
                                                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Horário padrão</label>
                                                                        <input
                                                                            type="time"
                                                                            value={prefTime}
                                                                            onChange={e => setPrefTime(e.target.value)}
                                                                            className={styles.input}
                                                                            style={{ width: '100%', maxWidth: '150px' }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ gridColumn: 'span 2' }}>
                                                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Data de início das sessões (opcional)</label>
                                                                        <input
                                                                            type="date"
                                                                            value={scheduleStartDate}
                                                                            onChange={e => setScheduleStartDate(e.target.value)}
                                                                            className={styles.input}
                                                                            style={{ width: '100%', maxWidth: '180px' }}
                                                                        />
                                                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                                                                            Se vazio, começa a partir de hoje. Use para corrigir pacotes contratados com atraso.
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                             {!isAutoSchedule && (
                                                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
                                                                    As sessões serão criadas como disponíveis para agendamento manual.
                                                                </p>
                                                            )}

                                                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(var(--primary-rgb), 0.2)' }}>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: hasTaxiPackage ? '0.75rem' : '0', color: 'var(--text-primary)' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={hasTaxiPackage}
                                                                        onChange={e => setHasTaxiPackage(e.target.checked)}
                                                                    />
                                                                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>🚗 Incluir Taxi Dog no Pacote?</span>
                                                                </label>
                                                                
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginTop: '0.75rem', color: 'var(--text-primary)' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isAutoRenew}
                                                                        onChange={e => setIsAutoRenew(e.target.checked)}
                                                                    />
                                                                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>🔄 Renovar automaticamente no vencimento?</span>
                                                                </label>
                                                                
                                                                {hasTaxiPackage && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '8px' }}>
                                                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Taxa Total de Transporte (R$):</label>
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={taxiFeePackage}
                                                                            onChange={e => setTaxiFeePackage(parseFloat(e.target.value) || 0)}
                                                                            className={styles.input}
                                                                            style={{ width: '100px', padding: '0.4rem' }}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <button
                                                        type="button"
                                                        className={styles.submitButton}
                                                        style={{ marginTop: '0.75rem', width: '100%' }}
                                                        disabled={!selectedPackageId || isSelling}
                                                        onClick={handleSellPackage}
                                                    >
                                                        {isSelling ? 'Processando...' : '🎁 Contratar Pacote'}
                                                    </button>
                                                </div>

                                                <h3 className={styles.sectionTitle} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginTop: '1rem' }}>Pacotes Ativos & Sessões</h3>

                                                {petPackages.length === 0 ? (
                                                    <div className={styles.emptyState}>Nenhum pacote ativo para este pet.</div>
                                                ) : (
                                                    <div className={styles.packagesContainer} style={{ marginTop: '0' }}>
                                                        {Object.values(petPackages.reduce((acc: any, curr: any) => {
                                                            if (!acc[curr.customer_package_id]) {
                                                                acc[curr.customer_package_id] = {
                                                                    id: curr.customer_package_id,
                                                                    name: curr.package_name,
                                                                    expires_at: curr.expires_at,
                                                                    is_expired: curr.is_expired,
                                                                    calculated_price: curr.calculated_price ?? 0,
                                                                    total_paid: curr.total_paid ?? 0,
                                                                    discount_percent: curr.discount_percent ?? 0,
                                                                    payment_status: curr.payment_status,
                                                                    payment_method: curr.payment_method,
                                                                    has_taxi: curr.has_taxi,
                                                                    taxi_fee: curr.taxi_fee,
                                                                    services: []
                                                                };
                                                            }
                                                            acc[curr.customer_package_id].services.push(curr);
                                                            return acc;
                                                        }, {})).map((pkgGroup: any, index: number) => {
                                                            const cpId = pkgGroup.id
                                                            const slots = [...(petSlots[cpId] || [])].sort((a, b) => {
                                                                const dateA = new Date(a.slot_date + 'T12:00:00').getTime();
                                                                const dateB = new Date(b.slot_date + 'T12:00:00').getTime();
                                                                return dateB - dateA; // Descendente por padrão no histórico
                                                            })
                                                            const isExpanded = expandedSlotPackage === cpId

                                                            // Encontrar o mês de referência (maioria das sessões)
                                                            let referenceMonth = '';
                                                            if (slots.length > 0) {
                                                                const monthCounts: Record<string, number> = {};
                                                                slots.forEach((s: any) => {
                                                                    if (s.slot_date) {
                                                                        const m = new Date(s.slot_date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                                                                        monthCounts[m] = (monthCounts[m] || 0) + 1;
                                                                    }
                                                                });
                                                                referenceMonth = Object.entries(monthCounts).reduce((a, b) => (a[1] > b[1] ? a : b))[0];
                                                            } else {
                                                                // Fallback: usar data de compra ou validade se não houver sessões
                                                                const fallbackDate = pkgGroup.purchased_at || pkgGroup.expires_at || new Date().toISOString();
                                                                referenceMonth = new Date(fallbackDate).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                                                            }
                                                            if (referenceMonth) {
                                                                referenceMonth = referenceMonth.charAt(0).toUpperCase() + referenceMonth.slice(1);
                                                            }

                                                            return (
                                                                <div key={`${cpId}-${index}`} className={styles.packageCard} style={{ flexDirection: 'column', alignItems: 'stretch', backgroundColor: pkgGroup.is_expired ? 'rgba(255,0,0,0.05)' : 'var(--bg-secondary)', opacity: pkgGroup.is_expired ? 0.7 : 1 }}>
                                                                    <div className={styles.packageHeader} style={{ flexWrap: 'nowrap' }}>
                                                                        <div className={styles.packageInfo} style={{ flex: 1 }}>
                                                                            <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>📦 {pkgGroup.name} {referenceMonth && <span style={{ fontSize: '0.85rem', color: 'var(--primary)', marginLeft: '0.5rem', fontWeight: 'normal' }}>({referenceMonth})</span>}</h4>
                                                                            <div className={styles.packageDate} style={{ marginTop: '0.2rem' }}>Validade: {pkgGroup.expires_at ? new Date(pkgGroup.expires_at).toLocaleDateString('pt-BR') : 'Indeterminada'}</div>
                                                                            <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', backgroundColor: pkgGroup.auto_renew ? 'rgba(var(--primary-rgb), 0.15)' : 'rgba(0,0,0,0.05)', color: pkgGroup.auto_renew ? 'var(--primary)' : 'var(--text-secondary)' }}>
                                                                                    {pkgGroup.auto_renew ? '🔄 Renovação Automática: ATIVA' : '⏹️ Renovação Automática: DESATIVADA'}
                                                                                </span>
                                                                                <button 
                                                                                    onClick={() => handleToggleAutoRenew(cpId, pkgGroup.auto_renew)}
                                                                                    style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--text-primary)' }}
                                                                                >
                                                                                    Alterar
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                        <PackagePaymentControls
                                                                            customerPackageId={cpId}
                                                                            calculatedPrice={pkgGroup.calculated_price}
                                                                            totalPaid={pkgGroup.total_paid}
                                                                            discountPercent={pkgGroup.discount_percent}
                                                                            paymentStatus={pkgGroup.payment_status || 'pending'}
                                                                            paymentMethod={pkgGroup.payment_method || 'other'}
                                                                            hasTaxi={pkgGroup.has_taxi}
                                                                            taxiFee={pkgGroup.taxi_fee}
                                                                            onUpdate={fetchPetPackageSummary}
                                                                            compact={true}
                                                                        />
                                                                    </div>

                                                                    <div style={{ padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: '6px', marginTop: '0.75rem', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                        {pkgGroup.services.map((srv: any, sIdx: number) => {
                                                                            const realRemaining = (srv.total_qty || 0) - (srv.used_qty || 0);
                                                                            return (
                                                                                <div key={sIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: sIdx < pkgGroup.services.length - 1 ? '0.5rem' : '0', borderBottom: sIdx < pkgGroup.services.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                                                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{srv.service_name}</span>
                                                                                    <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                                                                                        <span style={{ color: realRemaining > 0 ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: 'bold' }}>{realRemaining}</span> restantes de {(srv.total_qty || 0)}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>

                                                                    {/* Botões de Ação do Pacote */}
                                                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteCustomerPackage(cpId)}
                                                                            style={{ 
                                                                                flex: 1, 
                                                                                padding: '0.6rem', 
                                                                                background: 'rgba(239,68,68,0.08)', 
                                                                                border: '1px solid rgba(239,68,68,0.2)', 
                                                                                borderRadius: '8px', 
                                                                                color: '#EF4444', 
                                                                                cursor: 'pointer', 
                                                                                fontSize: '0.85rem', 
                                                                                fontWeight: 600,
                                                                                display: 'flex', 
                                                                                alignItems: 'center', 
                                                                                justifyContent: 'center',
                                                                                gap: '0.5rem',
                                                                                transition: 'all 0.2s ease'
                                                                            }}
                                                                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                                                                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                                                                        >
                                                                            🗑️ Excluir Pacote do Pet
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (!isExpanded) {
                                                                                    setExpandedSlotPackage(cpId)
                                                                                    fetchSlotsForPackage(cpId)
                                                                                } else {
                                                                                    setExpandedSlotPackage(null)
                                                                                }
                                                                            }}
                                                                            style={{ flex: '1', padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                                        >
                                                                            <span>📋 Ver sessões / histórico</span>
                                                                            <span>{isExpanded ? '−' : '+'}</span>
                                                                        </button>
                                                                    </div>


                                                                    {isExpanded && (
                                                                        <div style={{ marginTop: '0.75rem' }}>
                                                                            {slots.length === 0 ? (
                                                                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                                                                                    Nenhuma sessão encontrada. Se o pacote tem agendamento automático, as sessões devem aparecer aqui.
                                                                                </p>
                                                                            ) : (
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                                    {(() => {
                                                                                        // Calcular os índices cronológicos reais antes de renderizar
                                                                                        // Ordenamos por data ASC para descobrir o índice 1, 2, 3...
                                                                                        const chronologicalSlots = [...slots].sort((a, b) => 
                                                                                            new Date(a.slot_date + 'T12:00:00').getTime() - new Date(b.slot_date + 'T12:00:00').getTime()
                                                                                        );
                                                                                        const indexMap = new Map();
                                                                                        chronologicalSlots.forEach((s, i) => indexMap.set(s.id, i + 1));
                                                                                        
                                                                                        return slots.map((slot: any) => {
                                                                                            const sessionIdx = indexMap.get(slot.id);
                                                                                            // Soma todos os créditos do pacote para obter o total real
                                                                                            const totalInPkg = pkgGroup.services.reduce((sum: number, srv: any) => sum + (srv.total_qty || 0), 0) || pkgGroup.services[0]?.total_qty || 0;
                                                                                            const statusMap: Record<string, { icon: string, label: string, color: string }> = {
                                                                                                done: { icon: '✅', label: 'Realizado', color: '#10B981' },
                                                                                                scheduled: { icon: '🕐', label: 'Agendado', color: '#3B82F6' },
                                                                                                pending: { icon: '📅', label: 'Pendente', color: '#F59E0B' },
                                                                                                skipped: { icon: '⏭️', label: 'Pulado', color: '#6B7280' },
                                                                                                rescheduled: { icon: '🔄', label: 'Reagendado', color: '#8B5CF6' },
                                                                                            }
                                                                                            const s = statusMap[slot.status] || statusMap.pending
                                                                                            return (
                                                                                                <div key={slot.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'var(--bg-primary)', borderRadius: '6px', borderLeft: `3px solid ${s.color}` }}>
                                                                                                    <div>
                                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                                            <span>{s.icon}</span>
                                                                                                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{slot.services?.name} <span style={{ fontWeight: 'normal', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>({sessionIdx} de {totalInPkg})</span></span>
                                                                                                            <span style={{ fontSize: '0.75rem', color: s.color }}>{s.label}</span>
                                                                                                        </div>
                                                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                                                                                            {slot.slot_date ? new Date(slot.slot_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                                                                                                            {slot.slot_time ? ` às ${slot.slot_time}` : ''}
                                                                                                            {slot.period_label ? ` · ${slot.period_label}` : ''}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    {(slot.status === 'pending' || slot.status === 'skipped' || slot.status === 'scheduled') && (
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            onClick={() => {
                                                                                                                setReschedulingSlot({ ...slot, customer_package_id: cpId })
                                                                                                                setSlotNewDate(slot.slot_date || '')
                                                                                                                setSlotNewTime(slot.slot_time || '09:00')
                                                                                                            }}
                                                                                                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px', border: 'none', background: 'rgba(139,92,246,0.2)', color: '#8B5CF6', cursor: 'pointer' }}
                                                                                                        >
                                                                                                            Reagendar
                                                                                                        </button>
                                                                                                    )}
                                                                                                </div>
                                                                                            )
                                                                                        })
                                                                                    })()}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}

                                                {/* Modal de reagendamento */}
                                                {reschedulingSlot && (
                                                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }} onClick={() => setReschedulingSlot(null)}>
                                                        <div style={{ background: 'var(--bg-tertiary)', borderRadius: '16px', padding: '1.5rem', width: '90%', maxWidth: '380px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)' }} onClick={e => e.stopPropagation()}>
                                                            <h3 style={{ margin: '0 0 1rem', color: 'var(--text-primary)', fontSize: '1.25rem' }}>🔄 Reagendar Sessão</h3>
                                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>{reschedulingSlot.services?.name}</p>
                                                            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Nova data</label>
                                                            <input type="date" value={slotNewDate} onChange={e => setSlotNewDate(e.target.value)} className={styles.input} style={{ marginBottom: '0.75rem' }} />
                                                            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Horário</label>
                                                            <input type="time" value={slotNewTime} onChange={e => setSlotNewTime(e.target.value)} className={styles.input} style={{ marginBottom: '1.25rem' }} />
                                                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                                                <button type="button" onClick={() => setReschedulingSlot(null)} className={styles.cancelBtn}>Cancelar</button>
                                                                <button type="button" onClick={handleRescheduleSlot} className={styles.submitButton}>Confirmar</button>
                                                            </div>
                                                        </div>
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
                            <div className={styles.accordionItem}>
                                <button type="button" onClick={() => toggleAccordion('creche')} className={styles.accordionHeader}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>🎾 Agendar Creche</span>
                                    <span>{accordions.creche ? '−' : '+'}</span>
                                </button>
                                {accordions.creche && (
                                    <div className={styles.accordionContent}>
                                        {selectedPet ? (
                                            <>
                                                <div style={{ marginBottom: '1rem' }}>
                                                    {!petAssessment && (
                                                        <div style={{ padding: '0.75rem', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '1rem', color: '#92400E', fontSize: '0.85rem' }}>
                                                            <strong>💡 Avaliação Pendente:</strong> Este pet ainda não possui avaliação, mas você pode agendar assim mesmo.
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={() => handleOpenBooking('Creche')}
                                                        className={styles.submitButton}
                                                        style={{ width: '100%' }}>
                                                        + Novo Agendamento de Creche
                                                    </button>
                                                </div>

                                                <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Histórico Recente</h4>
                                                {crecheHistory.length === 0 ? (
                                                    <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Nenhum agendamento recente.</p>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {crecheHistory.map((appt: any) => (
                                                            <div key={appt.id} style={{ padding: '0.75rem', borderRadius: '6px', background: 'var(--bg-secondary)', borderLeft: `4px solid #10B981` }}>
                                                                {appt.package_credit_id && appt.package_usage_index && (() => {
                                                                    const pg = appt.package_credits;
                                                                    const cpData = Array.isArray(pg?.customer_packages) ? pg.customer_packages[0] : pg?.customer_packages;
                                                                    const allCredits = cpData?.package_credits || [];
                                                                    const total = Array.isArray(allCredits) 
                                                                        ? allCredits.reduce((sum: number, c: any) => sum + (c.total_quantity || 0), 0)
                                                                        : (pg?.total_quantity || 0);
                                                                    const idx = total ? Math.min(appt.package_usage_index, total) : appt.package_usage_index;
                                                                    return (
                                                                        <div style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 600, marginBottom: '2px' }}>
                                                                            Sessão {idx} {total ? ` de ${total}` : ''}
                                                                        </div>
                                                                    );
                                                                })()}
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
                            <div className={styles.accordionItem}>
                                <button type="button" onClick={() => toggleAccordion('hotel')} className={styles.accordionHeader}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>🏨 Agendar Hospedagem</span>
                                    <span>{accordions.hotel ? '−' : '+'}</span>
                                </button>
                                {accordions.hotel && (
                                    <div className={styles.accordionContent}>
                                        {selectedPet ? (
                                            <>
                                                <div style={{ marginBottom: '1rem' }}>
                                                    {!petAssessment && (
                                                        <div style={{ padding: '0.75rem', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', marginBottom: '1rem', color: '#92400E', fontSize: '0.85rem' }}>
                                                            <strong>💡 Avaliação Pendente:</strong> Este pet ainda não possui avaliação, mas você pode agendar assim mesmo.
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={() => handleOpenBooking('Hospedagem')}
                                                        className={styles.submitButton}
                                                        style={{ width: '100%' }}>
                                                        + Novo Agendamento de Hospedagem
                                                    </button>
                                                </div>

                                                <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Histórico Recente</h4>
                                                {hotelHistory.length === 0 ? (
                                                    <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Nenhum agendamento recente.</p>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {hotelHistory.map((appt: any) => {
                                                            const isMultiDay = appt.check_out_date && appt.check_in_date && appt.check_out_date !== appt.check_in_date;
                                                            return (
                                                                <div key={appt.id} style={{ padding: '0.75rem', borderRadius: '6px', background: 'var(--bg-secondary)', borderLeft: `4px solid #F59E0B` }}>
                                                                    {appt.package_credit_id && appt.package_usage_index && (() => {
                                                                        const pg = appt.package_credits;
                                                                        const cpData = Array.isArray(pg?.customer_packages) ? pg.customer_packages[0] : pg?.customer_packages;
                                                                        const allCredits = cpData?.package_credits || [];
                                                                        const total = Array.isArray(allCredits) 
                                                                            ? allCredits.reduce((sum: number, c: any) => sum + (c.total_quantity || 0), 0)
                                                                            : (pg?.total_quantity || 0);
                                                                        const idx = total ? Math.min(appt.package_usage_index, total) : appt.package_usage_index;
                                                                        return (
                                                                            <div style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 600, marginBottom: '2px' }}>
                                                                                Sessão {idx} {total ? ` de ${total}` : ''}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                        <span style={{ fontWeight: 600 }}>
                                                                            {isMultiDay 
                                                                                ? `${new Date(appt.check_in_date).toLocaleDateString('pt-BR')} até ${new Date(appt.check_out_date).toLocaleDateString('pt-BR')}`
                                                                                : new Date(appt.scheduled_at).toLocaleDateString('pt-BR')
                                                                            }
                                                                        </span>
                                                                        <span style={{ fontSize: '0.85rem' }}>{appt.status}</span>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{appt.services?.name}</div>
                                                                </div>
                                                            );
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
                             <div className={styles.accordionItem}>
                                <button type="button" onClick={() => toggleAccordion('assessment')} className={styles.accordionHeader}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>📋 Avaliação Comportamental / Saúde</span>
                                    <span>{accordions.assessment ? '−' : '+'}</span>
                                </button>
                                {accordions.assessment && (
                                    <div className={styles.accordionContent}>
                                        {selectedPet ? (
                                            <>
                                                {petAssessment && !isViewingAssessment && !isEditingAssessment ? (
                                                    <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', marginBottom: '1rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10B981', fontWeight: '600', marginBottom: '0.5rem' }}>
                                                            ✓ Avaliação preenchida
                                                        </div>
                                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                                                            Pet avaliado em {new Date(petAssessment.created_at || petAssessment.declaration_accepted_at || Date.now()).toLocaleDateString('pt-BR')}
                                                        </p>
                                                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsViewingAssessment(true)}
                                                                style={{ padding: '0.5rem 1rem', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: '6px', cursor: 'pointer' }}
                                                            >
                                                                Visualizar Respostas
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsEditingAssessment(true)}
                                                                style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                                            >
                                                                Editar Avaliação
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : null}

                                                {isViewingAssessment && petAssessment && (
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Respostas da Avaliação</h3>
                                                            <button type="button" onClick={() => setIsViewingAssessment(false)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>Voltar</button>
                                                        </div>
                                                        <PetAssessmentForm
                                                            petId={selectedPet.id}
                                                            existingData={petAssessment}
                                                            readOnly={true}
                                                        />
                                                    </div>
                                                )}

                                                {(!petAssessment || isEditingAssessment) && !isViewingAssessment && (
                                                    <>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                            <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px', flex: 1 }}>
                                                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                                                                    ℹ️ Para poder agendar serviços de <strong>Creche</strong> ou <strong>Hospedagem</strong>, é necessário preencher a avaliação comportamental e de saúde do pet.
                                                                </p>
                                                            </div>
                                                            {isEditingAssessment && (
                                                                <button type="button" onClick={() => setIsEditingAssessment(false)} style={{ marginLeft: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancelar Edição</button>
                                                            )}
                                                        </div>
                                                        <PetAssessmentForm
                                                            petId={selectedPet.id}
                                                            existingData={petAssessment}
                                                            onSuccess={async () => {
                                                                // Force update parent state immediately
                                                                const data = await getPetAssessment(selectedPet.id)
                                                                setPetAssessment(data)
                                                                setIsEditingAssessment(false)
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

                            {/* 6. Produtos Pet Shop */}
                            <div className={styles.accordionItem}>
                                <button type="button" onClick={() => toggleAccordion('petshop')} className={styles.accordionHeader}>
                                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>🛒 Produtos Pet Shop</span>
                                    <span>{accordions.petshop ? '−' : '+'}</span>
                                </button>
                                {accordions.petshop && (
                                    <div className={styles.accordionContent}>
                                        {selectedPet ? (
                                            <>
                                                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Histórico de Compras</h4>
                                                {petshopHistory.length === 0 ? (
                                                    <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Nenhum produto comprado.</p>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {petshopHistory.map((sale: any) => (
                                                            <div key={sale.id} style={{ padding: '0.75rem', borderRadius: '6px', background: 'var(--bg-secondary)', borderLeft: `4px solid ${sale.payment_status === 'paid' ? '#10B981' : '#EF4444'}` }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                                    <div style={{ fontWeight: 600 }}>{sale.quantity}x {sale.product_name}</div>
                                                                    <div style={{ fontWeight: 600 }}>R$ {sale.total_price.toFixed(2)}</div>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{new Date(sale.created_at).toLocaleDateString('pt-BR')} • {sale.payment_status === 'paid' ? 'Pago' : 'Pendente'}</div>
                                                                    {sale.payment_status === 'pending' && (
                                                                        <button
                                                                            type="button"
                                                                            style={{ padding: '0.25rem 0.5rem', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                                                            onClick={async () => {
                                                                                if (confirm(`Confirmar pagamento de R$ ${sale.total_price.toFixed(2)} para ${sale.product_name}?`)) {
                                                                                    const paymentMethod = prompt('Qual a forma de pagamento? (pix, cash, credit, debit)', 'pix')
                                                                                    if (paymentMethod) {
                                                                                        const res = await payPetshopSale(sale.id, paymentMethod)
                                                                                        if (res.success) {
                                                                                            alert(res.message)
                                                                                            getPetshopHistory(selectedPet.id).then(r => setPetshopHistory(r.data || []))
                                                                                        } else {
                                                                                            alert(res.message)
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }}
                                                                        >
                                                                            💵 Marcar como Pago
                                                                        </button>
                                                                    )}
                                                                </div>
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
                        </div>

                    </div>

                    <div className={styles.modalActions} style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>
                            Fechar
                        </button>
                    </div>
                </div>
            )}

            {/* Lighbox para Foto da Carteira (Galeria Navegável) */}
            {expandedVaccineCard && (
                <div
                    className={styles.modalOverlay}
                    style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setExpandedVaccineCard(null)}
                >
                    <div
                        style={{ position: 'relative', width: '95vw', height: '95vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setExpandedVaccineCard(null)}
                            style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', fontSize: '2.5rem', cursor: 'pointer', lineHeight: '1', width: '50px', height: '50px', borderRadius: '50%', zIndex: 10 }}
                        >
                            &times;
                        </button>

                        {selectedPet?.vaccine_card_urls && selectedPet.vaccine_card_urls.length > 1 && (
                            <>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const currentIndex = selectedPet.vaccine_card_urls!.indexOf(expandedVaccineCard);
                                        const prevIndex = (currentIndex - 1 + selectedPet.vaccine_card_urls!.length) % selectedPet.vaccine_card_urls!.length;
                                        setExpandedVaccineCard(selectedPet.vaccine_card_urls![prevIndex]);
                                    }}
                                    style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '3rem', cursor: 'pointer', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.3s' }}
                                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
                                    onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                                >
                                    ‹
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const currentIndex = selectedPet.vaccine_card_urls!.indexOf(expandedVaccineCard);
                                        const nextIndex = (currentIndex + 1) % selectedPet.vaccine_card_urls!.length;
                                        setExpandedVaccineCard(selectedPet.vaccine_card_urls![nextIndex]);
                                    }}
                                    style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '3rem', cursor: 'pointer', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.3s' }}
                                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
                                    onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                                >
                                    ›
                                </button>
                            </>
                        )}

                        <img
                            src={expandedVaccineCard}
                            alt="Carteira de Vacinação Ampliada"
                            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}
                        />

                        <div style={{ color: 'white', marginTop: '1.5rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: '600' }}>{selectedPet?.name}</div>
                            <div style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: '4px' }}>
                                Página {selectedPet?.vaccine_card_urls ? selectedPet.vaccine_card_urls.indexOf(expandedVaccineCard) + 1 : 0} de {selectedPet?.vaccine_card_urls?.length || 0}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {selectedPet && (
                <BookingModal
                    isOpen={showBookingModal}
                    onClose={() => setShowBookingModal(false)}
                    onSuccess={() => {
                        setShowBookingModal(false);
                        fetchData(); // Refresh history
                        // Optionally refresh specific history sections if needed
                    }}
                    services={allServices}
                    blocks={scheduleBlocks}
                    initialPetId={selectedPet.id}
                    initialCategory={bookingCategory}
                    initialDate={new Date().toISOString().split('T')[0]}
                />
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
