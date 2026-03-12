'use client'

import { useState, useEffect } from 'react'
import { updatePackagePaymentStatus, applyPackageDiscount } from '@/app/actions/package'
import { createPortal } from 'react-dom'

interface PackagePaymentControlsProps {
    customerPackageId: string
    calculatedPrice: number | null
    totalPaid: number | null
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
    cash: '💵 Dinheiro'
}

export default function PackagePaymentControls({
    customerPackageId,
    calculatedPrice,
    totalPaid,
    discountPercent,
    paymentStatus,
    paymentMethod,
    onUpdate,
    compact = false
}: PackagePaymentControlsProps) {
    const [showModal, setShowModal] = useState(false)
    const [discountValue, setDiscountValue] = useState(discountPercent?.toString() || '0')
    const [loading, setLoading] = useState(false)

    const isPaid = paymentStatus === 'paid'
    const displayPrice = totalPaid ?? calculatedPrice ?? 0
    const basePrice = calculatedPrice ?? 0

    useEffect(() => {
        setDiscountValue(discountPercent?.toString() || '0')
    }, [discountPercent])

    const handlePayment = async (method: string) => {
        setLoading(true)
        try {
            await updatePackagePaymentStatus(customerPackageId, 'paid', method)
            onUpdate?.()
            setShowModal(false)
        } finally {
            setLoading(false)
        }
    }

    const handleUnpay = async () => {
        setLoading(true)
        try {
            await updatePackagePaymentStatus(customerPackageId, 'pending')
            onUpdate?.()
        } finally {
            setLoading(false)
        }
    }

    const handleDiscount = async () => {
        const percent = parseFloat(discountValue)
        if (isNaN(percent) || percent < 0 || percent > 100) return
        setLoading(true)
        try {
            await applyPackageDiscount(customerPackageId, percent, basePrice)
            onUpdate?.()
        } finally {
            setLoading(false)
        }
    }

    const paymentModalJSX = (
        <div
            onClick={(e) => { e.stopPropagation(); setShowModal(false) }}
            style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh',
                background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '1rem'
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'white', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '400px',
                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', position: 'relative'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>💰 Pagamento do Pacote</h3>
                    <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
                </div>

                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#64748b' }}>
                        <span>Valor Base:</span>
                        <span>R$ {basePrice.toFixed(2)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Desconto (%):</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="number" value={discountValue} min="0" max="100" disabled={isPaid}
                                onChange={(e) => setDiscountValue(e.target.value)}
                                style={{ width: '60px', padding: '4px', borderRadius: '4px', border: '1px solid #e2e8f0', textAlign: 'center' }}
                            />
                            {!isPaid && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDiscount(); }}
                                    disabled={loading || discountValue === discountPercent?.toString()}
                                    style={{
                                        fontSize: '0.75rem', padding: '4px 8px', background: '#3b82f6', color: 'white', border: 'none',
                                        borderRadius: '4px', cursor: 'pointer', opacity: discountValue === discountPercent?.toString() ? 0.5 : 1
                                    }}
                                >Aplicar</button>
                            )}
                        </div>
                    </div>

                    {discountPercent && discountPercent > 0 ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#ef4444' }}>
                            <span>Desconto aplicado:</span>
                            <span>- R$ {((basePrice * discountPercent) / 100).toFixed(2)}</span>
                        </div>
                    ) : null}

                    <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', color: '#1e293b' }}>
                        <span>Total Final:</span>
                        <span>R$ {displayPrice.toFixed(2)}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {isPaid ? (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600 }}>
                                ✅ Pago via {paymentMethodLabels[paymentMethod || ''] || paymentMethod}
                            </div>
                            <button
                                onClick={handleUnpay} disabled={loading}
                                style={{ background: 'none', border: '1px solid #e2e8f0', padding: '0.5rem 1rem', borderRadius: '6px', color: '#64748b', cursor: 'pointer', fontSize: '0.9rem', width: '100%' }}
                            >↺ Desfazer Pagamento</button>
                        </div>
                    ) : (
                        <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#1e293b' }}>Confirmar Pagamento:</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                {Object.entries(paymentMethodLabels).map(([key, label]) => (
                                    <button
                                        key={key} onClick={() => handlePayment(key)} disabled={loading}
                                        style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#1e293b', cursor: loading ? 'wait' : 'pointer', fontSize: '0.9rem', textAlign: 'left' }}
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

    return (
        <>
            <div
                onClick={(e) => { e.stopPropagation(); setShowModal(true) }}
                style={{
                    marginTop: compact ? '0' : '0.5rem', cursor: 'pointer', display: 'inline-block', transition: 'opacity 0.2s', alignSelf: 'flex-start'
                }}
            >
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    background: isPaid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    padding: compact ? '2px 5px' : '4px 8px', borderRadius: '6px',
                    border: `1px solid ${isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`
                }}>
                    <span style={{ fontSize: compact ? '0.75rem' : '0.85rem', fontWeight: 700, color: isPaid ? '#10b981' : '#f59e0b' }}>
                        R$ {displayPrice.toFixed(2)}
                    </span>
                    <span style={{ width: '1px', height: '12px', background: isPaid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)' }} />
                    <span style={{ fontSize: compact ? '0.65rem' : '0.75rem', fontWeight: 600, color: isPaid ? '#10b981' : '#f59e0b' }}>
                        {isPaid ? 'Pago' : 'Pendente'}
                    </span>
                </div>
            </div>

            {showModal && typeof document !== 'undefined' && createPortal(paymentModalJSX, document.body)}
        </>
    )
}
