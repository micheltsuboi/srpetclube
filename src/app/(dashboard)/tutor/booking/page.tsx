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

            const orgId = customer.org_id

            // 2. Get tutor's pets
            const { data: petData } = await supabase
                .from('pets')
                .select('id, name, species')
                .eq('customer_id', customer.id)
                .eq('is_active', true)

            if (petData) setPets(petData)

            // 3. Get active services for this org
            if (orgId) {
                const { data: serviceData } = await supabase
                    .from('services')
                    .select('id, name, base_price, category')
                    .eq('org_id', orgId)
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

    // Generate mock time slots for now
    const generateTimeSlots = useCallback(() => {
        const slots: TimeSlot[] = []
        for (let hour = 8; hour <= 17; hour++) {
            slots.push({ time: `${hour.toString().padStart(2, '0')}:00`, available: true })
            if (hour < 17) slots.push({ time: `${hour.toString().padStart(2, '0')}:30`, available: true })
        }
        setTimeSlots(slots)
    }, [])

    useEffect(() => {
        if (selectedDate) generateTimeSlots()
    }, [selectedDate, generateTimeSlots])

    const handlePetSelect = (petId: string) => {
        setSelectedPet(petId)
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
                        {services.map((service) => (
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
                        ))}
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
