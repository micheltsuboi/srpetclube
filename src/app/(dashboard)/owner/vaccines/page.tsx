'use client'

import { useState, useEffect, useCallback } from 'react'
import { Vaccine, VaccineBatch } from '@/types/database'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'

export default function VaccinesPage() {
    const supabase = createClient()
    const [vaccines, setVaccines] = useState<Vaccine[]>([])
    const [batches, setBatches] = useState<VaccineBatch[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const [expandedVaccineId, setExpandedVaccineId] = useState<string | null>(null)
    const [isVaccineModalOpen, setIsVaccineModalOpen] = useState(false)
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
    const [selectedVaccineForBatch, setSelectedVaccineForBatch] = useState<Vaccine | null>(null)

    // Sale State
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false)
    const [selectedBatchToSell, setSelectedBatchToSell] = useState<VaccineBatch | null>(null)
    const [saleData, setSaleData] = useState({
        quantity: 1,
        tempDiscountPercent: 0
    })

    // Form States
    const [vaccineForm, setVaccineForm] = useState({
        name: '',
        manufacturer: '',
        description: '',
        target_animals: 'Cão'
    })

    const [batchForm, setBatchForm] = useState({
        batch_number: '',
        quantity: 0,
        cost_price: 0,
        selling_price: 0,
        expiration_date: ''
    })

    const fetchData = useCallback(async () => {
        try {
            const { data: vaccinesData, error: vaccinesError } = await supabase
                .from('vaccines')
                .select('*')
                .order('name')

            if (vaccinesError) throw vaccinesError
            if (vaccinesData) setVaccines(vaccinesData)

            const { data: batchesData, error: batchesError } = await supabase
                .from('vaccine_batches')
                .select('*')
                .eq('is_active', true)
                .order('expiration_date')

            if (batchesError) throw batchesError
            if (batchesData) setBatches(batchesData)

        } catch (error) {
            console.error('Erro ao buscar dados:', error)
            alert('Erro ao carregar vacinas. Tente novamente.')
        } finally {
            setIsLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleToggleExpand = (id: string) => {
        setExpandedVaccineId(expandedVaccineId === id ? null : id)
    }

    const handleSaveVaccine = async (e: React.FormEvent) => {
        e.preventDefault()

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Get user's organization
            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', user.id)
                .single()

            if (!profile?.org_id) {
                alert('Erro: Organização não encontrada.')
                return
            }

            const { error } = await supabase
                .from('vaccines')
                .insert({
                    org_id: profile.org_id,
                    name: vaccineForm.name,
                    manufacturer: vaccineForm.manufacturer,
                    description: vaccineForm.description,
                    target_animals: [vaccineForm.target_animals],
                    is_active: true
                })

            if (error) throw error

            await fetchData()
            setIsVaccineModalOpen(false)
            setVaccineForm({ name: '', manufacturer: '', description: '', target_animals: 'Cão' })

        } catch (error) {
            console.error('Erro ao salvar vacina:', error)
            alert('Erro ao salvar vacina.')
        }
    }

    const handleOpenBatchModal = (vaccine: Vaccine) => {
        setSelectedVaccineForBatch(vaccine)
        setBatchForm({
            batch_number: '',
            quantity: 0,
            cost_price: 0,
            selling_price: 0,
            expiration_date: ''
        })
        setIsBatchModalOpen(true)
    }

    const handleSaveBatch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedVaccineForBatch) return

        try {
            const { error } = await supabase
                .from('vaccine_batches')
                .insert({
                    vaccine_id: selectedVaccineForBatch.id,
                    batch_number: batchForm.batch_number,
                    quantity: batchForm.quantity,
                    cost_price: batchForm.cost_price,
                    selling_price: batchForm.selling_price,
                    expiration_date: batchForm.expiration_date,
                    is_active: true
                })

            if (error) throw error

            await fetchData()
            setIsBatchModalOpen(false)

        } catch (error) {
            console.error('Erro ao salvar lote:', error)
            alert('Erro ao salvar lote.')
        }
    }

    const getVaccineStock = (vaccineId: string) => {
        return batches
            .filter(b => b.vaccine_id === vaccineId)
            .reduce((acc, curr) => acc + curr.quantity, 0)
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const handleOpenSaleModal = (batch: VaccineBatch) => {
        setSelectedBatchToSell(batch)
        setSaleData({ quantity: 1, tempDiscountPercent: 0 })
        setIsSaleModalOpen(true)
    }

    const handleConfirmSale = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedBatchToSell) return

        try {
            const discountAmount = (selectedBatchToSell.selling_price * saleData.quantity) * (saleData.tempDiscountPercent / 100)
            const finalTotal = (selectedBatchToSell.selling_price * saleData.quantity) - discountAmount

            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Get user's organization
            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', user.id)
                .single()

            if (!profile?.org_id) return

            // 1. Update Vaccine Batch Stock
            const { error: stockError } = await supabase
                .from('vaccine_batches')
                .update({ quantity: selectedBatchToSell.quantity - saleData.quantity })
                .eq('id', selectedBatchToSell.id)

            if (stockError) throw stockError

            // 2. Create Financial Transaction
            const { error: transactionError } = await supabase
                .from('financial_transactions')
                .insert({
                    org_id: profile.org_id,
                    type: 'income',
                    category: 'Venda Vacina',
                    amount: finalTotal,
                    description: `Venda de Vacina (${saleData.quantity}x) - Lote: ${selectedBatchToSell.batch_number}`,
                    created_by: user.id,
                    date: new Date().toISOString()
                })

            if (transactionError) {
                console.error('Erro ao registrar transação:', transactionError)
                alert('Venda realizada, mas houve um erro ao registrar no financeiro.')
            } else {
                alert(`Venda realizada com sucesso!\n\nLote: ${selectedBatchToSell.batch_number}\nTotal: ${formatCurrency(finalTotal)}\nEstoque atualizado e transação registrada.`)
            }

            await fetchData()
            setIsSaleModalOpen(false)
            setSelectedBatchToSell(null)

        } catch (error) {
            console.error('Erro ao processar venda:', error)
            alert('Erro ao processar a venda. Tente novamente.')
        }
    }

    if (isLoading) {
        return (
            <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ fontSize: '1.2rem', color: '#666' }}>Carregando vacinas...</div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>💉 Gestão de Vacinas</h1>
                    <p className={styles.subtitle}>Gerencie vacinas e controle de lotes/validade</p>
                </div>
                <button className={styles.addButton} onClick={() => setIsVaccineModalOpen(true)}>
                    ➕ Nova Vacina
                </button>
            </div>

            <div className={styles.vaccineList}>
                {vaccines.map(vaccine => {
                    const isExpanded = expandedVaccineId === vaccine.id
                    const vaccineBatches = batches.filter(b => b.vaccine_id === vaccine.id)
                    const totalStock = getVaccineStock(vaccine.id)

                    return (
                        <div key={vaccine.id} className={`${styles.vaccineCard} ${isExpanded ? styles.expanded : ''}`}>
                            <div className={styles.vaccineHeader} onClick={() => handleToggleExpand(vaccine.id)}>
                                <div className={styles.vaccineTitle}>
                                    <h3>{vaccine.name}</h3>
                                    <span className={styles.vaccineMeta}>{vaccine.manufacturer} • {vaccine.target_animals.join(', ')}</span>
                                </div>
                                <div className={styles.vaccineStats}>
                                    <div className={styles.statItem}>
                                        <span className={styles.statLabel}>Estoque Total</span>
                                        <span className={`${styles.statValue} ${styles.stock}`}>{totalStock} un</span>
                                    </div>
                                    <div className={styles.expandIcon}>▼</div>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className={styles.batchesSection}>
                                    <div className={styles.batchHeader}>
                                        <h4 className={styles.batchTitle}>Lotes Cadastrados</h4>
                                        <button
                                            className={styles.addBatchButton}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleOpenBatchModal(vaccine)
                                            }}
                                        >
                                            + Novo Lote
                                        </button>
                                    </div>

                                    {vaccineBatches.length > 0 ? (
                                        <table className={styles.batchTable}>
                                            <thead>
                                                <tr>
                                                    <th>Lote</th>
                                                    <th>Validade</th>
                                                    <th>Qtd.</th>
                                                    <th>Custo</th>
                                                    <th>Venda</th>
                                                    <th>Status</th>
                                                    <th>Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {vaccineBatches.map(batch => (
                                                    <tr key={batch.id}>
                                                        <td>{batch.batch_number}</td>
                                                        <td>{new Date(batch.expiration_date).toLocaleDateString('pt-BR')}</td>
                                                        <td>{batch.quantity}</td>
                                                        <td>{formatCurrency(batch.cost_price)}</td>
                                                        <td>{formatCurrency(batch.selling_price)}</td>
                                                        <td>
                                                            <span className={`${styles.statusBadge} ${styles.statusActive}`}>Ativo</span>
                                                        </td>
                                                        <td>
                                                            <button
                                                                className={styles.saleButton}
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    handleOpenSaleModal(batch)
                                                                }}
                                                            >
                                                                $ Vender
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhum lote cadastrado.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Modal Nova Vacina */}
            {isVaccineModalOpen && (
                <div className={styles.modalOverlay} onClick={() => setIsVaccineModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={() => setIsVaccineModalOpen(false)}>×</button>
                        <h2>💉 Nova Vacina</h2>

                        <form onSubmit={handleSaveVaccine}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Nome da Vacina</label>
                                <input
                                    className={styles.input}
                                    placeholder="Ex: V10, Antirrábica..."
                                    required
                                    value={vaccineForm.name}
                                    onChange={(e) => setVaccineForm({ ...vaccineForm, name: e.target.value })}
                                />
                            </div>
                            <div className={styles.row}>
                                <div className={styles.formGroup} style={{ flex: 1 }}>
                                    <label className={styles.label}>Fabricante</label>
                                    <input
                                        className={styles.input}
                                        placeholder="Ex: Zoetis"
                                        required
                                        value={vaccineForm.manufacturer}
                                        onChange={(e) => setVaccineForm({ ...vaccineForm, manufacturer: e.target.value })}
                                    />
                                </div>
                                <div className={styles.formGroup} style={{ flex: 1 }}>
                                    <label className={styles.label}>Espécie Alvo</label>
                                    <select
                                        className={styles.select}
                                        value={vaccineForm.target_animals}
                                        onChange={(e) => setVaccineForm({ ...vaccineForm, target_animals: e.target.value })}
                                    >
                                        <option value="Cão">Cão</option>
                                        <option value="Gato">Gato</option>
                                        <option value="Ambos">Ambos</option>
                                    </select>
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Descrição</label>
                                <textarea
                                    className={styles.textarea}
                                    value={vaccineForm.description}
                                    onChange={(e) => setVaccineForm({ ...vaccineForm, description: e.target.value })}
                                />
                            </div>
                            <button type="submit" className={styles.submitButton}>Salvar Vacina</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Novo Lote */}
            {isBatchModalOpen && selectedVaccineForBatch && (
                <div className={styles.modalOverlay} onClick={() => setIsBatchModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={() => setIsBatchModalOpen(false)}>×</button>
                        <h2>📦 Novo Lote: {selectedVaccineForBatch.name}</h2>

                        <form onSubmit={handleSaveBatch}>
                            <div className={styles.row}>
                                <div className={styles.formGroup} style={{ flex: 1 }}>
                                    <label className={styles.label}>Número do Lote</label>
                                    <input
                                        className={styles.input}
                                        required
                                        value={batchForm.batch_number}
                                        onChange={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })}
                                    />
                                </div>
                                <div className={styles.formGroup} style={{ flex: 1 }}>
                                    <label className={styles.label}>Validade</label>
                                    <input
                                        type="date"
                                        className={styles.input}
                                        required
                                        value={batchForm.expiration_date}
                                        onChange={(e) => setBatchForm({ ...batchForm, expiration_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className={styles.row}>
                                <div className={styles.formGroup} style={{ flex: 1 }}>
                                    <label className={styles.label}>Quantidade (un)</label>
                                    <input
                                        type="number"
                                        className={styles.input}
                                        min="1"
                                        required
                                        value={batchForm.quantity}
                                        onChange={(e) => setBatchForm({ ...batchForm, quantity: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className={styles.row}>
                                <div className={styles.formGroup} style={{ flex: 1 }}>
                                    <label className={styles.label}>Preço de Custo (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className={styles.input}
                                        required
                                        value={batchForm.cost_price}
                                        onChange={(e) => setBatchForm({ ...batchForm, cost_price: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div className={styles.formGroup} style={{ flex: 1 }}>
                                    <label className={styles.label}>Preço de Venda (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className={styles.input}
                                        required
                                        value={batchForm.selling_price}
                                        onChange={(e) => setBatchForm({ ...batchForm, selling_price: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <button type="submit" className={styles.submitButton}>Cadastrar Lote</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Venda */}
            {isSaleModalOpen && selectedBatchToSell && (
                <div className={styles.modalOverlay} onClick={() => setIsSaleModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={() => setIsSaleModalOpen(false)}>×</button>
                        <h2><span className={styles.modalIcon}>$</span> Registrar Venda de Vacina</h2>
                        <p className={styles.subtitle}>Lote: {selectedBatchToSell.batch_number}</p>

                        <form onSubmit={handleConfirmSale} className={styles.saleForm}>
                            <div className={styles.saleInfo}>
                                <div className={styles.infoRow}>
                                    <span>Preço Unitário:</span>
                                    <strong>{formatCurrency(selectedBatchToSell.selling_price)}</strong>
                                </div>
                                <div className={styles.infoRow}>
                                    <span>Em Estoque:</span>
                                    <strong>{selectedBatchToSell.quantity} un</strong>
                                </div>
                            </div>

                            <div className={styles.row}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Quantidade</label>
                                    <input
                                        className={styles.input}
                                        type="number"
                                        min="1"
                                        max={selectedBatchToSell.quantity}
                                        required
                                        value={saleData.quantity}
                                        onChange={e => setSaleData({ ...saleData, quantity: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Desconto (%)</label>
                                    <input
                                        className={styles.input}
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={saleData.tempDiscountPercent}
                                        onChange={e => setSaleData({ ...saleData, tempDiscountPercent: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className={styles.totalSection}>
                                <div className={styles.totalRow}>
                                    <span>Subtotal:</span>
                                    <span>{formatCurrency(selectedBatchToSell.selling_price * saleData.quantity)}</span>
                                </div>
                                <div className={styles.totalRow}>
                                    <span>Desconto:</span>
                                    <span className={styles.discountValue}>
                                        - {formatCurrency((selectedBatchToSell.selling_price * saleData.quantity) * (saleData.tempDiscountPercent / 100))}
                                    </span>
                                </div>
                                <div className={`${styles.totalRow} ${styles.finalTotal}`}>
                                    <span>Total Final:</span>
                                    <span>
                                        {formatCurrency(
                                            (selectedBatchToSell.selling_price * saleData.quantity) -
                                            ((selectedBatchToSell.selling_price * saleData.quantity) * (saleData.tempDiscountPercent / 100))
                                        )}
                                    </span>
                                </div>
                            </div>

                            <button type="submit" className={`${styles.submitButton} ${styles.confirmSaleButton}`}>
                                Confirmar Venda
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
