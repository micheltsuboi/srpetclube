'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateAppointment, deleteAppointment } from '@/app/actions/appointment'
import { createPetshopSale } from '@/app/actions/petshop'

interface Service {
    id: string
    name: string
    duration_minutes?: number
    base_price: number
    service_categories?: {
        name: string
    }
}

interface Product {
    id: string
    name: string
    price: number
    stock_quantity: number
}

interface EditAppointmentModalProps {
    appointment: {
        id: string
        pet_id: string
        service_id: string
        scheduled_at: string
        notes: string | null
        check_in_date?: string | null
        check_out_date?: string | null
        has_taxi?: boolean
        taxi_fee?: number
        has_extras?: boolean
        extras_fee?: number | null
        extras?: any
        pets: { name: string }
        services?: { name: string, service_categories?: { name: string } }
    }
    onClose: () => void
    onSave: () => void
}

export default function EditAppointmentModal({ appointment, onClose, onSave }: EditAppointmentModalProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [services, setServices] = useState<Service[]>([])
    const [products, setProducts] = useState<Product[]>([])

    // Product Sales States
    const [selectedProductId, setSelectedProductId] = useState('')
    const [productQuantity, setProductQuantity] = useState(1)
    const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending')
    const [paymentMethod, setPaymentMethod] = useState('cash')
    const [productSales, setProductSales] = useState<Array<{ product_id: string, product_name: string, quantity: number, unit_price: number, total_price: number, payment_status: 'pending' | 'paid', payment_method: string }>>([])

    // Form State
    const [serviceId, setServiceId] = useState(appointment.service_id)
    const [date, setDate] = useState(new Date(appointment.scheduled_at).toISOString().split('T')[0])
    const [time, setTime] = useState(new Date(appointment.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).slice(0, 5))
    const [notes, setNotes] = useState(appointment.notes || '')
    const [checkInDate, setCheckInDate] = useState(appointment.check_in_date || appointment.scheduled_at.split('T')[0])
    const [checkOutDate, setCheckOutDate] = useState(appointment.check_out_date || '')
    const [hasTaxi, setHasTaxi] = useState(appointment.has_taxi || false)
    const [taxiFee, setTaxiFee] = useState(appointment.taxi_fee?.toString() || '0')

    // Extras States
    const [extrasList, setExtrasList] = useState<Array<{ name: string, price: number }>>(() => {
        if (Array.isArray(appointment.extras)) return appointment.extras
        try {
            return typeof appointment.extras === 'string' ? JSON.parse(appointment.extras) : []
        } catch {
            return []
        }
    })
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
            setExtraPrice(svc.base_price.toString())
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
        const newExtras = [...extrasList]
        newExtras.splice(index, 1)
        setExtrasList(newExtras)
    }

    const handleAddProduct = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!selectedProductId || productQuantity <= 0) return
        
        const product = products.find(p => p.id === selectedProductId)
        if (!product) return

        setProductSales([...productSales, {
            product_id: product.id,
            product_name: product.name,
            quantity: productQuantity,
            unit_price: product.price,
            total_price: product.price * productQuantity,
            payment_status: paymentStatus,
            payment_method: paymentMethod
        }])
        
        setSelectedProductId('')
        setProductQuantity(1)
        setPaymentStatus('pending')
    }

    const handleRemoveProduct = (e: React.MouseEvent, index: number) => {
        e.preventDefault()
        e.stopPropagation()
        const newSales = [...productSales]
        newSales.splice(index, 1)
        setProductSales(newSales)
    }

    const selectedService = services.find(s => s.id === serviceId)
    const isHospedagem = selectedService?.name === 'Hospedagem' || (appointment.services as any)?.service_categories?.name === 'Hospedagem'

    useEffect(() => {
        const fetchServices = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile) return

            const { data } = await supabase
                .from('services')
                .select('id, name, base_price, duration_minutes, is_active, service_categories(name)')
                .eq('org_id', profile.org_id)
                .order('name')

            if (data) setServices(data as any)

            const { data: prodData } = await supabase
                .from('products')
                .select('id, name, price, stock_quantity')
                .eq('org_id', profile.org_id)
                .order('name')
            
            if (prodData) setProducts(prodData)
        }
        fetchServices()
    }, [supabase])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const formData = new FormData()
        formData.append('id', appointment.id)
        formData.append('serviceId', serviceId)
        formData.append('date', date)
        formData.append('time', isHospedagem ? '17:00' : time)
        formData.append('notes', notes)
        if (checkInDate) formData.append('checkInDate', checkInDate)
        if (checkOutDate) formData.append('checkOutDate', checkOutDate)
        formData.append('hasTaxi', String(hasTaxi))
        formData.append('taxiFee', taxiFee)
        formData.append('extras', JSON.stringify(extrasList))

        const result = await updateAppointment({ message: '', success: false }, formData)

        if (result.success) {
            for (const sale of productSales) {
                await createPetshopSale({
                    pet_id: appointment.pet_id,
                    product_id: sale.product_id,
                    product_name: sale.product_name,
                    quantity: sale.quantity,
                    unit_price: sale.unit_price,
                    total_price: sale.total_price,
                    payment_status: sale.payment_status,
                    payment_method: sale.payment_method
                })
            }
        }

        setLoading(false)
        if (result.success) {
            alert(result.message)
            onSave()
            onClose()
        } else {
            alert(result.message)
        }
    }

    const handleDelete = async () => {
        if (!confirm('Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.')) return

        setLoading(true)
        const result = await deleteAppointment(appointment.id)
        setLoading(false)

        if (result.success) {
            alert(result.message)
            onSave()
            onClose()
        } else {
            alert(result.message)
        }
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            zIndex: 1100,
            backdropFilter: 'blur(4px)',
            overflowY: 'auto',
            padding: '2rem 1rem'
        }} onClick={onClose}>
            <div style={{
                background: '#1e293b',
                padding: '2rem',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '500px',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                margin: 'auto'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white', margin: 0 }}>
                        Editar Agendamento
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </div>

                <div style={{ marginBottom: '1rem', color: '#cbd5e1', fontSize: '0.9rem' }}>
                    Pet: <strong style={{ color: 'white' }}>{appointment.pets?.name || 'Pet Desconhecido'}</strong>
                </div>

                <form onSubmit={handleSave}>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Serviço</label>
                            <select
                                value={serviceId}
                                onChange={e => setServiceId(e.target.value)}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                            >
                                {(() => {
                                    const categoryOrder = ['Banho e Tosa', 'Creche', 'Hospedagem', 'Outros']
                                    const grouped = services.reduce((acc, s) => {
                                        const cat = s.service_categories?.name || 'Outros'
                                        if (!acc[cat]) acc[cat] = []
                                        acc[cat].push(s)
                                        return acc
                                    }, {} as Record<string, Service[]>)

                                    const sortedCats = Object.keys(grouped).sort((a, b) => {
                                        const idxA = categoryOrder.indexOf(a)
                                        const idxB = categoryOrder.indexOf(b)
                                        if (idxA !== -1 && idxB !== -1) return idxA - idxB
                                        if (idxA !== -1) return -1
                                        if (idxB !== -1) return 1
                                        return a.localeCompare(b)
                                    })

                                    return sortedCats.map(category => (
                                        <optgroup key={category} label={`📁 ${category}`}>
                                            {grouped[category].map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </optgroup>
                                    ))
                                })()}
                            </select>
                        </div>

                        {isHospedagem ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Check-in</label>
                                    <input
                                        type="date"
                                        value={checkInDate}
                                        onChange={e => {
                                            setCheckInDate(e.target.value)
                                            setDate(e.target.value) // Keep scheduled_at in sync
                                        }}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Check-out</label>
                                    <input
                                        type="date"
                                        value={checkOutDate}
                                        onChange={e => setCheckOutDate(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Data</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Hora</label>
                                    <input
                                        type="time"
                                        value={time}
                                        onChange={e => setTime(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                    />
                                </div>
                            </div>
                        )}

                        <div style={{ 
                            background: 'rgba(232, 130, 106, 0.05)', 
                            padding: '1rem', 
                            borderRadius: '12px', 
                            border: '1px solid rgba(232, 130, 106, 0.1)',
                            marginBottom: '0.5rem'
                        }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', color: 'white', fontWeight: 600 }}>
                                <input 
                                    type="checkbox" 
                                    checked={hasTaxi} 
                                    onChange={e => setHasTaxi(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: '#E8826A' }}
                                />
                                🚗 Taxi Dog?
                            </label>

                            {hasTaxi && (
                                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed rgba(232, 130, 106, 0.2)' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600 }}>VALOR DO TRANSPORTE (R$)</label>
                                    <input 
                                        type="number"
                                        step="0.01"
                                        value={taxiFee}
                                        onChange={e => setTaxiFee(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                        placeholder="0.00"
                                    />
                                </div>
                            )}
                        </div>

                        <div style={{ 
                            background: 'rgba(232, 130, 106, 0.05)', 
                            padding: '1rem', 
                            borderRadius: '12px', 
                            border: '1px solid rgba(232, 130, 106, 0.1)',
                            marginBottom: '0.5rem'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>➕ Adicionar Serviços Extras?</span>
                                <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Inclua serviços adicionais que serão cobrados à parte deste agendamento.</span>
                            </div>
                            
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>SELECIONAR SERVIÇO CADASTRADO (OPCIONAL)</label>
                                    <select
                                        value={selectedExtraServiceId}
                                        onChange={(e) => handleSelectExtraService(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                    >
                                        <option value="">Selecione para autocompletar...</option>
                                        {services.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} - R$ {(s.base_price ?? 0).toFixed(2)}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>NOME DO EXTRA</label>
                                        <input
                                            type="text"
                                            value={extraName}
                                            onChange={(e) => setExtraName(e.target.value)}
                                            placeholder="Ex: Corte de Unha"
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>VALOR (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={extraPrice}
                                            onChange={(e) => setExtraPrice(e.target.value)}
                                            placeholder="0.00"
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    <button
                                        onClick={handleAddExtra}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            fontSize: '0.85rem',
                                            height: '34px',
                                            borderColor: '#E8826A',
                                            color: 'white',
                                            background: '#E8826A',
                                            borderRadius: '8px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            border: 'none'
                                        }}
                                    >
                                        + Add
                                    </button>
                                </div>
                            </div>

                            {extrasList.length > 0 && (
                                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid #334155' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>EXTRAS ADICIONADOS:</span>
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #334155', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                        <span style={{ color: '#cbd5e1' }}>Total Extras:</span>
                                        <span style={{ color: '#E8826A' }}>R$ {extrasList.reduce((sum, item) => sum + item.price, 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Produtos do Pet */}
                        <div style={{ 
                            background: 'rgba(59, 130, 246, 0.05)', 
                            padding: '1rem', 
                            borderRadius: '12px', 
                            border: '1px solid rgba(59, 130, 246, 0.1)',
                            marginBottom: '0.5rem'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>🛒 Adicionar Produtos?</span>
                                <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Venda de produtos de petshop associados a este agendamento.</span>
                            </div>
                            
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>PRODUTO</label>
                                    <select
                                        value={selectedProductId}
                                        onChange={(e) => setSelectedProductId(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                    >
                                        <option value="">Selecione um produto...</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} - R$ {p.price.toFixed(2)} ({p.stock_quantity} em estoque)</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>QUANTIDADE</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={productQuantity}
                                            onChange={(e) => setProductQuantity(parseInt(e.target.value) || 1)}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>PAGAMENTO</label>
                                        <select
                                            value={paymentStatus}
                                            onChange={(e) => setPaymentStatus(e.target.value as 'paid' | 'pending')}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                        >
                                            <option value="pending">Pendente (Cobrar Depois)</option>
                                            <option value="paid">Pago</option>
                                        </select>
                                    </div>
                                </div>
                                {paymentStatus === 'paid' && (
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>MÉTODO DE PAGAMENTO</label>
                                        <select
                                            value={paymentMethod}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                        >
                                            <option value="pix">PIX</option>
                                            <option value="cash">Dinheiro</option>
                                            <option value="credit">Cartão de Crédito</option>
                                            <option value="debit">Cartão de Débito</option>
                                        </select>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                                    <button
                                        onClick={handleAddProduct}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            fontSize: '0.85rem',
                                            height: '34px',
                                            borderColor: '#3b82f6',
                                            color: 'white',
                                            background: '#3b82f6',
                                            borderRadius: '8px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            border: 'none'
                                        }}
                                    >
                                        + Add Produto
                                    </button>
                                </div>
                            </div>

                            {productSales.length > 0 && (
                                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid #334155' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>PRODUTOS ADICIONADOS:</span>
                                    {productSales.map((item, index) => (
                                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>{item.quantity}x {item.product_name}</span>
                                                <span style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 700 }}>R$ {item.total_price.toFixed(2)} - {item.payment_status === 'paid' ? 'Pago' : 'Pendente'}</span>
                                            </div>
                                            <button
                                                onClick={(e) => handleRemoveProduct(e, index)}
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #334155', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                        <span style={{ color: '#cbd5e1' }}>Total Produtos:</span>
                                        <span style={{ color: '#3b82f6' }}>R$ {productSales.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Observações</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={3}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={loading}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    marginRight: 'auto'
                                }}
                            >
                                Excluir
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #334155',
                                    background: 'transparent',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#3b82f6',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    opacity: loading ? 0.7 : 1
                                }}
                            >
                                {loading ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
