'use client'

import { useState, useRef, useEffect } from 'react'
import { updatePaymentStatus, applyDiscount } from '@/app/actions/appointment'
import { createPortal } from 'react-dom'

interface PaymentControlsProps {
    appointmentId: string
    calculatedPrice: number | null
    finalPrice: number | null
    discountPercent: number | null
    paymentStatus: string | null
    paymentMethod: string | null
    onUpdate?: () => void
    compact?: boolean
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
    onUpdate,
    compact = false
}: PaymentControlsProps) {
    const [showModal, setShowModal] = useState(false)
    const [discountValue, setDiscountValue] = useState(discountPercent?.toString() || '0')
    const [loading, setLoading] = useState(false)

    const isPaid = paymentStatus === 'paid'
    const displayPrice = finalPrice ?? calculatedPrice ?? 0
    const basePrice = calculatedPrice ?? 0

    // Reset local state when props change
    useEffect(() => {
        setDiscountValue(discountPercent?.toString() || '0')
    }, [discountPercent])

    const handlePayment = async (method: string) => {
        setLoading(true)
        try {
            await updatePaymentStatus(appointmentId, 'paid', method)
            onUpdate?.()
            setShowModal(false)
        } finally {
            setLoading(false)
        }
    }

    const handleUnpay = async () => {
        setLoading(true)
        try {
            await updatePaymentStatus(appointmentId, 'pending')
            onUpdate?.()
            // Keep modal open to show change
        } finally {
            setLoading(false)
        }
    }

    const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')

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
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>💰 Detalhes do Pagamento</h3>
                    <button
                        onClick={() => setShowModal(false)}
                        style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                        &times;
                    </button>
                </div>

                {/* Price Summary */}
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.85rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        <span>Valor Base:</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>R$ {basePrice.toFixed(2)}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Tipo de Desconto:</span>
                            <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                                <button
                                    onClick={() => setDiscountType('percent')}
                                    disabled={isPaid}
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
                                    disabled={isPaid}
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
                                        max={discountType === 'percent' ? 100 : basePrice}
                                        disabled={isPaid}
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
                                {!isPaid && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDiscount()
                                        }}
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
                                )}
                            </div>
                        </div>
                    </div>

                    {discountPercent && discountPercent > 0 ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--status-canceled)' }}>
                            <span>Desconto aplicado:</span>
                            <span>- R$ {(basePrice - displayPrice).toFixed(2)}</span>
                        </div>
                    ) : null}

                    <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        <span>Total Final:</span>
                        <span>R$ {parseFloat(displayPrice.toFixed(2)).toFixed(2)}</span>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                                ✅ Pago via {paymentMethodLabels[paymentMethod || ''] || paymentMethod}
                            </div>
                            <button
                                onClick={handleUnpay}
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
                                        onClick={() => handlePayment(key)}
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
                                        onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                                        onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )


    // Main Card Display (Compact Badge)
    return (
        <>
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

            {showModal && typeof document !== 'undefined' && createPortal(paymentModalJSX, document.body)}
        </>
    )
}
