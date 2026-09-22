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

function SubmitButton({ disabled, petCount }: { disabled: boolean, petCount: number }) {
    const { pending } = useFormStatus()
    return (
        <button 
            type="submit" 
            className={styles.submitBtn} 
            disabled={pending || disabled}
        >
            {pending 
                ? 'Agendando...' 
                : petCount > 1 
                    ? `Agendar (${petCount} Pets)` 
                    : 'Agendar'}
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
    const [selectedPets, setSelectedPets] = useState<Pet[]>([])
    const [hasTaxi, setHasTaxi] = useState(false)
    const [taxiFee, setTaxiFee] = useState<string>('0')
    const [selectedServiceId, setSelectedServiceId] = useState(initialServiceId)
    const [selectedDate, setSelectedDate] = useState(initialDate)
    const [selectedTime, setSelectedTime] = useState(initialHour)
    const [bookingError, setBookingError] = useState<string | null>(null)
    const [isSearching, setIsSearching] = useState(false)
    const [dynamicPrices, setDynamicPrices] = useState<Record<string, number>>({})
    const [loadingPrices, setLoadingPrices] = useState(false)

    // Extras States
    const [extrasList, setExtrasList] = useState<Array<{ name: string, price: number }>>([])
    const [extraName, setExtraName] = useState('')
    const [extraPrice, setExtraPrice] = useState('')
    const [selectedExtraServiceId, setSelectedExtraServiceId] = useState('')

    const handleSelectExtraService = (serviceId: string) => {
        setSelectedExtraServiceId(serviceId)
        if (!serviceId) {
            setExtraName('')
            setExtraPrice('')
            return
        }
        const svc = services.find(s => s.id === serviceId)
        if (svc) {
            setExtraName(svc.name)
            const price = dynamicPrices[svc.id] ?? svc.base_price ?? 0
            setExtraPrice(price.toString())
        }
    }

    const handleAddExtra = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!extraName || !extraPrice) return
        const price = parseFloat(extraPrice)
        if (isNaN(price) || price < 0) return

        setExtrasList([...extrasList, { name: extraName, price }])
        setExtraName('')
        setExtraPrice('')
        setSelectedExtraServiceId('')
    }

    const handleRemoveExtra = (e: React.MouseEvent, index: number) => {
        e.preventDefault()
        e.stopPropagation()
        setExtrasList(extrasList.filter((_, i) => i !== index))
    }

    // Reset when modal opens with new initials
    useEffect(() => {
        if (isOpen) {
            setSelectedServiceId(initialServiceId)
            setSelectedDate(initialDate)
            setSelectedTime(initialHour)
            setBookingError(null)
            setPetSearchTerm('')
            setExtrasList([])
            setExtraName('')
            setExtraPrice('')
            setSelectedExtraServiceId('')
            
            if (initialPetId) {
                // If initialPetId provided, try to search it
                searchPets(initialPetId).then(results => {
                    const found = (results as any[]).find(p => p.id === initialPetId)
                    if (found) setSelectedPets([found])
                }).catch(() => {})
            } else {
                setSelectedPets([])
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
                setShowPetResults(true)
            } catch (err) {
                console.error('Error searching pets:', err)
            } finally {
                setIsSearching(false)
            }
        }, 350)

        return () => clearTimeout(timer)
    }, [petSearchTerm])

    // Fetch Dynamic Prices when Pets or Date changes
    useEffect(() => {
        const fetchPrices = async () => {
            const firstPet = selectedPets[0]
            if (firstPet && selectedDate) {
                setLoadingPrices(true)
                try {
                    const { calculateManyDynamicPrices } = await import('@/app/actions/pricing')
                    const serviceIds = services.map((s: Service) => s.id)
                    const results = await calculateManyDynamicPrices(firstPet.id, serviceIds, selectedDate)
                    
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
    }, [selectedPets, selectedDate, services])

    const handleAddPet = (pet: Pet) => {
        if (!selectedPets.some(p => p.id === pet.id)) {
            setSelectedPets(prev => [...prev, pet])
        }
        setPetSearchTerm('')
        setShowPetResults(false)
    }

    const handleRemovePet = (petId: string) => {
        setSelectedPets(prev => prev.filter(p => p.id !== petId))
    }

    const validate = useCallback(() => {
        if (selectedPets.length === 0 || !selectedServiceId) return true

        const svc = services.find((s: Service) => s.id === selectedServiceId)
        if (!svc) return true

        // Validate each pet for species compatibility
        for (const pet of selectedPets) {
            const petSpecies = pet.species.toLowerCase() === 'cão' || pet.species.toLowerCase() === 'dog' ? 'dog' : 'cat'

            // 1. Target Species
            if (svc.target_species && svc.target_species !== 'both' && svc.target_species !== petSpecies) {
                setBookingError(`O pet "${pet.name}" não é compatível: este serviço é exclusivo para ${svc.target_species === 'dog' ? 'Cães' : 'Gatos'}.`)
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
                    setBookingError(`Este serviço só é permitido para ${allowed} às ${days[dayOfWeek]}s (Pet: ${pet.name}).`)
                    return false
                }
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
                    for (const pet of selectedPets) {
                        const petSpecies = pet.species.toLowerCase() === 'cão' || pet.species.toLowerCase() === 'dog' ? 'dog' : 'cat'
                        if (allowedSpec.length > 0 && !allowedSpec.includes(petSpecies)) {
                            const allowed = allowedSpec.map(s => s === 'dog' ? 'Cães' : 'Gatos').join(' e ')
                            setBookingError(`Horário reservado exclusivamente para ${allowed} (${pet.name}).`)
                            return false
                        }
                    }
                    if (allowedSpec.length === 0) {
                        setBookingError(`Horário bloqueado: ${conflictingBlock.reason}`)
                        return false
                    }
                }
            }
        }

        setBookingError(null)
        return true
    }, [selectedPets, selectedServiceId, selectedDate, selectedTime, services, blocks])

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

    // Categorias ordenadas
    const categoryOrder = ['Banho e Tosa', 'Creche', 'Hospedagem', 'Outros']
    const groupedServices = services
        .filter((s: Service) => {
            if (initialCategory && s.service_categories?.name !== initialCategory) return false
            if (selectedPets.length === 0) return true
            // If all selected pets are cats, hide dog-only services
            const allCats = selectedPets.every(p => p.species.toLowerCase() === 'gato' || p.species.toLowerCase() === 'cat')
            const allDogs = selectedPets.every(p => p.species.toLowerCase() === 'cão' || p.species.toLowerCase() === 'dog')
            if (allCats && s.target_species === 'dog') return false
            if (allDogs && s.target_species === 'cat') return false
            return true
        })
        .reduce((acc, s: Service) => {
            const cat = s.service_categories?.name || 'Outros'
            if (!acc[cat]) acc[cat] = []
            acc[cat].push(s)
            return acc
        }, {} as Record<string, Service[]>)

    const sortedCategories = Object.keys(groupedServices).sort((a, b) => {
        const idxA = categoryOrder.indexOf(a)
        const idxB = categoryOrder.indexOf(b)
        if (idxA !== -1 && idxB !== -1) return idxA - idxB
        if (idxA !== -1) return -1
        if (idxB !== -1) return 1
        return a.localeCompare(b)
    })

    // Coleta outros pets dos mesmos tutores que já estão na busca
    const sameTutorSiblings = searchResults.filter(
        sr => selectedPets.some(sp => sp.customers?.name && sp.customers.name === sr.customers?.name) &&
              !selectedPets.some(sp => sp.id === sr.id)
    )

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 className={styles.modalTitle}>Novo Agendamento</h2>
                
                <form action={handleFormAction}>
                    <div className={styles.formGroup}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <label className={styles.label}>
                                Pets Selecionados * {selectedPets.length > 1 && `(${selectedPets.length})`}
                            </label>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                (Você pode adicionar múltiplos pets de qualquer tutor)
                            </span>
                        </div>

                        {/* Chips dos pets já selecionados */}
                        {selectedPets.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                                {selectedPets.map(p => (
                                    <span key={p.id} style={{
                                        background: 'rgba(59, 130, 246, 0.15)',
                                        border: '1px solid rgba(59, 130, 246, 0.5)',
                                        borderRadius: '20px',
                                        padding: '0.35rem 0.75rem',
                                        fontSize: '0.85rem',
                                        color: '#bfdbfe',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        fontWeight: 500
                                    }}>
                                        <span>{p.species?.toLowerCase() === 'gato' || p.species?.toLowerCase() === 'cat' ? '🐱' : '🐶'}</span>
                                        <strong>{p.name}</strong>
                                        <span style={{ opacity: 0.8, fontSize: '0.75rem' }}>
                                            ({p.customers?.name || 'Sem tutor'})
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemovePet(p.id)}
                                            style={{
                                                background: 'rgba(239, 68, 68, 0.2)',
                                                border: 'none',
                                                borderRadius: '50%',
                                                width: '18px',
                                                height: '18px',
                                                color: '#f87171',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.8rem',
                                                fontWeight: 'bold',
                                                marginLeft: '0.2rem'
                                            }}
                                            title="Remover este pet"
                                        >
                                            ✕
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                placeholder={selectedPets.length === 0 ? "🔍 Pesquisar pet ou tutor..." : "+ Adicionar outro pet..."}
                                className={styles.input}
                                value={petSearchTerm}
                                onChange={(e) => {
                                    setPetSearchTerm(e.target.value)
                                    setShowPetResults(true)
                                }}
                                onFocus={() => {
                                    if (petSearchTerm.length >= 2) setShowPetResults(true)
                                }}
                            />
                            
                            {showPetResults && (isSearching || petSearchTerm.length >= 2) && (
                                <div className={styles.searchResultsContainer}>
                                    {isSearching ? (
                                        <div className={styles.searchResultItem}>Buscando...</div>
                                    ) : searchResults.length > 0 ? (
                                        searchResults.map((p: Pet) => {
                                            const isSelected = selectedPets.some(sp => sp.id === p.id)
                                            return (
                                                <div
                                                    key={p.id}
                                                    className={styles.searchResultItem}
                                                    style={{ opacity: isSelected ? 0.5 : 1, cursor: isSelected ? 'default' : 'pointer' }}
                                                    onClick={() => {
                                                        if (!isSelected) handleAddPet(p)
                                                    }}
                                                >
                                                    <span className={styles.resultPetName}>
                                                        {p.species?.toLowerCase() === 'gato' || p.species?.toLowerCase() === 'cat' ? '🐱' : '🐶'} {p.name} {isSelected && '✓ (Adicionado)'}
                                                    </span>
                                                    <span className={styles.resultTutorName}>
                                                        👤 {p.customers?.name || 'Sem tutor'} • {p.breed || 'SRD'}
                                                    </span>
                                                </div>
                                            )
                                        })
                                    ) : (
                                        <div className={styles.searchResultItem}>Nenhum pet encontrado</div>
                                    )}
                                </div>
                            )}

                            {/* Sugestões de outros pets do mesmo tutor */}
                            {sameTutorSiblings.length > 0 && (
                                <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                                    Sugestão do mesmo tutor:{' '}
                                    {sameTutorSiblings.slice(0, 3).map(sibling => (
                                        <button
                                            key={sibling.id}
                                            type="button"
                                            onClick={() => handleAddPet(sibling)}
                                            style={{
                                                background: 'rgba(255,255,255,0.08)',
                                                border: '1px dashed #60a5fa',
                                                color: '#93c5fd',
                                                borderRadius: '12px',
                                                padding: '0.2rem 0.5rem',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                marginRight: '0.4rem'
                                            }}
                                        >
                                            + Adicionar {sibling.name}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Inputs hidden para envio ao backend */}
                            <input type="hidden" name="petIds" value={JSON.stringify(selectedPets.map(p => p.id))} />
                            <input type="hidden" name="petId" value={selectedPets[0]?.id || ''} required={selectedPets.length === 0} />
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
                            {sortedCategories.map(category => (
                                <optgroup key={category} label={`📁 ${category}`}>
                                    {groupedServices[category].map(s => (
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
                                            Preço base: R$ {dynamicPrices[selectedServiceId].toFixed(2)}
                                            {selectedPets.length > 1 && ` (calculado individualmente para cada um dos ${selectedPets.length} pets)`}
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

                    <div className={styles.taxiGroup} style={{ marginTop: '1rem' }}>
                        <div className={styles.taxiHeader} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span className={styles.taxiTitle}>➕ Adicionar Serviços Extras?</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Inclua serviços adicionais que serão cobrados à parte deste agendamento.</span>
                        </div>
                        
                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                                <label className={styles.labelSmall} style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>SELECIONAR SERVIÇO CADASTRADO (OPCIONAL)</label>
                                <select
                                    className={styles.select}
                                    value={selectedExtraServiceId}
                                    onChange={(e) => handleSelectExtraService(e.target.value)}
                                    style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                                >
                                    <option value="">Selecione para autocompletar...</option>
                                    {services.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} - R$ {(dynamicPrices[s.id] ?? s.base_price ?? 0).toFixed(2)}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                                <div>
                                    <label className={styles.labelSmall} style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>NOME DO EXTRA</label>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        value={extraName}
                                        onChange={(e) => setExtraName(e.target.value)}
                                        placeholder="Ex: Corte de Unha"
                                        style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                                    />
                                </div>
                                <div>
                                    <label className={styles.labelSmall} style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>VALOR (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className={styles.input}
                                        value={extraPrice}
                                        onChange={(e) => setExtraPrice(e.target.value)}
                                        placeholder="0.00"
                                        style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                                    />
                                </div>
                                <button
                                    onClick={handleAddExtra}
                                    className={styles.cancelBtn}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        fontSize: '0.85rem',
                                        height: '38px',
                                        borderColor: 'var(--primary)',
                                        color: 'white',
                                        background: 'var(--primary)',
                                        borderRadius: '8px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    + Add
                                </button>
                            </div>
                        </div>

                        {extrasList.length > 0 && (
                            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>EXTRAS ADICIONADOS:</span>
                                {extrasList.map((item, index) => (
                                    <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>{item.name}</span>
                                            <span style={{ fontSize: '0.8rem', color: '#E8826A', fontWeight: 700 }}>R$ {item.price.toFixed(2)}</span>
                                        </div>
                                        <button
                                            onClick={(e) => handleRemoveExtra(e, index)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#ef4444',
                                                fontSize: '1.2rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '4px'
                                            }}
                                            title="Remover"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Total Extras:</span>
                                    <span style={{ color: '#E8826A' }}>R$ {extrasList.reduce((sum, item) => sum + item.price, 0).toFixed(2)}</span>
                                </div>
                            </div>
                        )}
                        <input type="hidden" name="extras" value={JSON.stringify(extrasList)} />
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
                        <SubmitButton disabled={!!bookingError || selectedPets.length === 0 || !selectedServiceId} petCount={selectedPets.length} />
                    </div>
                </form>
            </div>
        </div>
    )
}
