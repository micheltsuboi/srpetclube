'use client'

import { useState, useEffect } from 'react'
import { updatePaymentStatus, applyDiscount } from '@/app/actions/appointment'
import { updatePackagePaymentStatus } from '@/app/actions/package'
import { createPortal } from 'react-dom'

interface PaymentControlsProps {
    appointmentId: string
    calculatedPrice: number | null
    finalPrice: number | null
    discountPercent: number | null
    paymentStatus: string | null
    paymentMethod: string | null
    packageTotal?: number | null
    packageMethod?: string | null
    packageDate?: string | null
    packageHasTaxi?: boolean
    packageTaxiFee?: number
    customerPackageId?: string | null
    onUpdate?: () => void
    compact?: boolean
    isPackage?: boolean
    taxiFee?: number | null
    hasExtras?: boolean
    extrasFee?: number | null
    extras?: any
    apptPaymentStatus?: string | null
    apptPaymentMethod?: string | null
    packagePaymentStatus?: string | null
}

const paymentMethodLabels: Record<string, string> = {
    pix: '💠 PIX',
    credit: '💳 Crédito',
    debit: '💳 Débito',
    cash: '💵 Dinheiro',
    credit_package: '📦 Pacote'
}

export default function PaymentControls({
    appointmentId,
    calculatedPrice,
    finalPrice,
    discountPercent,
    paymentStatus,
    paymentMethod,
    packageTotal,
    packageMethod,
    packageDate,
    packageHasTaxi = false,
    packageTaxiFee = 0,
    customerPackageId,
    onUpdate,
    compact = false,
    isPackage = false,
    taxiFee = 0,
    hasExtras = false,
    extrasFee = 0,
    extras = [],
    apptPaymentStatus = 'pending',
    apptPaymentMethod = null,
    packagePaymentStatus = null
}: PaymentControlsProps) {
    const [showModal, setShowModal] = useState(false)
    const [discountValue, setDiscountValue] = useState(discountPercent?.toString() || '0')
    const [loading, setLoading] = useState(false)
    const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')

    // Determine if the main package or appointment is paid
    const isPaid = isPackage ? (packagePaymentStatus === 'paid') : (paymentStatus === 'paid')

    // Calculations for addons and extras
    const effectiveExtrasFee = Number(extrasFee || 0)
    const effectiveTaxiFee = Number(taxiFee || 0)
    const taxiIsAddon = isPackage && !packageHasTaxi && effectiveTaxiFee > 0
    const hasAddons = effectiveExtrasFee > 0 || taxiIsAddon
    const addonsTotal = effectiveExtrasFee + (taxiIsAddon ? effectiveTaxiFee : 0)
    const isAddonsPaid = apptPaymentStatus === 'paid'

    // Format extras array
    const parsedExtras = Array.isArray(extras) 
        ? extras 
        : (typeof extras === 'string' ? JSON.parse(extras || '[]') : [])

    // For packages, use packageTotal if available, else fallback. For regular appointments, sum service + taxi + extras
    const displayPrice = isPackage && packageTotal !== undefined 
        ? (packageTotal || 0) 
        : (finalPrice ?? ((calculatedPrice || 0) + effectiveTaxiFee + effectiveExtrasFee))
    
    // Se for pacote, o basePrice real do pacote é o total dele menos o taxi de pacote (se houver)
    const effectivePackageBase = isPackage && packageTotal !== undefined 
        ? ((packageTotal || 0) - (packageHasTaxi ? packageTaxiFee : 0)) 
        : (calculatedPrice || 0)
    const basePrice = isPackage ? effectivePackageBase : (calculatedPrice ?? 0)

    // Reset local state when props change
    useEffect(() => {
        setDiscountValue(discountPercent?.toString() || '0')
    }, [discountPercent])

    const handlePackagePayment = async (method: string) => {
        setLoading(true)
        try {
            if (customerPackageId) {
                await updatePackagePaymentStatus(customerPackageId, 'paid', method)
            }
            onUpdate?.()
            setShowModal(false)
        } finally {
            setLoading(false)
        }
    }

    const handlePackageUnpay = async () => {
        setLoading(true)
        try {
            if (customerPackageId) {
                await updatePackagePaymentStatus(customerPackageId, 'pending')
            }
            onUpdate?.()
        } finally {
            setLoading(false)
        }
    }

    const handleApptPayment = async (method: string) => {
        setLoading(true)
        try {
            await updatePaymentStatus(appointmentId, 'paid', method)
            onUpdate?.()
            setShowModal(false)
        } finally {
            setLoading(false)
        }
    }

    const handleApptUnpay = async () => {
        setLoading(true)
        try {
            await updatePaymentStatus(appointmentId, 'pending')
            onUpdate?.()
        } finally {
            setLoading(false)
        }
    }

    const handleDiscount = async () => {
        const val = parseFloat(discountValue)
        if (isNaN(val) || val < 0) return
        setLoading(true)
        try {
            await applyDiscount(appointmentId, val, discountType, basePrice)
            onUpdate?.()
        } finally {
            setLoading(false)
        }
    }

    // Modal Content
    const paymentModalJSX = (
        <div
            onClick={(e) => {
                e.stopPropagation()
                setShowModal(false)
            }}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100vh',
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 9999,
                padding: '1rem',
                backdropFilter: 'blur(8px)'
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--bg-tertiary)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    width: '100%',
                    maxWidth: '400px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    position: 'relative',
                    border: '1px solid var(--border)'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>💰 Detalhes do Pagamento {isPackage ? '(Pacote)' : ''}</h3>
                    <button
                        onClick={() => setShowModal(false)}
                        style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                        &times;
                    </button>
                </div>
                {/* Price Summary */}
                <div style={{ background: 'rgba(232, 130, 106, 0.05)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px dashed rgba(232, 130, 106, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        <span>{isPackage ? 'Valor do Pacote:' : 'Serviço Principal:'}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>R$ {(basePrice || 0).toFixed(2)}</span>
                    </div>
                    
                    {/* Exibir Taxi Dog */}
                    {(isPackage ? (packageHasTaxi || effectiveTaxiFee > 0) : !!effectiveTaxiFee) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: (isPackage && packageHasTaxi) ? 'var(--status-done)' : 'var(--text-secondary)' }}>
                            <span>🚗 {isPackage ? (packageHasTaxi ? 'Taxi Dog (Incluso no Pacote):' : 'Taxi Dog Avulso:') : 'Taxi Dog:'}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>R$ {(isPackage && packageHasTaxi ? packageTaxiFee : effectiveTaxiFee).toFixed(2)}</span>
                        </div>
                    )}

                    {/* Exibir Serviços Extras detalhados */}
                    {parsedExtras.length > 0 && (
                        <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.1)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>Serviços Extras:</span>
                            {parsedExtras.map((e: any, i: number) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                    <span style={{ color: '#94a3b8' }}>➕ {e.name}</span>
                                    <span>R$ {Number(e.price || 0).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {!isPackage && discountPercent && discountPercent > 0 ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--status-canceled)' }}>
                            <span>Desconto aplicado:</span>
                            <span>- R$ {((basePrice + effectiveTaxiFee + effectiveExtrasFee) - displayPrice).toFixed(2)}</span>
                        </div>
                    ) : null}

                    {isPackage ? (
                        <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                <span>Mensalidade Pacote:</span>
                                <span>R$ {(packageTotal || 0).toFixed(2)}</span>
                            </div>
                            {hasAddons && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, color: '#E8826A', marginTop: '0.25rem' }}>
                                    <span>Adicionais Sessão (A pagar):</span>
                                    <span>R$ {addonsTotal.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-primary)' }}>
                            <span>Total Geral:</span>
                            <span style={{ fontSize: '1.1rem', color: 'var(--color-coral)' }}>R$ {(displayPrice || 0).toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* Discount Section */}
                {isPackage && !isPaid && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid rgba(122, 201, 160, 0.2)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        ℹ️ Você está pagando a <strong>mensalidade de um pacote</strong>. Descontos não estão disponíveis por aqui. Eles devem ser aplicados na Gestão de Pets ou no momento da venda.
                    </div>
                )}
                {!isPackage && !isPaid && (
                   <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Tipo de Desconto:</span>
                                <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                                    <button
                                        onClick={() => setDiscountType('percent')}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '0.75rem',
                                            borderRadius: '4px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            background: discountType === 'percent' ? 'var(--primary)' : 'transparent',
                                            color: 'white',
                                            fontWeight: discountType === 'percent' ? 600 : 400
                                        }}
                                    >
                                        %
                                    </button>
                                    <button
                                        onClick={() => setDiscountType('fixed')}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '0.75rem',
                                            borderRadius: '4px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            background: discountType === 'fixed' ? 'var(--primary)' : 'transparent',
                                            color: 'white',
                                            fontWeight: discountType === 'fixed' ? 600 : 400
                                        }}
                                    >
                                        R$
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Valor:</span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                        {discountType === 'fixed' && <span style={{ position: 'absolute', left: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>R$</span>}
                                        <input
                                            type="number"
                                            value={discountValue}
                                            onChange={(e) => setDiscountValue(e.target.value)}
                                            min="0"
                                            style={{
                                                width: '80px',
                                                padding: `6px 8px 6px ${discountType === 'fixed' ? '24px' : '8px'}`,
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--bg-primary)',
                                                color: 'var(--text-primary)',
                                                textAlign: 'right',
                                                fontSize: '0.85rem'
                                            }}
                                        />
                                        {discountType === 'percent' && <span style={{ marginLeft: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>%</span>}
                                    </div>
                                    <button
                                        onClick={handleDiscount}
                                        disabled={loading}
                                        style={{
                                            fontSize: '0.75rem',
                                            padding: '4px 12px',
                                            background: 'var(--primary)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontWeight: 600
                                        }}
                                    >
                                        Aplicar
                                    </button>
                                </div>
                            </div>
                        </div>
                   </div>
                )}

                {isPackage && packageDate && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', padding: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        <span>Data do Pagamento:</span>
                        <span style={{ color: 'var(--text-primary)' }}>{new Date(packageDate).toLocaleDateString('pt-BR')}</span>
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {isPackage ? (
                        <>
                            {/* Bloco de Mensalidade do Pacote */}
                            <div style={{ borderBottom: hasAddons ? '1px dashed var(--border)' : 'none', paddingBottom: hasAddons ? '1rem' : '0' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', color: '#94a3b8' }}>1. PAGAMENTO DA MENSALIDADE DO PACOTE</div>
                                {isPaid ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{
                                            background: 'rgba(122, 201, 160, 0.1)',
                                            color: 'var(--status-done)',
                                            padding: '0.5rem',
                                            borderRadius: '8px',
                                            marginBottom: '0.5rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.5rem',
                                            fontWeight: 600,
                                            fontSize: '0.85rem',
                                            border: '1px solid rgba(122, 201, 160, 0.2)'
                                        }}>
                                            ✅ Mensalidade Paga via {paymentMethodLabels[packageMethod || ''] || packageMethod || 'N/A'}
                                        </div>
                                        <button
                                            onClick={handlePackageUnpay}
                                            disabled={loading}
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border)',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                fontSize: '0.8rem',
                                                width: '100%'
                                            }}
                                        >
                                            ↺ Desfazer Pagamento da Mensalidade
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            {Object.entries(paymentMethodLabels).filter(([k]) => k !== 'credit_package').map(([key, label]) => (
                                                <button
                                                    key={key}
                                                    onClick={() => handlePackagePayment(key)}
                                                    disabled={loading}
                                                    style={{
                                                        padding: '0.5rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--bg-secondary)',
                                                        color: 'var(--text-primary)',
                                                        cursor: loading ? 'wait' : 'pointer',
                                                        fontSize: '0.85rem',
                                                        textAlign: 'left',
                                                    }}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Bloco de Adicionais Avulsos do Agendamento */}
                            {hasAddons && (
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', color: '#E8826A' }}>2. PAGAMENTO DOS EXTRAS DA SESSÃO (R$ {addonsTotal.toFixed(2)})</div>
                                    {isAddonsPaid ? (
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{
                                                background: 'rgba(122, 201, 160, 0.1)',
                                                color: 'var(--status-done)',
                                                padding: '0.5rem',
                                                borderRadius: '8px',
                                                marginBottom: '0.5rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.5rem',
                                                fontWeight: 600,
                                                fontSize: '0.85rem',
                                                border: '1px solid rgba(122, 201, 160, 0.2)'
                                            }}>
                                                ✅ Extras Pagos via {paymentMethodLabels[apptPaymentMethod || ''] || apptPaymentMethod || 'N/A'}
                                            </div>
                                            <button
                                                onClick={handleApptUnpay}
                                                disabled={loading}
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                    border: '1px solid var(--border)',
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    color: 'var(--text-secondary)',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                    width: '100%'
                                                }}
                                            >
                                                ↺ Desfazer Pagamento dos Extras
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                {Object.entries(paymentMethodLabels).filter(([k]) => k !== 'credit_package').map(([key, label]) => (
                                                    <button
                                                        key={key}
                                                        onClick={() => handleApptPayment(key)}
                                                        disabled={loading}
                                                        style={{
                                                            padding: '0.5rem',
                                                            borderRadius: '6px',
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--bg-secondary)',
                                                            color: 'var(--text-primary)',
                                                            cursor: loading ? 'wait' : 'pointer',
                                                            fontSize: '0.85rem',
                                                            textAlign: 'left',
                                                        }}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        /* Agendamento comum (não pacote) */
                        <div>
                            {isPaid ? (
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{
                                        background: 'rgba(122, 201, 160, 0.1)',
                                        color: 'var(--status-done)',
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        fontWeight: 600,
                                        border: '1px solid rgba(122, 201, 160, 0.2)'
                                    }}>
                                        ✅ Pago via {paymentMethodLabels[paymentMethod || ''] || paymentMethod || 'N/A'}
                                    </div>
                                    <button
                                        onClick={handleApptUnpay}
                                        disabled={loading}
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid var(--border)',
                                            padding: '0.5rem 1rem',
                                            borderRadius: '6px',
                                            color: 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem',
                                            width: '100%'
                                        }}
                                    >
                                        ↺ Desfazer Pagamento
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Confirmar Pagamento:
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        {Object.entries(paymentMethodLabels).map(([key, label]) => (
                                            <button
                                                key={key}
                                                onClick={() => handleApptPayment(key)}
                                                disabled={loading}
                                                style={{
                                                    padding: '0.75rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--bg-secondary)',
                                                    color: 'var(--text-primary)',
                                                    cursor: loading ? 'wait' : 'pointer',
                                                    fontSize: '0.9rem',
                                                    textAlign: 'left',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )

    // Main Card Display (Compact Badge)
    const renderBadge = () => {
        if (isPackage) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: compact ? '0.25rem' : '0.5rem' }}>
                    {/* Badge do Pacote */}
                    <div
                        onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
                        style={{
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: isPaid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: `1px solid ${isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                            transition: 'opacity 0.2s',
                            width: 'fit-content'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
                        onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                    >
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isPaid ? '#10b981' : '#f59e0b' }}>PACOTE</span>
                        <span style={{ width: '1px', height: '12px', background: isPaid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)' }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isPaid ? '#10b981' : '#f59e0b' }}>{isPaid ? 'Pago' : 'Pendente'}</span>
                    </div>
                    
                    {/* Badge de Adicionais/Extras */}
                    {hasAddons && (
                        <div
                            onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
                            style={{
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                background: isAddonsPaid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: `1px solid ${isAddonsPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                transition: 'opacity 0.2s',
                                width: 'fit-content'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
                            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                        >
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isAddonsPaid ? '#10b981' : '#ef4444' }}>EXTRAS: R$ {addonsTotal.toFixed(2)}</span>
                            <span style={{ width: '1px', height: '12px', background: isAddonsPaid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)' }} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isAddonsPaid ? '#10b981' : '#ef4444' }}>{isAddonsPaid ? 'Pago' : 'Pendente'}</span>
                        </div>
                    )}
                </div>
            )
        }

        // Agendamento comum
        return (
            <div
                onClick={(e) => {
                    e.stopPropagation()
                    setShowModal(true)
                }}
                style={{
                    marginTop: compact ? '0.25rem' : '0.5rem',
                    cursor: 'pointer',
                    display: 'inline-block',
                    transition: 'opacity 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: isPaid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: `1px solid ${isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`
                }}>
                    <span style={{
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: isPaid ? '#10b981' : '#f59e0b'
                    }}>
                        R$ {displayPrice.toFixed(2)}
                    </span>
                    <span style={{
                        width: '1px',
                        height: '12px',
                        background: isPaid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'
                    }} />
                    <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: isPaid ? '#10b981' : '#f59e0b'
                    }}>
                        {isPaid ? 'Pago' : 'Pendente'}
                    </span>
                </div>
            </div>
        )
    }

    return (
        <>
            {renderBadge()}
            {showModal && typeof document !== 'undefined' && createPortal(paymentModalJSX, document.body)}
        </>
    )
}
