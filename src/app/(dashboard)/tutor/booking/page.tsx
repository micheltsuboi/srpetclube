'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'

interface TimeSlot {
    time: string
    available: boolean
}

interface Pet {
    id: string
    name: string
    species: string
}

interface Service {
    id: string
    name: string
    base_price: number
    category: string
    target_species?: 'dog' | 'cat' | 'both'
}

export default function BookingPage() {
    const supabase = createClient()
    const [pets, setPets] = useState<Pet[]>([])
    const [services, setServices] = useState<Service[]>([])
    const [selectedPet, setSelectedPet] = useState<string | null>(null)
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
                .select('id, name, species')
                .eq('customer_id', customer.id)
                .eq('is_active', true)

            if (petData) setPets(petData)

            // 3. Get active services for this org
            if (customer.org_id) {
                const { data: serviceData } = await supabase
                    .from('services')
                    .select('id, name, base_price, category, target_species')
                    .eq('org_id', customer.org_id)
                    .eq('is_active', true)

                if (serviceData) setServices(serviceData)
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
        const categoryName = (service.category || '').toLowerCase()
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
                    // Check if block allows this species
                    if (conflictingBlock.allowed_species && conflictingBlock.allowed_species.length > 0) {
                        if (conflictingBlock.allowed_species.includes(petSpecies)) {
                            isBlocked = false // Allowed!
                        } else {
                            isBlocked = true // Species not allowed
                        }
                    } else {
                        isBlocked = true // Blocked for everyone (null/empty allowed_species)
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
                        if (conflictingHalfBlock.allowed_species && conflictingHalfBlock.allowed_species.length > 0) {
                            if (conflictingHalfBlock.allowed_species.includes(petSpecies)) {
                                isHalfBlocked = false
                            } else {
                                isHalfBlocked = true
                            }
                        } else {
                            isHalfBlocked = true
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

    const handlePetSelect = (petId: string) => {
        setSelectedPet(petId)
        setSelectedService(null) // Reset service when pet changes
        setStep(2)
    }

    const handleServiceSelect = (serviceId: string) => {
        setSelectedService(serviceId)
        setStep(3)
    }

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedDate(e.target.value)
        setStep(4)
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
    const filteredServices = services.filter(service => {
        if (!selectedPetData) return false
        // Show service if target_species is 'both' or matches the pet's species
        return !service.target_species ||
            service.target_species === 'both' ||
            service.target_species === selectedPetData.species
    })

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
                    <p>Serviço</p>
                </div>
                <div className={styles.progressLine} />
                <div className={`${styles.progressStep} ${step >= 3 ? styles.active : ''}`}>
                    <span>3</span>
                    <p>Data</p>
                </div>
                <div className={styles.progressLine} />
                <div className={`${styles.progressStep} ${step >= 4 ? styles.active : ''}`}>
                    <span>4</span>
                    <p>Horário</p>
                </div>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {/* Step 1: Pet Selection */}
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

            {/* Step 2: Service Selection */}
            {step >= 2 && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Escolha o serviço</h2>
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
                                <span className={styles.servicePrice}>R$ {service.base_price.toFixed(2)}</span>
                            </button>
                        )) : (
                            <p className={styles.noServices}>Nenhum serviço disponível para este pet.</p>
                        )}
                    </div>
                </div>
            )}

            {/* Step 3: Date Selection */}
            {step >= 3 && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Escolha a data</h2>
                    <input
                        type="date"
                        className={styles.dateInput}
                        value={selectedDate}
                        onChange={handleDateChange}
                        min={new Date().toISOString().split('T')[0]}
                    />
                </div>
            )}

            {/* Step 4: Time Selection */}
            {step >= 4 && selectedDate && (
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
                        <span>{selectedTime}</span>
                    </div>
                    <button
                        className={styles.confirmButton}
                        onClick={handleConfirm}
                        disabled={submitting}
                    >
                        {submitting ? 'Agendando...' : 'Confirmar Agendamento'}
                    </button>
                </div>
            )}
        </div>
    )
}
