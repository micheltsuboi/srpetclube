'use client'

import React, { useState, useEffect, useCallback } from 'react'
import styles from './BookingModal.module.css'
import { createAppointment } from '@/app/actions/appointment'
import { searchPets } from '@/app/actions/pet'
import { useFormStatus } from 'react-dom'

interface Service {
    id: string
    name: string
    base_price: number
    target_species?: string
    service_categories?: {
        name: string
    }
    scheduling_rules?: any[]
    duration_minutes?: number
}

interface Pet {
    id: string
    name: string
    species: string
    breed?: string
    size?: string
    weight_kg?: number
    is_adapted?: boolean
    customers?: {
        name: string
    }
}

interface BookingModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    services: Service[]
    initialDate?: string
    initialPetId?: string
    initialServiceId?: string
    initialHour?: string
    blocks?: any[]
    initialCategory?: string // New: to filter services initially
}

function SubmitButton({ disabled }: { disabled: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button 
            type="submit" 
            className={styles.submitBtn} 
            disabled={pending || disabled}
        >
            {pending ? 'Agendando...' : 'Agendar'}
        </button>
    )
}

export default function BookingModal({
    isOpen,
    onClose,
    onSuccess,
    services,
    initialDate = new Date().toISOString().split('T')[0],
    initialPetId = '',
    initialServiceId = '',
    initialHour = '',
    blocks = [],
    initialCategory = ''
}: BookingModalProps) {
    const [petSearchTerm, setPetSearchTerm] = useState('')
    const [searchResults, setSearchResults] = useState<Pet[]>([])
    const [showPetResults, setShowPetResults] = useState(false)
    const [selectedPetId, setSelectedPetId] = useState(initialPetId)
    const [selectedPet, setSelectedPet] = useState<Pet | null>(null)
    const [hasTaxi, setHasTaxi] = useState(false)
    const [taxiFee, setTaxiFee] = useState<string>('0')
    const [selectedServiceId, setSelectedServiceId] = useState(initialServiceId)
    const [selectedDate, setSelectedDate] = useState(initialDate)
    const [selectedTime, setSelectedTime] = useState(initialHour)
    const [bookingError, setBookingError] = useState<string | null>(null)
    const [isSearching, setIsSearching] = useState(false)
    const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({})
    const [loadingPrices, setLoadingPrices] = useState(false)

    // Reset when modal opens with new initials
    useEffect(() => {
        if (isOpen) {
            setSelectedPetId(initialPetId)
            setSelectedServiceId(initialServiceId)
            setSelectedDate(initialDate)
            setSelectedTime(initialHour)
            setBookingError(null)
            setPetSearchTerm('')
            
            // If petId is provided, we might want to fetch its details
            if (initialPetId) {
                // We'll need a way to get pet info or just trust the parent
                // For now, let's assume we search it if needed
            }
        }
    }, [isOpen, initialPetId, initialServiceId, initialDate, initialHour])

    // Debounced Pet Search
    useEffect(() => {
        if (petSearchTerm.length < 2) {
            setSearchResults([])
            return
        }

        const timer = setTimeout(async () => {
            setIsSearching(true)
            try {
                const results = await searchPets(petSearchTerm)
                setSearchResults(results as any[])
                // Only show results if the user is actually typing a search, not just after auto-filling the input
                if (selectedPet?.name !== petSearchTerm) {
                    setShowPetResults(true)
                }
            } catch (err) {
                console.error('Error searching pets:', err)
            } finally {
                setIsSearching(false)
            }
        }, 400)

        return () => clearTimeout(timer)
    }, [petSearchTerm])

    // Fetch Dynamic Prices when Pet or Date changes
    useEffect(() => {
        const fetchPrices = async () => {
            if (selectedPetId && selectedDate) {
                setLoadingPrices(true)
                try {
                    const { calculateManyDynamicPrices } = await import('@/app/actions/pricing')
                    const serviceIds = services.map((s: Service) => s.id)
                    const results = await calculateManyDynamicPrices(selectedPetId, serviceIds, selectedDate)
                    
                    const typedResults: Record<string, number> = {}
                    Object.entries(results).forEach(([id, price]) => {
                        typedResults[id] = price ?? 0
                    })
                    setDynamicPrices(typedResults)
                } catch (err) {
                    console.error('Error fetching prices:', err)
                } finally {
                    setLoadingPrices(false)
                }
            }
        }
        fetchPrices()
    }, [selectedPetId, selectedDate, services])

    const validate = useCallback(() => {
        if (!selectedPetId || !selectedServiceId) return true

        const svc = services.find((s: Service) => s.id === selectedServiceId)
        const pet = searchResults.find((p: Pet) => p.id === selectedPetId) || selectedPet
        
        if (!svc || !pet) return true

        const petSpecies = pet.species.toLowerCase() === 'cão' || pet.species.toLowerCase() === 'dog' ? 'dog' : 'cat'

        // 1. Target Species
        if (svc.target_species && svc.target_species !== 'both' && svc.target_species !== petSpecies) {
            setBookingError(`Este serviço é exclusivo para ${svc.target_species === 'dog' ? 'Cães' : 'Gatos'}.`)
            return false
        }

        // 2. Scheduling Rules (Day of week)
        if (svc.scheduling_rules && svc.scheduling_rules.length > 0) {
            const [y, m, d] = selectedDate.split('-').map(Number)
            const dayOfWeek = new Date(y, m - 1, d).getDay()
            const rule = svc.scheduling_rules.find((r: any) => r.day === dayOfWeek)

            if (rule && !rule.species.includes(petSpecies)) {
                const allowed = rule.species.map((s: string) => s === 'dog' ? 'Cães' : 'Gatos').join(' ou ')
                const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
                setBookingError(`Este serviço só é permitido para ${allowed} às ${days[dayOfWeek]}s.`)
                return false
            }
        }

        // 3. Blocks (Conflict Check)
        const categoryName = (svc.service_categories?.name || '').toLowerCase()
        const isExempt = categoryName.includes('creche') || categoryName.includes('hospedagem') || categoryName.includes('hotel')

        if (!isExempt && selectedTime) {
            const myStart = new Date(`${selectedDate}T${selectedTime}:00`).getTime()
            
            const conflictingBlock = blocks.find((b: any) => {
                const blockStart = new Date(b.start_at).getTime()
                const blockEnd = new Date(b.end_at).getTime()
                return myStart >= blockStart && myStart < blockEnd
            })

            if (conflictingBlock) {
                const blockTags: string[] = conflictingBlock.allowed_species || []
                const allowedSpec = blockTags.filter(t => !t.startsWith('blocked_cat_'))
                const blockedCats = blockTags.filter(t => t.startsWith('blocked_cat_')).map(t => t.replace('blocked_cat_', ''))

                let blockApplies = false
                if (blockedCats.length > 0) {
                    if (blockedCats.includes(svc.service_categories?.name || '')) blockApplies = true
                } else {
                    blockApplies = true
                }

                if (blockApplies) {
                    if (allowedSpec.length > 0 && !allowedSpec.includes(petSpecies)) {
                        const allowed = allowedSpec.map(s => s === 'dog' ? 'Cães' : 'Gatos').join(' e ')
                        setBookingError(`Horário reservado exclusivamente para ${allowed}.`)
                        return false
                    } else if (allowedSpec.length === 0) {
                        setBookingError(`Horário bloqueado: ${conflictingBlock.reason}`)
                        return false
                    }
                }
            }
        }

        setBookingError(null)
        return true
    }, [selectedPetId, selectedServiceId, selectedDate, selectedTime, services, searchResults, selectedPet, blocks])

    useEffect(() => {
        validate()
    }, [validate])

    const handleFormAction = async (formData: FormData) => {
        const result = await createAppointment({ success: false, message: '' }, formData)
        if (result.success) {
            onSuccess()
            onClose()
        } else {
            setBookingError(result.message)
        }
    }

    if (!isOpen) return null

    const selectedService = services.find((s: Service) => s.id === selectedServiceId)
    const catName = selectedService?.service_categories?.name || ''
    const isHospedagem = catName.toLowerCase().includes('hospedagem') || catName.toLowerCase().includes('hotel')

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 className={styles.modalTitle}>Novo Agendamento</h2>
                
                <form action={handleFormAction}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Pet *</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="🔍 Pesquisar pet ou tutor..."
                                className={styles.input}
                                value={petSearchTerm}
                                onChange={(e) => {
                                    setPetSearchTerm(e.target.value)
                                    // Always show results when user is actively typing
                                    setShowPetResults(true)
                                }}
                                onFocus={() => {
                                    // Only show results on focus if we haven't exactly matched the selected pet yet
                                    if (selectedPet?.name !== petSearchTerm) {
                                        setShowPetResults(true)
                                    }
                                }}
                            />
                            
                            {showPetResults && (isSearching || petSearchTerm.length >= 2) && (
                                <div className={styles.searchResultsContainer}>
                                    {isSearching ? (
                                        <div className={styles.searchResultItem}>Buscando...</div>
                                    ) : searchResults.length > 0 ? (
                                        searchResults.map((p: Pet) => (
                                            <div
                                                key={p.id}
                                                className={styles.searchResultItem}
                                                onClick={() => {
                                                    setSelectedPetId(p.id)
                                                    setSelectedPet(p)
                                                    setPetSearchTerm(p.name)
                                                    setShowPetResults(false)
                                                }}
                                            >
                                                <span className={styles.resultPetName}>{p.name}</span>
                                                <span className={styles.resultTutorName}>
                                                    👤 {p.customers?.name || 'Sem tutor'} • {p.breed || 'SRD'}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className={styles.searchResultItem}>Nenhum pet encontrado</div>
                                    )}
                                </div>
                            )}

                            {selectedPetId && !showPetResults && (
                                <div className={styles.loadingPrice} style={{ color: 'var(--success)' }}>
                                    ✓ Selecionado: {selectedPet?.name || 'Pet ID: ' + selectedPetId}
                                </div>
                            )}
                            
                            <input type="hidden" name="petId" value={selectedPetId} required />
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Serviço *</label>
                        <select
                            name="serviceId"
                            className={styles.select}
                            required
                            value={selectedServiceId}
                            onChange={(e) => setSelectedServiceId(e.target.value)}
                        >
                            <option value="">Selecione um serviço...</option>
                            {Object.entries(services
                                .filter((s: Service) => {
                                    // If initialCategory is provided (e.g. from Pets Page), filter by it
                                    if (initialCategory && s.service_categories?.name !== initialCategory) return false;
                                    
                                    if (!selectedPetId) return true;
                                    const pet = selectedPet;
                                    if (!pet) return true;
                                    const petSpecies = pet.species.toLowerCase() === 'cão' || pet.species.toLowerCase() === 'dog' ? 'dog' : 'cat';
                                    return !s.target_species || s.target_species === 'both' || s.target_species === petSpecies;
                                })
                                .reduce((acc, s: Service) => {
                                    const cat = s.service_categories?.name || 'Outros'
                                    if (!acc[cat]) acc[cat] = []
                                    acc[cat].push(s)
                                    return acc
                                }, {} as Record<string, Service[]>)).map(([category, catServices]) => (
                                    <optgroup key={category} label={category}>
                                        {catServices.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.name} (R$ {(dynamicPrices[s.id] ?? s.base_price).toFixed(2)})
                                                {dynamicPrices[s.id] !== undefined && dynamicPrices[s.id] !== s.base_price && ' ✨'}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                        </select>
                        {selectedServiceId && (
                            <div className={styles.loadingPrice}>
                                {loadingPrices ? 'Atualizando preços...' : (
                                    dynamicPrices[selectedServiceId] !== undefined && (
                                        <span className={styles.priceOverride}>
                                            Preço para este pet: R$ {dynamicPrices[selectedServiceId].toFixed(2)}
                                        </span>
                                    )
                                )}
                            </div>
                        )}
                    </div>

                    {isHospedagem ? (
                        <div className={styles.row}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Data Check-in *</label>
                                <input
                                    name="checkInDate"
                                    type="date"
                                    className={styles.input}
                                    required
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                />
                                <input type="hidden" name="date" value={selectedDate} />
                                <input type="hidden" name="time" value="14:00" />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Data Check-out *</label>
                                <input
                                    name="checkOutDate"
                                    type="date"
                                    className={styles.input}
                                    required
                                />
                            </div>
                        </div>
                    ) : (
                        <div className={styles.row}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Data *</label>
                                <input
                                    name="date"
                                    type="date"
                                    className={styles.input}
                                    required
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Hora *</label>
                                <input 
                                    name="time" 
                                    type="time" 
                                    className={styles.input} 
                                    required 
                                    value={selectedTime}
                                    onChange={(e) => setSelectedTime(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <div className={styles.taxiGroup}>
                        <div className={styles.taxiHeader}>
                            <label className={styles.checkboxLabel}>
                                <input 
                                    type="checkbox" 
                                    checked={hasTaxi} 
                                    onChange={(e) => setHasTaxi(e.target.checked)}
                                    className={styles.checkbox}
                                />
                                <span className={styles.taxiTitle}>🚗 Adicionar Taxi Dog?</span>
                            </label>
                        </div>
                        
                        {hasTaxi && (
                            <div className={styles.taxiPriceInput}>
                                <label className={styles.labelSmall}>Valor do Transporte (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className={styles.input}
                                    value={taxiFee}
                                    onChange={(e) => setTaxiFee(e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                        )}
                        <input type="hidden" name="hasTaxi" value={String(hasTaxi)} />
                        <input type="hidden" name="taxiFee" value={taxiFee} />

                        <div className={styles.taxiHeader} style={{ marginTop: '1rem' }}>
                            <label className={styles.checkboxLabel}>
                                <input 
                                    type="checkbox" 
                                    name="ignorePackage" 
                                    value="true"
                                    className={styles.checkbox}
                                />
                                <span className={styles.taxiTitle}>Agendar como serviço avulso (Não utilizar pacote)</span>
                            </label>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Observações</label>
                        <textarea name="notes" className={styles.textarea} rows={3} placeholder="Instruções especiais..." />
                    </div>

                    {bookingError && (
                        <div className={styles.error}>
                            ⚠️ {bookingError}
                        </div>
                    )}

                    <div className={styles.modalActions}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
                        <SubmitButton disabled={!!bookingError || !selectedPetId || !selectedServiceId} />
                    </div>
                </form>
            </div>
        </div>
    )
}
