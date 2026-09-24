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
    hasTaxi?: boolean
    taxiFee?: number
    onUpdate?: () => void
    compact?: boolean
    paidAt?: string | null
    purchasedAt?: string | null
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
    hasTaxi = false,
    taxiFee = 0,
    onUpdate,
    compact = false,
    paidAt,
    purchasedAt
}: PackagePaymentControlsProps) {
    const [showModal, setShowModal] = useState(false)
    const [discountValue, setDiscountValue] = useState(discountPercent?.toString() || '0')
    const [paymentDate, setPaymentDate] = useState(() => {
        if (paidAt) return paidAt.split('T')[0]
        return new Date().toISOString().split('T')[0]
    })
    const [loading, setLoading] = useState(false)

    const isPaid = paymentStatus === 'paid'
    const basePrice = (calculatedPrice ?? 0) - (hasTaxi ? taxiFee : 0) // Preço do pacote sem o taxi
    let displayPrice = totalPaid ?? calculatedPrice ?? 0

    // Corrige pacotes antigos onde o totalPaid foi salvo apenas com o valor base (sem o taxi)
    if (hasTaxi && (!discountPercent || discountPercent === 0) && totalPaid === basePrice) {
        displayPrice = basePrice + taxiFee
    }

    useEffect(() => {
        setDiscountValue(discountPercent?.toString() || '0')
    }, [discountPercent])

    useEffect(() => {
        if (paidAt) {
            setPaymentDate(paidAt.split('T')[0])
        } else {
            setPaymentDate(new Date().toISOString().split('T')[0])
        }
    }, [paidAt])

    const handlePayment = async (method: string) => {
        setLoading(true)
        try {
            await updatePackagePaymentStatus(customerPackageId, 'paid', method, paymentDate)
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

    const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')

    const handleDiscount = async () => {
        const val = parseFloat(discountValue)
        if (isNaN(val) || val < 0) return
        setLoading(true)
        try {
            // O desconto é aplicado sobre o preço base (sem taxi) ou sobre o total? 
            // Geralmente sobre o serviço. Vamos manter coerência com o cálculo feito na venda.
            await applyPackageDiscount(customerPackageId, val, discountType, basePrice + taxiFee)
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
                background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '1rem',
                backdropFilter: 'blur(8px)'
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--bg-tertiary)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '400px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', position: 'relative', border: '1px solid var(--border)'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>💰 Pagamento do Pacote</h3>
                    <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        <span>Valor do Pacote:</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>R$ {basePrice.toFixed(2)}</span>
                    </div>

                    {hasTaxi && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.85rem', fontSize: '0.9rem', color: 'var(--status-done)' }}>
                            <span>🚗 Adicional Taxi Dog:</span>
                            <span style={{ fontWeight: 600 }}>R$ {taxiFee.toFixed(2)}</span>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.85rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Tipo de Desconto:</span>
                            <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                                <button
                                    onClick={() => setDiscountType('percent')}
                                    disabled={isPaid}
                                    style={{
                                        padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                        background: discountType === 'percent' ? 'var(--primary)' : 'transparent',
                                        color: 'white',
                                        fontWeight: discountType === 'percent' ? 600 : 400
                                    }}
                                >%</button>
                                <button
                                    onClick={() => setDiscountType('fixed')}
                                    disabled={isPaid}
                                    style={{
                                        padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                        background: discountType === 'fixed' ? 'var(--primary)' : 'transparent',
                                        color: 'white',
                                        fontWeight: discountType === 'fixed' ? 600 : 400
                                    }}
                                >R$</button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Valor:</span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    {discountType === 'fixed' && <span style={{ position: 'absolute', left: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>R$</span>}
                                    <input
                                        type="number" value={discountValue} disabled={isPaid}
                                        onChange={(e) => setDiscountValue(e.target.value)}
                                        min="0" max={discountType === 'percent' ? 100 : basePrice + taxiFee}
                                        style={{
                                            width: '80px', padding: `6px 8px 6px ${discountType === 'fixed' ? '24px' : '8px'}`,
                                            borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', textAlign: 'right', fontSize: '0.85rem'
                                        }}
                                    />
                                    {discountType === 'percent' && <span style={{ marginLeft: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>%</span>}
                                </div>
                                {!isPaid && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDiscount(); }}
                                        disabled={loading}
                                        style={{
                                            fontSize: '0.75rem', padding: '4px 12px', background: 'var(--primary)', color: 'white',
                                            border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600
                                        }}
                                    >Aplicar</button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        <span>Total Final:</span>
                        <span>R$ {displayPrice.toFixed(2)}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {isPaid ? (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ background: 'rgba(122, 201, 160, 0.1)', color: 'var(--status-done)', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: 600, border: '1px solid rgba(122, 201, 160, 0.2)' }}>
                                <span>✅ Pago via {paymentMethodLabels[paymentMethod || ''] || paymentMethod}</span>
                                {paidAt && (
                                    <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                                        Data do pagamento: <strong style={{ color: 'var(--text-primary)' }}>{new Date(paidAt).toLocaleDateString('pt-BR')}</strong>
                                    </span>
                                )}
                                {purchasedAt && (
                                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>
                                        Contratado em: {new Date(purchasedAt).toLocaleDateString('pt-BR')}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={handleUnpay} disabled={loading}
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', padding: '0.5rem 1rem', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem', width: '100%' }}
                            >↺ Desfazer Pagamento</button>
                        </div>
                    ) : (
                        <div>
                            {purchasedAt && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                                    📅 Contratado em: <strong style={{ color: 'var(--text-primary)' }}>{new Date(purchasedAt).toLocaleDateString('pt-BR')}</strong>
                                </div>
                            )}

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                                    Data do Pagamento:
                                </label>
                                <input
                                    type="date"
                                    value={paymentDate}
                                    onChange={(e) => setPaymentDate(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-primary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>

                            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>Confirmar Pagamento:</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                {Object.entries(paymentMethodLabels).map(([key, label]) => (
                                    <button
                                        key={key} onClick={() => handlePayment(key)} disabled={loading}
                                        style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: loading ? 'wait' : 'pointer', fontSize: '0.9rem', textAlign: 'left' }}
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
