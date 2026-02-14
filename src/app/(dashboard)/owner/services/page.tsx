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

    // Form Action States
    const [createState, createAction, isCreatePending] = useActionState(createService, initialState)
        // ... (rest of hook definitions)

        // ... (fetchData implementation)

        // ... (rest of component logic)

        < div className = { styles.inputGroup } >
                                        <label className={styles.label}>Categoria</label>
                                        <select
                                            name="category_id"
                                            className={styles.select}
                                            defaultValue={selectedService?.category_id || categories.find(c => c.name === 'Banho e Tosa')?.id || ''}
                                            required
                                            onChange={(e) => {
                                                const cat = categories.find(c => c.id === e.target.value)
                                                const input = document.getElementById('category_name_input') as HTMLInputElement
                                                if (input && cat) input.value = cat.name
                                            }}
                                        >
                                            <option value="" disabled>Selecione...</option>
                                            {categories.map(cat => (
                                                <option key={cat.id} value={cat.id}>
                                                    {cat.icon} {cat.name}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="hidden"
                                            name="category_name"
                                            id="category_name_input"
                                            defaultValue={selectedService?.service_categories?.name || 'Banho e Tosa'}
                                        />
                                    </div >
                                    <div className={styles.inputGroup}>
                                        <label className={styles.label}>Espécie Alvo</label>
                                        <select
                                            name="target_species"
                                            className={styles.select}
                                            defaultValue={selectedService?.target_species || 'both'}
                                        >
                                            <option value="both">🐶 e 🐱 (Ambos)</option>
                                            <option value="dog">🐶 Cães Apenas</option>
                                            <option value="cat">🐱 Gatos Apenas</option>
                                        </select>
                                    </div>
                                    <div className={styles.inputGroup}>
                                        <label className={styles.label}>Espécie Alvo</label>
                                        <select
                                            name="target_species"
                                            className={styles.select}
                                            defaultValue={selectedService?.target_species || 'both'}
                                        >
                                            <option value="both">🐶 e 🐱 (Ambos)</option>
                                            <option value="dog">🐶 Cães Apenas</option>
                                            <option value="cat">🐱 Gatos Apenas</option>
                                        </select>
                                    </div>
                                    <div className={styles.inputGroup}>
                                        <label className={styles.label}>Preço Base (R$)</label>
                                        <input name="base_price" type="number" step="0.01" className={styles.input} defaultValue={selectedService?.base_price} required />
                                    </div>
    {/* ... rest of inputs */ }
                                    <div className={styles.inputGroup}>
                                        <label className={styles.label}>Duração</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <input
                                                name="duration_hours"
                                                type="number"
                                                min="0"
                                                placeholder="Horas"
                                                className={styles.input}
                                                defaultValue={selectedService?.duration_minutes ? Math.floor(selectedService.duration_minutes / 60) : ''}
                                            />
                                            <input
                                                name="duration_minutes_part"
                                                type="number"
                                                min="0"
                                                max="59"
                                                placeholder="Min"
                                                className={styles.input}
                                                defaultValue={selectedService?.duration_minutes ? selectedService.duration_minutes % 60 : ''}
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.inputGroup} style={{ gridColumn: '1/-1' }}>
                                        <label className={styles.label}>Descrição</label>
                                        <input name="description" className={styles.input} defaultValue={selectedService?.description || ''} />
                                    </div>
                                </div >

        {/* Scheduling Rules Section */ }
        < div style = {{ marginBottom: '1.5rem', border: '1px solid var(--border)', padding: '1rem', borderRadius: '8px' }
}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#666' }}>🕒 Restrições de Agendamento (Dia x Espécie)</h4>

                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end', marginBottom: '0.5rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label className={styles.label} style={{ fontSize: '0.8rem' }}>Dia da Semana</label>
                                            <select
                                                className={styles.select}
                                                value={newRuleDay}
                                                onChange={(e) => setNewRuleDay(e.target.value)}
                                            >
                                                <option value="">Selecione...</option>
                                                <option value="0">Domingo</option>
                                                <option value="1">Segunda</option>
                                                <option value="2">Terça</option>
                                                <option value="3">Quarta</option>
                                                <option value="4">Quinta</option>
                                                <option value="5">Sexta</option>
                                                <option value="6">Sábado</option>
                                            </select>
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <label className={styles.label} style={{ fontSize: '0.8rem' }}>Permitir Apenas:</label>
                                            <div style={{ display: 'flex', gap: '1rem', padding: '0.5rem 0' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={newRuleSpecies.includes('dog')}
                                                        onChange={() => toggleSpecies('dog')}
                                                    /> Cães
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={newRuleSpecies.includes('cat')}
                                                        onChange={() => toggleSpecies('cat')}
                                                    /> Gatos
                                                </label>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.addBtnSmall}
                                            onClick={handleAddSchedulingRule}
                                            style={{ height: '36px' }}
                                        >
                                            + Regra
                                        </button>
                                    </div>

{
    schedulingRules.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {schedulingRules.map((rule, idx) => (
                <div key={idx} style={{ background: '#f1f5f9', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong>{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][rule.day]}:</strong>
                    <span>{rule.species.map(s => s === 'dog' ? 'Cães' : 'Gatos').join(', ')}</span>
                    <button
                        type="button"
                        onClick={() => handleRemoveSchedulingRule(idx)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', fontWeight: 'bold' }}
                    >×</button>
                </div>
            ))}
        </div>
    )
}
                                </div >

    {/* Checklist Template Section */ }
    < div style = {{ marginBottom: '1.5rem', border: '1px solid var(--border)', padding: '1rem', borderRadius: '8px', background: '#f8fafc' }}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>📋 Checklist Padrão (Procedimentos)</h4>
                                    <input type="hidden" name="checklist_template" value={JSON.stringify(checklistTemplate)} />

                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <input
                                            type="text"
                                            placeholder="Adicionar item (ex: Cortar unhas, Lavar)..."
                                            className={styles.input}
                                            value={newItemText}
                                            onChange={(e) => setNewItemText(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddChecklistItem(); } }}
                                            style={{ background: 'white' }}
                                        />
                                        <button
                                            type="button"
                                            className={styles.addBtnSmall}
                                            onClick={handleAddChecklistItem}
                                            style={{ height: 'auto' }}
                                        >
                                            + Adicionar
                                        </button>
                                    </div>

{
    checklistTemplate.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {checklistTemplate.map((item, idx) => (
                <li key={idx} style={{
                    background: 'white',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    color: '#334155'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '20px', height: '20px', borderRadius: '50%',
                            background: '#e2e8f0', color: '#64748b', fontSize: '0.7rem', fontWeight: 'bold'
                        }}>
                            {idx + 1}
                        </span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{item}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleRemoveChecklistItem(idx)}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
                        title="Remover item"
                    >
                        ✕
                    </button>
                </li>
            ))}
        </ul>
    ) : (
        <div style={{
            textAlign: 'center',
            padding: '1.5rem',
            color: '#94a3b8',
            fontSize: '0.85rem',
            border: '1px dashed #cbd5e1',
            borderRadius: '6px'
        }}>
            Nenhum item adicionado ao checklist ainda.
        </div>
    )
}
                                </div >

    <div className={styles.modalActions} style={{ marginTop: 0, marginBottom: '2rem' }}>
        {isEditing && (
            <button type="button" className={styles.deleteServiceBtn} onClick={handleDeleteService}>Excluir Serviço</button>
        )}
        <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancelar</button>
        <button type="submit" form="serviceForm" className={styles.submitBtn} disabled={isCreatePending || isUpdatePending}>
            {isEditing ? 'Salvar Alterações' : 'Criar Serviço'}
        </button>
    </div>
                            </form >

    {/* Pricing Matrix Section - Only in Edit Mode */ }
{
    isEditing && selectedService && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <h3 className={styles.sectionTitle}>Matriz de Preços (Regras Específicas)</h3>
            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '1rem' }}>
                Adicione regras para variar o preço com base no peso, porte ou dia da semana. Se nenhuma regra corresponder, o Preço Base será usado.
            </p>

            <table className={styles.matrixTable}>
                <thead>
                    <tr>
                        <th>Min (kg)</th>
                        <th>Max (kg)</th>
                        <th>Porte</th>
                        <th>Dia Sem.</th>
                        <th>Valor (R$)</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody>
                    {selectedService.pricing_matrix?.map(rule => (
                        <tr key={rule.id}>
                            <td>{rule.weight_min !== null ? rule.weight_min : '-'}</td>
                            <td>{rule.weight_max !== null ? rule.weight_max : '-'}</td>
                            <td>{rule.size || '-'}</td>
                            <td>{rule.day_of_week !== null ? ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][rule.day_of_week] : '-'}</td>
                            <td style={{ fontWeight: 'bold', color: 'var(--success)' }}>R$ {rule.fixed_price.toFixed(2)}</td>
                            <td>
                                <button type="button" className={styles.deleteBtnSmall} onClick={() => handleDeleteRule(rule.id)}>🗑️</button>
                            </td>
                        </tr>
                    ))}
                    {(!selectedService.pricing_matrix || selectedService.pricing_matrix.length === 0) && (
                        <tr>
                            <td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>Nenhuma regra cadastrada.</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Add Rule Form */}
            <form action={handleAddRule}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Adicionar Nova Regra</h4>
                <div className={styles.addRuleForm} style={{ alignItems: 'end' }}>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Min Kg</label>
                        <input name="weight_min" type="number" step="0.1" className={styles.input} placeholder="0" />
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Max Kg</label>
                        <input name="weight_max" type="number" step="0.1" className={styles.input} placeholder="10" />
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Porte</label>
                        <select name="size" className={styles.select}>
                            <option value="">Qualquer</option>
                            <option value="small">Pequeno</option>
                            <option value="medium">Médio</option>
                            <option value="large">Grande</option>
                            <option value="giant">Gigante</option>
                        </select>
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Dia</label>
                        <select name="day_of_week" className={styles.select}>
                            <option value="">Qualquer</option>
                            <option value="0">Domingo</option>
                            <option value="1">Segunda</option>
                            <option value="2">Terça</option>
                            <option value="3">Quarta</option>
                            <option value="4">Quinta</option>
                            <option value="5">Sexta</option>
                            <option value="6">Sábado</option>
                        </select>
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Preço (R$)</label>
                        <input name="price" type="number" step="0.01" className={styles.input} required />
                    </div>
                    <button type="submit" className={styles.addBtnSmall} disabled={ruleLoading}>
                        + Adicionar
                    </button>
                </div>
            </form>
        </div>
    )
}
                        </div >
                    </div >
                )
            }
        </div >
    )
}
