'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { getPetAssessment } from '@/app/actions/petAssessment'
import { calculateDynamicPrice } from '@/app/actions/pricing'
import PetAssessmentForm from '@/components/PetAssessmentForm'

interface TimeSlot {
    time: string
    available: boolean
}

interface Pet {
    id: string
    name: string
    species: string
    is_adapted?: boolean
}

interface Service {
    id: string
    name: string
    base_price: number
    category: string
    service_categories?: { name: string }
    target_species?: 'dog' | 'cat' | 'both'
}

export default function BookingPage() {
    const supabase = createClient()
    const [pets, setPets] = useState<Pet[]>([])
    const [services, setServices] = useState<Service[]>([])
    const [selectedPet, setSelectedPet] = useState<string | null>(null)
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [selectedService, setSelectedService] = useState<string | null>(null)
    const [selectedDate, setSelectedDate] = useState<string>('')
    const [selectedTime, setSelectedTime] = useState<string | null>(null)
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
    const [bookingComplete, setBookingComplete] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [orgId, setOrgId] = useState<string | null>(null)
    const [scheduleBlocks, setScheduleBlocks] = useState<any[]>([])
    const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({})
    const [loadingPrices, setLoadingPrices] = useState(false)

    // Assessment Modal State
    const [showAssessmentModal, setShowAssessmentModal] = useState(false)
    const [pendingServiceId, setPendingServiceId] = useState<string | null>(null)
    const [requiresAdaptationWarning, setRequiresAdaptationWarning] = useState(false)

    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // 1. Get tutor's customer record to find org_id and customer_id
            const { data: customer } = await supabase
                .from('customers')
                .select('id, org_id')
                .eq('user_id', user.id)
                .single()

            if (!customer) {
                setError('Tutor não vinculado a uma organização.')
                return
            }

            setOrgId(customer.org_id)

            // 2. Get tutor's pets
            const { data: petData } = await supabase
                .from('pets')
                .select('id, name, species, is_adapted')
                .eq('customer_id', customer.id)
                .eq('is_active', true)

            if (petData) setPets(petData)

            // 3. Get active services for this org
            if (customer.org_id) {
                const { data: serviceData } = await supabase
                    .from('services')
                    .select('id, name, base_price, category, target_species, service_categories(name)')
                    .eq('org_id', customer.org_id)
                    .eq('is_active', true)

                if (serviceData) {
                    const formatted = serviceData.map((s: any) => ({
                        id: s.id,
                        name: s.name,
                        base_price: s.base_price,
                        category: s.category,
                        target_species: s.target_species,
                        service_categories: Array.isArray(s.service_categories) ? s.service_categories[0] : s.service_categories
                    }))
                    setServices(formatted)
                }
            }

        } catch (error) {
            console.error('Error fetching data:', error)
            setError('Erro ao carregar dados. Verifique sua conexão.')
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Fetch schedule blocks when date is selected
    useEffect(() => {
        const fetchBlocks = async () => {
            if (!selectedDate || !orgId) return

            const startOfDay = new Date(`${selectedDate}T00:00:00`).toISOString()
            const endOfDay = new Date(`${selectedDate}T23:59:59`).toISOString()

            // Fetch blocks that overlap with the selected day
            // We use a broader query to catch any block that starts or ends within the day, or spans over it
            const { data: blocks } = await supabase
                .from('schedule_blocks')
                .select('*')
                .eq('org_id', orgId)
                .lte('start_at', endOfDay)
                .gte('end_at', startOfDay)

            setScheduleBlocks(blocks || [])
        }

        fetchBlocks()
    }, [selectedDate, orgId, supabase])

    // Generate time slots
    const generateTimeSlots = useCallback(() => {
        if (!selectedPet || !selectedService) return

        const pet = pets.find(p => p.id === selectedPet)
        const service = services.find(s => s.id === selectedService)

        if (!pet || !service) return

        const petSpecies = pet.species === 'cat' ? 'cat' : 'dog'
        const categoryName = (service.service_categories?.name || service.category || '').toLowerCase()
        const isExempt = categoryName.includes('creche') || categoryName.includes('hospedagem') || categoryName.includes('hotel')

        const slots: TimeSlot[] = []
        for (let hour = 8; hour <= 17; hour++) {
            const timeString = `${hour.toString().padStart(2, '0')}:00`
            const timeDate = new Date(`${selectedDate}T${timeString}:00`)

            let isBlocked = false

            if (!isExempt) {
                const conflictingBlock = scheduleBlocks.find(block => {
                    const blockStart = new Date(block.start_at)
                    const blockEnd = new Date(block.end_at)
                    return timeDate >= blockStart && timeDate < blockEnd
                })

                if (conflictingBlock) {
                    const blockTags: string[] = conflictingBlock.allowed_species || []
                    const allowedSpecies = blockTags.filter((t: string) => !t.startsWith('blocked_cat_'))
                    const blockedCategories = blockTags.filter((t: string) => t.startsWith('blocked_cat_')).map((t: string) => t.replace('blocked_cat_', ''))

                    let blockApplies = false

                    if (blockedCategories.length > 0) {
                        if (blockedCategories.includes(service.service_categories?.name || service.category || '')) {
                            blockApplies = true
                        }
                    } else {
                        blockApplies = true
                    }

                    if (blockApplies) {
                        if (allowedSpecies.length > 0) {
                            if (allowedSpecies.includes(petSpecies)) {
                                isBlocked = false // Allowed!
                            } else {
                                isBlocked = true // Species not allowed
                            }
                        } else {
                            isBlocked = true // Blocked for everyone
                        }
                    } else {
                        isBlocked = false // Block is for another category
                    }
                }
            }

            slots.push({ time: timeString, available: !isBlocked })

            if (hour < 17) {
                const halfHourString = `${hour.toString().padStart(2, '0')}:30`
                const halfHourDate = new Date(`${selectedDate}T${halfHourString}:00`)

                let isHalfBlocked = false

                if (!isExempt) {
                    const conflictingHalfBlock = scheduleBlocks.find(block => {
                        const blockStart = new Date(block.start_at)
                        const blockEnd = new Date(block.end_at)
                        return halfHourDate >= blockStart && halfHourDate < blockEnd
                    })

                    if (conflictingHalfBlock) {
                        const blockTags: string[] = conflictingHalfBlock.allowed_species || []
                        const allowedSpecies = blockTags.filter((t: string) => !t.startsWith('blocked_cat_'))
                        const blockedCategories = blockTags.filter((t: string) => t.startsWith('blocked_cat_')).map((t: string) => t.replace('blocked_cat_', ''))

                        let blockApplies = false

                        if (blockedCategories.length > 0) {
                            if (blockedCategories.includes(service.service_categories?.name || service.category || '')) {
                                blockApplies = true
                            }
                        } else {
                            blockApplies = true
                        }

                        if (blockApplies) {
                            if (allowedSpecies.length > 0) {
                                if (allowedSpecies.includes(petSpecies)) {
                                    isHalfBlocked = false
                                } else {
                                    isHalfBlocked = true
                                }
                            } else {
                                isHalfBlocked = true
                            }
                        } else {
                            isHalfBlocked = false // Block is for another category
                        }
                    }
                }

                slots.push({ time: halfHourString, available: !isHalfBlocked })
            }
        }
        setTimeSlots(slots)
    }, [selectedDate, scheduleBlocks, selectedPet, selectedService, pets, services])

    useEffect(() => {
        if (selectedDate) generateTimeSlots()
    }, [selectedDate, generateTimeSlots])

    useEffect(() => {
        const updateAllPrices = async () => {
            if (!selectedPet || availableServices.length === 0) return

            setLoadingPrices(true)
            const dateToUse = selectedDate || new Date().toISOString().split('T')[0]

            const pricePromises = availableServices.map(async (s) => {
                const dynPrice = await calculateDynamicPrice(selectedPet, s.id, dateToUse)
                return { id: s.id, price: dynPrice ?? s.base_price }
            })

            const results = await Promise.all(pricePromises)
            const newPrices: Record<string, number> = {}
            results.forEach(r => {
                newPrices[r.id] = r.price
            })
            setDynamicPrices(newPrices)
            setLoadingPrices(false)
        }

        updateAllPrices()
    }, [selectedPet, selectedDate]) // Recalculate if pet OR date changes

    const handlePetSelect = (petId: string) => {
        setSelectedPet(petId)
        setSelectedCategory(null)
        setSelectedService(null) // Reset service when pet changes
        setRequiresAdaptationWarning(false) // Reset warning
        setStep(2)
    }

    const handleCategorySelect = (category: string) => {
        setSelectedCategory(category)
        setSelectedService(null)
        setStep(3) // Move to service selection
    }

    const handleServiceSelect = async (serviceId: string) => {
        const service = services.find(s => s.id === serviceId)
        if (!service || !selectedPet) return

        const category = (service.service_categories?.name || service.category || '').toLowerCase()
        const sensitiveCategories = ['creche', 'hospedagem', 'hotel', 'day care']
        const isSensitive = sensitiveCategories.some(c => category.includes(c))

        if (isSensitive) {
            // Check if pet has assessment
            setLoading(true)
            const assessment = await getPetAssessment(selectedPet)
            setLoading(false)

            if (!assessment) {
                // Block and show modal
                setPendingServiceId(serviceId)
                setShowAssessmentModal(true)
                return
            }

            // Check if adapted
            const petData = pets.find(p => p.id === selectedPet)
            if (petData && !petData.is_adapted) {
                setRequiresAdaptationWarning(true)
            } else {
                setRequiresAdaptationWarning(false)
            }
        } else {
            setRequiresAdaptationWarning(false)
        }

        setSelectedService(serviceId)
        setStep(4) // Move to date selection
    }

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedDate(e.target.value)
        setStep(5) // Move to time selection
    }

    const handleTimeSelect = (time: string) => {
        setSelectedTime(time)
    }

    const handleConfirm = async () => {
        if (!selectedPet || !selectedService || !selectedDate || !selectedTime) return

        try {
            setSubmitting(true)
            setError(null)

            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuário não autenticado.')

            // Fetch metadata again to be safe
            const { data: customerData } = await supabase
                .from('customers')
                .select('id, org_id')
                .eq('user_id', user.id)
                .single()

            if (!customerData) throw new Error('Dados do tutor não encontrados.')

            // Validate year
            const year = parseInt(selectedDate.split('-')[0], 10)
            if (year < 2024) throw new Error('Ano inválido. Por favor, verifique se digitou o ano com 4 dígitos (ex: 2026).')

            const scheduledAt = new Date(`${selectedDate}T${selectedTime}:00-03:00`).toISOString()

            const { error: insertError } = await supabase
                .from('appointments')
                .insert({
                    org_id: customerData.org_id,
                    pet_id: selectedPet,
                    service_id: selectedService,
                    customer_id: customerData.id,
                    scheduled_at: scheduledAt,
                    status: 'pending',
                    calculated_price: dynamicPrices[selectedService] || null,
                    notes: 'Agendado pelo portal do tutor',
                    payment_status: 'pending'
                })

            if (insertError) throw insertError

            setBookingComplete(true)
        } catch (err: any) {
            console.error('Error creating appointment:', err)
            setError(err.message || 'Ocorreu um erro ao realizar o agendamento.')
        } finally {
            setSubmitting(false)
        }
    }

    const selectedPetData = pets.find(p => p.id === selectedPet)
    const selectedServiceData = services.find(s => s.id === selectedService)

    // Filter services based on selected pet's species
    const availableServices = services.filter(service => {
        if (!selectedPetData) return false

        // Strict filtering:
        // 1. If target_species is explicitly set, must match or be 'both'
        if (service.target_species) {
            return service.target_species === 'both' || service.target_species === selectedPetData.species
        }

        // 2. Fallback for null target_species: Check name for keywords
        const lowerName = service.name.toLowerCase()
        const lowerCategory = (service.service_categories?.name || service.category || '').toLowerCase()

        if (selectedPetData.species === 'dog') {
            // If dog, exclude if name contains 'gato', 'felino'
            if (lowerName.includes('gato') || lowerName.includes('felino') || lowerCategory.includes('gato')) return false
        } else if (selectedPetData.species === 'cat') {
            // If cat, exclude if name contains 'cão', 'cao', 'cachorro', 'canino'
            if (lowerName.includes('cão') || lowerName.includes('cao') || lowerName.includes('cachorro') || lowerCategory.includes('cão')) return false
        }

        return true // Default to showing if no explicit conflict found
    })

    // Group available services by category
    const categories = Array.from(new Set(availableServices.map(s => s.service_categories?.name || s.category || 'Outros'))).sort()

    // Filter services by selected category
    const filteredServices = availableServices.filter(s => (s.service_categories?.name || s.category || 'Outros') === selectedCategory)

    if (bookingComplete) {
        return (
            <div className={styles.container}>
                <div className={styles.successCard}>
                    <div className={styles.successIcon}>✅</div>
                    <h1>Agendado com Sucesso!</h1>
                    <p>Seu agendamento foi enviado para aprovação</p>

                    <div className={styles.confirmDetails}>
                        <div className={styles.confirmRow}>
                            <span>Pet:</span>
                            <strong>{selectedPetData?.name}</strong>
                        </div>
                        <div className={styles.confirmRow}>
                            <span>Serviço:</span>
                            <strong>{selectedServiceData?.name}</strong>
                        </div>
                        <div className={styles.confirmRow}>
                            <span>Preço Final:</span>
                            <strong className={styles.servicePrice}>R$ {(dynamicPrices[selectedService!] ?? selectedServiceData?.base_price ?? 0).toFixed(2)}</strong>
                        </div>
                        <div className={styles.confirmRow}>
                            <span>Data:</span>
                            <strong>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', {
                                weekday: 'long',
                                day: '2-digit',
                                month: 'long'
                            })}</strong>
                        </div>
                        <div className={styles.confirmRow}>
                            <span>Horário:</span>
                            <strong>{selectedTime}</strong>
                        </div>
                    </div>

                    <Link href="/tutor" className={styles.backLink}>
                        ← Voltar para Timeline
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Link href="/tutor" className={styles.backButton}>← Voltar</Link>
                <h1 className={styles.title}>📅 Agendar Serviço</h1>
            </div>

            {/* Progress Steps */}
            <div className={styles.progress}>
                <div className={`${styles.progressStep} ${step >= 1 ? styles.active : ''}`}>
                    <span>1</span>
                    <p>Pet</p>
                </div>
                <div className={styles.progressLine} />
                <div className={`${styles.progressStep} ${step >= 2 ? styles.active : ''}`}>
                    <span>2</span>
                    <p>Categoria</p>
                </div>
                <div className={styles.progressLine} />
                <div className={`${styles.progressStep} ${step >= 3 ? styles.active : ''}`}>
                    <span>3</span>
                    <p>Serviço</p>
                </div>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {/* Step 1: Pet Selection */}
            {step === 1 && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Escolha o pet</h2>
                    <div className={styles.serviceList}>
                        {pets.map((pet) => (
                            <button
                                key={pet.id}
                                className={`${styles.serviceCard} ${selectedPet === pet.id ? styles.selected : ''}`}
                                onClick={() => handlePetSelect(pet.id)}
                            >
                                <div className={styles.serviceInfo}>
                                    <span className={styles.serviceName}>{pet.species === 'cat' ? '🐱' : '🐶'} {pet.name}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Step 2: Category Selection */}
            {step === 2 && selectedPet && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Escolha a categoria</h2>
                    <div className={styles.serviceList}>
                        {categories.map((category) => (
                            <button
                                key={category}
                                className={`${styles.serviceCard} ${selectedCategory === category ? styles.selected : ''}`}
                                onClick={() => handleCategorySelect(category)}
                            >
                                <div className={styles.serviceInfo}>
                                    <span className={styles.serviceName}>{category}</span>
                                </div>
                                <span className={styles.chevron}>›</span>
                            </button>
                        ))}
                    </div>
                    <button className={styles.backLink} onClick={() => setStep(1)} style={{ marginTop: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                        ← Escolher outro pet
                    </button>
                </div>
            )}

            {/* Step 3: Service Selection */}
            {step === 3 && selectedCategory && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Escolha o serviço ({selectedCategory})</h2>
                    <div className={styles.serviceList}>
                        {filteredServices.length > 0 ? filteredServices.map((service) => (
                            <button
                                key={service.id}
                                className={`${styles.serviceCard} ${selectedService === service.id ? styles.selected : ''}`}
                                onClick={() => handleServiceSelect(service.id)}
                            >
                                <div className={styles.serviceInfo}>
                                    <span className={styles.serviceName}>{service.name}</span>
                                </div>
                                <span className={styles.servicePrice}>
                                    {loadingPrices ? 'Calculando...' : `R$ ${(dynamicPrices[service.id] ?? service.base_price).toFixed(2)}`}
                                </span>
                            </button>
                        )) : (
                            <p className={styles.noServices}>Nenhum serviço disponível nesta categoria.</p>
                        )}
                    </div>
                    <button className={styles.backLink} onClick={() => setStep(2)} style={{ marginTop: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                        ← Escolher outra categoria
                    </button>
                </div>
            )}

            {/* Step 4: Date Selection */}
            {step === 4 && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Escolha a data</h2>
                    <input
                        type="date"
                        className={styles.dateInput}
                        value={selectedDate}
                        onChange={handleDateChange}
                        min={new Date().toISOString().split('T')[0]}
                    />
                    <button className={styles.backLink} onClick={() => setStep(3)} style={{ marginTop: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                        ← Escolher outro serviço
                    </button>
                </div>
            )}

            {/* Step 5: Time Selection */}
            {step === 5 && selectedDate && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Escolha o horário</h2>
                    <div className={styles.timeGrid}>
                        {timeSlots.map((slot) => (
                            <button
                                key={slot.time}
                                className={`${styles.timeSlot} ${!slot.available ? styles.unavailable : ''} ${selectedTime === slot.time ? styles.selected : ''}`}
                                onClick={() => slot.available && handleTimeSelect(slot.time)}
                                disabled={!slot.available}
                            >
                                {slot.time}
                            </button>
                        ))}
                    </div>
                    <button className={styles.backLink} onClick={() => setStep(4)} style={{ marginTop: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                        ← Escolher outra data
                    </button>
                </div>
            )}

            {/* Confirm Button */}
            {selectedPet && selectedService && selectedDate && selectedTime && (
                <div className={styles.confirmSection}>
                    <div className={styles.summary}>
                        <span>{selectedPetData?.name}</span>
                        <span>•</span>
                        <span>{selectedServiceData?.name}</span>
                        <span>•</span>
                        <span className={styles.servicePrice}>R$ {(dynamicPrices[selectedService] ?? selectedServiceData?.base_price ?? 0).toFixed(2)}</span>
                        <span>•</span>
                        <span>{selectedTime}</span>
                    </div>

                    {requiresAdaptationWarning && (
                        <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(241, 196, 15, 0.1)', border: '1px solid #f1c40f', borderRadius: '8px', color: '#b89406', fontSize: '0.9rem' }}>
                            <strong>⚠️ Atenção:</strong> Este serviço está sujeito a uma avaliação de adaptação presencial do pet. Após a solicitação nossa equipe entrará em contato para alinhar os detalhes.
                        </div>
                    )}

                    <button
                        className={styles.confirmButton}
                        onClick={handleConfirm}
                        disabled={submitting}
                    >
                        {submitting ? 'Agendando...' : 'Confirmar Agendamento'}
                    </button>
                </div>
            )}
            {/* Assessment Modal */}
            {showAssessmentModal && selectedPet && (
                <div className={styles.modalOverlay} style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.75)', zIndex: 2000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
                    backdropFilter: 'blur(4px)'
                }}>
                    <div className={styles.modalContent} style={{
                        background: 'var(--bg-card)', width: '100%', maxWidth: '600px',
                        maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px', padding: '1.5rem',
                        position: 'relative', border: '1px solid var(--border)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-primary)' }}>⚠️ Avaliação Necessária</h2>
                            <button onClick={() => setShowAssessmentModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
                        </div>
                        <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
                            Para agendar este serviço, precisamos que você preencha a avaliação comportamental e de saúde do seu pet. É rapidinho!
                        </p>

                        <PetAssessmentForm
                            petId={selectedPet}
                            onSuccess={() => {
                                setShowAssessmentModal(false)
                                if (pendingServiceId) {
                                    handleServiceSelect(pendingServiceId) // Try again, this time it should pass
                                }
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
