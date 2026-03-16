'use client'
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback, useActionState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import {
    createService,
    updateService,
    deleteService,
    createPricingRule,
    deletePricingRule
} from '@/app/actions/service'

interface PricingRule {
    id: string
    service_id: string
    weight_min: number | null
    weight_max: number | null
    size: 'small' | 'medium' | 'large' | 'giant' | null
    day_of_week: number | null
    fixed_price: number
}

interface ServiceCategory {
    id: string
    name: string
    color: string
    icon: string
}

interface Service {
    id: string
    name: string
    description: string | null
    base_price: number
    category: string
    category_id?: string
    service_categories?: ServiceCategory
    duration_minutes: number | null
    pricing_matrix: PricingRule[]
    scheduling_rules?: { day: number, species: string[] }[]
    target_species?: 'dog' | 'cat' | 'both'
    checklist_template?: string[]
}

const initialState = { message: '', success: false }

export default function ServicesPage() {
    const supabase = createClient()
    const [services, setServices] = useState<Service[]>([])
    const [categories, setCategories] = useState<ServiceCategory[]>([])
    const [searchTerm, setSearchTerm] = useState('')

    // Modal State
    const [showModal, setShowModal] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [selectedService, setSelectedService] = useState<Service | null>(null)

    // Scheduling Rules State
    const [schedulingRules, setSchedulingRules] = useState<{ day: number, species: string[] }[]>([])
    const [newRuleDay, setNewRuleDay] = useState<string>('')
    const [newRuleSpecies, setNewRuleSpecies] = useState<string[]>([])

    // Checklist State
    const [checklistTemplate, setChecklistTemplate] = useState<string[]>([])
    const [newItemText, setNewItemText] = useState('')

    // Loading State
    const [ruleLoading, setRuleLoading] = useState(false)

    // Form Action States
    const [createState, createAction, isCreatePending] = useActionState(createService, initialState)
    const [updateState, updateAction, isUpdatePending] = useActionState(updateService, initialState)

    useEffect(() => {
        fetchData()
    }, [])

    useEffect(() => {
        if (!showModal) {
            // Reset form state when modal closes
            setSelectedService(null)
            setIsEditing(false)
            setSchedulingRules([])
            setChecklistTemplate([])
            setNewRuleDay('')
            setNewRuleSpecies([])
            setNewItemText('')
        }
    }, [showModal])

    useEffect(() => {
        if (createState.success || updateState.success) {
            setShowModal(false)
            fetchData()
        }
    }, [createState, updateState])

    const fetchData = async () => {
        const { data: cats } = await supabase.from('service_categories').select('*').order('name')
        if (cats) setCategories(cats)

        const { data: svcs } = await supabase.from('services').select(`
            *,
            service_categories (*),
            pricing_matrix (*)
        `).order('name')

        if (svcs) {
            const formatted: Service[] = svcs.map((s: any) => ({
                ...s,
                pricing_matrix: s.pricing_matrix || [],
                scheduling_rules: s.scheduling_rules || [],
                checklist_template: s.checklist_template || []
            }))
            setServices(formatted)
        }
    }

    const handleEdit = (service: Service) => {
        setSelectedService(service)
        setSchedulingRules(service.scheduling_rules || [])
        setChecklistTemplate(service.checklist_template || [])
        setIsEditing(true)
        setShowModal(true)
    }

    const handleDeleteService = async () => {
        if (!selectedService || !confirm('Tem certeza que deseja excluir este serviço?')) return
        await deleteService(selectedService.id)
        setShowModal(false)
        fetchData()
    }

    // --- Scheduling Rules Helpers ---
    const toggleSpecies = (species: string) => {
        setNewRuleSpecies(prev =>
            prev.includes(species) ? prev.filter(s => s !== species) : [...prev, species]
        )
    }

    const handleAddSchedulingRule = () => {
        if (!newRuleDay || newRuleSpecies.length === 0) return
        const day = parseInt(newRuleDay)
        const existing = schedulingRules.findIndex(r => r.day === day)

        const newRule = { day, species: newRuleSpecies }

        let updated = [...schedulingRules]
        if (existing >= 0) {
            updated[existing] = newRule
        } else {
            updated.push(newRule)
        }

        setSchedulingRules(updated)
        setNewRuleDay('')
        setNewRuleSpecies([])
    }

    const handleRemoveSchedulingRule = (index: number) => {
        setSchedulingRules(prev => prev.filter((_, i) => i !== index))
    }

    // --- Checklist Helpers ---
    const handleAddChecklistItem = () => {
        if (!newItemText.trim()) return
        setChecklistTemplate(prev => [...prev, newItemText.trim()])
        setNewItemText('')
    }

    const handleRemoveChecklistItem = (index: number) => {
        setChecklistTemplate(prev => prev.filter((_, i) => i !== index))
    }

    // --- Pricing Rule Actions ---
    const handleAddRule = async (formData: FormData) => {
        if (!selectedService) return
        setRuleLoading(true)
        formData.append('service_id', selectedService.id)
        await createPricingRule(initialState, formData)

        // Refresh data but keep modal open
        await fetchData()
        // We need to re-find the selected service to update the matrix in the modal
        const { data } = await supabase.from('services').select('*, pricing_matrix(*)').eq('id', selectedService.id).single()
        if (data) {
            setSelectedService({ ...data, pricing_matrix: (data as any).pricing_matrix || [] })
        }
        setRuleLoading(false)
    }

    const handleDeleteRule = async (id: string) => {
        if (!confirm('Excluir regra?')) return
        await deletePricingRule(id)
        await fetchData()
        const { data } = await supabase.from('services').select('*, pricing_matrix(*)').eq('id', selectedService!.id).single()
        if (data) {
            setSelectedService({ ...data, pricing_matrix: (data as any).pricing_matrix || [] })
        }
    }

    const filteredServices = services.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.service_categories?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Serviços</h1>
                    <p className={styles.subtitle}>Gerencie os serviços oferecidos no petshop</p>
                </div>
                <button onClick={() => setShowModal(true)} className={styles.addBtn}>
                    + Novo Serviço
                </button>
            </div>

            <div className={styles.searchBar}>
                <input
                    type="text"
                    placeholder="Buscar serviço..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className={styles.searchInput}
                />
            </div>

            <div className={styles.grid}>
                {filteredServices.map(service => (
                    <div key={service.id} className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={styles.iconWrapper}>
                                {service.service_categories?.icon || '📦'}
                            </div>
                            <div className={styles.cardInfo}>
                                <h3>{service.name}</h3>
                                <span className={styles.category}>{service.service_categories?.name || 'Sem categoria'}</span>
                            </div>
                        </div>
                        <div className={styles.cardBody}>
                            <p className={styles.price}>R$ {service.base_price.toFixed(2)}</p>
                            <p className={styles.duration}>⏱ {service.duration_minutes} min</p>
                            {service.target_species && (
                                <p className={styles.speciesTag}>
                                    {service.target_species === 'both' ? '🐶 e 🐱' : service.target_species === 'dog' ? '🐶 Cães' : '🐱 Gatos'}
                                </p>
                            )}
                        </div>
                        <button onClick={() => handleEdit(service)} className={styles.editBtn}>
                            Editar / Regras
                        </button>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <h2>{isEditing ? 'Editar Serviço' : 'Novo Serviço'}</h2>
                            <button onClick={() => setShowModal(false)} className={styles.closeBtn}>&times;</button>
                        </div>

                        <form action={isEditing ? updateAction : createAction} id="serviceForm" className={styles.formScroller}>
                            {isEditing && <input type="hidden" name="id" value={selectedService?.id} />}

                            {/* Hidden JSON Inputs */}
                            <input type="hidden" name="scheduling_rules" value={JSON.stringify(schedulingRules)} />
                            <input type="hidden" name="checklist_template" value={JSON.stringify(checklistTemplate)} />

                            <div className={styles.formGrid}>
                                <div className={styles.formColumn}>
                                    <div className={styles.inputGroup}>
                                        <label className={styles.label}>Nome do Serviço</label>
                                        <input name="name" className={styles.input} defaultValue={selectedService?.name || ''} required placeholder="Ex: Banho Completo" />
                                    </div>

                                    <div className={styles.inputGroup}>
                                        <label className={styles.label}>Categoria</label>
                                        <select
                                            name="category_id"
                                            className={styles.select}
                                            defaultValue={selectedService?.category_id || ''}
                                            required
                                            onChange={(e) => {
                                                const cat = categories.find(c => c.id === e.target.value)
                                                const input = document.getElementById('category_name_input') as HTMLInputElement
                                                if (input && cat) input.value = cat.name
                                            }}
                                        >
                                            <option value="" disabled>Selecione...</option>
                                            {categories.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                                            ))}
                                        </select>
                                        <input type="hidden" name="category_name" id="category_name_input" defaultValue={selectedService?.service_categories?.name || ''} />
                                    </div>

                                    <div className={styles.inputGroup}>
                                        <label className={styles.label}>Espécie Alvo</label>
                                        <select name="target_species" className={styles.select} defaultValue={selectedService?.target_species || 'both'}>
                                            <option value="both">🐶 e 🐱 (Ambos)</option>
                                            <option value="dog">🐶 Cães Apenas</option>
                                            <option value="cat">🐱 Gatos Apenas</option>
                                        </select>
                                    </div>

                                    <div className={styles.row}>
                                        <div className={styles.inputGroup}>
                                            <label className={styles.label}>Preço Base (R$)</label>
                                            <input name="base_price" type="number" step="0.01" className={styles.input} defaultValue={selectedService?.base_price} required placeholder="0,00" />
                                        </div>

                                        <div className={styles.inputGroup}>
                                            <label className={styles.label}>Duração Estimada</label>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <input
                                                    name="duration_hours"
                                                    type="number"
                                                    min="0"
                                                    placeholder="Hrs"
                                                    className={styles.input}
                                                    defaultValue={selectedService?.duration_minutes ? Math.floor(selectedService.duration_minutes / 60) : 0}
                                                />
                                                <input
                                                    name="duration_minutes_part"
                                                    type="number"
                                                    min="0"
                                                    max="59"
                                                    placeholder="Min"
                                                    className={styles.input}
                                                    defaultValue={selectedService?.duration_minutes ? selectedService.duration_minutes % 60 : 30}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles.inputGroup}>
                                        <label className={styles.label}>Descrição</label>
                                        <textarea name="description" className={styles.input} defaultValue={selectedService?.description || ''} rows={4} placeholder="Breve descrição do serviço..." />
                                    </div>
                                </div>

                                <div className={styles.formColumn}>
                                    {/* Scheduling Rules UI */}
                                    <div className={styles.sectionBox}>
                                        <h4>🕒 Restrições por Dia e Espécie</h4>
                                        <div className={styles.inlineForm}>
                                            <select value={newRuleDay} onChange={e => setNewRuleDay(e.target.value)} className={styles.select}>
                                                <option value="">Dia da semana...</option>
                                                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                                            </select>
                                            <div className={styles.checkboxGroup}>
                                                <label className={styles.checkLabel}>
                                                    <input type="checkbox" checked={newRuleSpecies.includes('dog')} onChange={() => toggleSpecies('dog')} />
                                                    🐶 Cães
                                                </label>
                                                <label className={styles.checkLabel}>
                                                    <input type="checkbox" checked={newRuleSpecies.includes('cat')} onChange={() => toggleSpecies('cat')} />
                                                    🐱 Gatos
                                                </label>
                                            </div>
                                            <button type="button" onClick={handleAddSchedulingRule} className={styles.addBtnSmall}>+ Add Regra</button>
                                        </div>
                                        <div className={styles.tagsContainer}>
                                            {schedulingRules.length === 0 && <p className={styles.emptyText}>Nenhuma restrição definida.</p>}
                                            {schedulingRules.map((rule, idx) => (
                                                <span key={idx} className={styles.tag}>
                                                    <strong>{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][rule.day]}</strong>: {rule.species.map(s => s === 'dog' ? '🐶' : '🐱').join(', ')}
                                                    <button type="button" onClick={() => handleRemoveSchedulingRule(idx)} className={styles.tagRemove}>&times;</button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Checklist UI */}
                                    <div className={styles.sectionBox}>
                                        <h4>📋 Checklist do Serviço</h4>
                                        <div className={styles.inlineForm}>
                                            <input
                                                type="text"
                                                value={newItemText}
                                                onChange={e => setNewItemText(e.target.value)}
                                                placeholder="Adicionar tarefa..."
                                                className={styles.input}
                                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddChecklistItem())}
                                            />
                                            <button type="button" onClick={handleAddChecklistItem} className={styles.addBtnSmall}>+</button>
                                        </div>
                                        <ul className={styles.checklist}>
                                            {checklistTemplate.length === 0 && <p className={styles.emptyText}>Checklist vazio.</p>}
                                            {checklistTemplate.map((item, idx) => (
                                                <li key={idx} className={styles.checklistItem}>
                                                    <span>{item}</span>
                                                    <button type="button" onClick={() => handleRemoveChecklistItem(idx)} className={styles.deleteBtnSmall}>🗑️</button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.modalActions}>
                                {isEditing && (
                                    <button type="button" className={styles.deleteServiceBtn} onClick={handleDeleteService}>Excluir</button>
                                )}
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className={styles.submitBtn} disabled={isCreatePending || isUpdatePending}>
                                    {isEditing ? 'Salvar' : 'Criar'}
                                </button>
                            </div>
                        </form>

                        {/* Pricing Matrix - Edit Mode Only */}
                        {isEditing && selectedService && (
                            <div className={styles.matrixSection}>
                                <h3>Matriz de Preços</h3>
                                <table className={styles.matrixTable}>
                                    <thead>
                                        <tr>
                                            <th>Min/Max (kg)</th>
                                            <th>Porte</th>
                                            <th>Dia</th>
                                            <th>Preço</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedService.pricing_matrix?.map(rule => (
                                            <tr key={rule.id}>
                                                <td>{rule.weight_min ?? 0} - {rule.weight_max ?? '∞'}</td>
                                                <td>{rule.size || '-'}</td>
                                                <td>{rule.day_of_week !== null ? ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][rule.day_of_week] : '-'}</td>
                                                <td>R$ {rule.fixed_price.toFixed(2)}</td>
                                                <td><button type="button" onClick={() => handleDeleteRule(rule.id)} className={styles.deleteBtnSmall}>🗑️</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Add Rule Form */}
                                <form action={handleAddRule} className={styles.matrixForm}>
                                    <input name="weight_min" type="number" step="0.1" placeholder="Min Kg" className={styles.inputSmall} />
                                    <input name="weight_max" type="number" step="0.1" placeholder="Max Kg" className={styles.inputSmall} />
                                    <select name="size" className={styles.selectSmall}>
                                        <option value="">Porte...</option>
                                        <option value="small">Peq</option>
                                        <option value="medium">Med</option>
                                        <option value="large">Gnd</option>
                                        <option value="giant">Gig</option>
                                    </select>
                                    <select name="day_of_week" className={styles.selectSmall}>
                                        <option value="">Dia...</option>
                                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <option key={i} value={i}>{d}</option>)}
                                    </select>
                                    <input name="price" type="number" step="0.01" placeholder="R$" className={styles.inputSmall} required />
                                    <button type="submit" className={styles.addBtnSmall} disabled={ruleLoading}>+</button>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}


