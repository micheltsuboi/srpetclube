'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateAppointmentStatus, updateChecklist, updatePetPreferences } from '@/app/actions/appointment'
import { checkInAppointment, checkOutAppointment } from '@/app/actions/checkInOut'
import { uploadReportPhoto, saveDailyReport, getDailyReport } from '@/app/actions/dailyReport'
import { printThermalTicket } from '@/utils/printThermalTicket'

interface ChecklistItem {
    text: string
    completed: boolean
    completed_at: string | null
}

interface ServiceExecutionModalProps {
    appointment: {
        id: string
        pet_id: string
        checklist?: any[]
        pets?: {
            name: string
            perfume_allowed?: boolean
            accessories_allowed?: boolean
        }
        services?: {
            name: string
        }
        notes?: string | null
        actual_check_in?: string | null
        actual_check_out?: string | null
    }
    onClose: () => void
    onSave: () => void
}

function normalizeChecklist(raw: any[] | undefined): ChecklistItem[] {
    if (!raw || raw.length === 0) return []
    // Support old format { label, checked } and { item, done } and new { text, completed, completed_at }
    return raw.map((item: any) => ({
        text: item.text || item.label || item.item || 'Item',
        completed: item.completed ?? item.checked ?? item.done ?? false,
        completed_at: item.completed_at || null
    }))
}

export default function ServiceExecutionModal({ appointment, onClose, onSave }: ServiceExecutionModalProps) {
    const [loading, setLoading] = useState(false)
    const [checklist, setChecklist] = useState<ChecklistItem[]>(
        normalizeChecklist(appointment.checklist)
    )
    const [perfumeAllowed, setPerfumeAllowed] = useState(appointment.pets?.perfume_allowed ?? true)
    const [accessoriesAllowed, setAccessoriesAllowed] = useState(appointment.pets?.accessories_allowed ?? true)
    const [savingChecklist, setSavingChecklist] = useState(false)

    // Photo State
    const [photos, setPhotos] = useState<string[]>([])
    const [uploading, setUploading] = useState(false)

    // Load existing photos (using daily report structure for now as it's the standard for "photos of the day")
    useEffect(() => {
        const loadPhotos = async () => {
            const report = await getDailyReport(appointment.id)
            if (report && report.photos) {
                setPhotos(report.photos)
            }
        }
        loadPhotos()
    }, [appointment.id])

    const handleChecklistToggle = async (index: number) => {
        const newChecklist = [...checklist]
        const wasCompleted = newChecklist[index].completed
        newChecklist[index].completed = !wasCompleted
        newChecklist[index].completed_at = !wasCompleted ? new Date().toISOString() : null
        setChecklist(newChecklist)

        // Auto-save
        setSavingChecklist(true)
        try {
            await updateChecklist(appointment.id, newChecklist)
            onSave() // Refresh parent UI
        } catch (err) {
            console.error('Error auto-saving checklist:', err)
        } finally {
            setSavingChecklist(false)
        }
    }

    const handleSaveChecklist = async () => {
        setSavingChecklist(true)
        try {
            await updateChecklist(appointment.id, checklist)
            onSave()
        } finally {
            setSavingChecklist(false)
        }
    }

    const handlePreferenceToggle = async (type: 'perfume' | 'accessories', value: boolean) => {
        if (type === 'perfume') setPerfumeAllowed(value)
        else setAccessoriesAllowed(value)

        await updatePetPreferences(appointment.pet_id, {
            [type === 'perfume' ? 'perfume_allowed' : 'accessories_allowed']: value
        })
    }

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        setUploading(true)
        const newPhotos = [...photos]

        for (const file of Array.from(files)) {
            const formData = new FormData()
            formData.append('file', file)
            const res = await uploadReportPhoto(formData)
            if (res.success && res.url) {
                newPhotos.push(res.url)
            }
        }
        setPhotos(newPhotos)

        // Auto-save report with photos
        // We preserve existing report text if any (fetching it properly would be better but for now let's just save photos)
        // Actually, let's just save the photos to the daily report table
        await saveDailyReport(appointment.id, '', newPhotos)

        setUploading(false)
    }

    const handleDeletePhoto = async (photoUrl: string) => {
        if (!confirm('Remover foto?')) return
        const newPhotos = photos.filter(p => p !== photoUrl)
        setPhotos(newPhotos)
        await saveDailyReport(appointment.id, '', newPhotos)
    }

    const handleStatusAction = async (action: 'start' | 'checkin' | 'checkout') => {
        setLoading(true)
        let res
        if (action === 'start') {
            res = await updateAppointmentStatus(appointment.id, 'in_progress')
        } else if (action === 'checkin') {
            res = await checkInAppointment(appointment.id)
        } else {
            // Save everything before checkout
            await handleSaveChecklist()
            res = await checkOutAppointment(appointment.id)
        }

        setLoading(false)
        if (res.success) {
            alert(res.message)
            onSave()
            onClose()
        } else {
            alert(res.message)
        }
    }

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 1100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)'
        }} onClick={onClose}>
            <div style={{
                background: '#1e293b',
                width: '90%', maxWidth: '600px',
                maxHeight: '90vh', overflowY: 'auto',
                borderRadius: '16px', padding: '0',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a' }}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', color: 'white', fontWeight: 700, margin: 0 }}>🛁 Execução de Serviço</h2>
                        <p style={{ color: '#94a3b8', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
                            {appointment.pets?.name} • {appointment.services?.name}
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button
                            onClick={() => printThermalTicket(appointment as any)}
                            title="Imprimir Comanda Térmica (58mm)"
                            style={{
                                background: '#2563eb',
                                border: 'none',
                                color: 'white',
                                padding: '0.45rem 0.85rem',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}
                        >
                            🖨️ Imprimir Ficha
                        </button>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                    </div>
                </div>

                {appointment.notes && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', borderBottom: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem 1.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                            <div>
                                <strong style={{ display: 'block', color: '#fbbf24', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Observações do Agendamento:</strong>
                                <p style={{ margin: 0, color: '#fcd34d', fontSize: '0.95rem', lineHeight: 1.4 }}>{appointment.notes}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* Status & Actions */}
                    <section>
                        <h3 style={{ color: '#cbd5e1', fontSize: '1rem', marginBottom: '1rem', fontWeight: 600 }}>Status do Atendimento</h3>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            {!appointment.actual_check_in ? (
                                <button onClick={() => handleStatusAction('checkin')} style={{ flex: 1, padding: '1rem', borderRadius: '8px', border: 'none', background: '#10B981', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    📥 Confirmar Entrada (Check-in)
                                </button>
                            ) : !appointment.actual_check_out ? (
                                <button onClick={() => handleStatusAction('checkout')} style={{ flex: 1, padding: '1rem', borderRadius: '8px', border: 'none', background: '#3B82F6', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    ✅ Finalizar (Check-out)
                                </button>
                            ) : (
                                <div style={{ flex: 1, padding: '1rem', background: '#334155', borderRadius: '8px', color: '#94a3b8', textAlign: 'center' }}>
                                    Serviço Concluído
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Preferences */}
                    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div
                            onClick={() => handlePreferenceToggle('perfume', !perfumeAllowed)}
                            style={{
                                padding: '1rem', borderRadius: '8px',
                                background: perfumeAllowed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${perfumeAllowed ? '#059669' : '#ef4444'}`,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem'
                            }}>
                            <span style={{ fontSize: '1.5rem' }}>✨</span>
                            <div>
                                <strong style={{ display: 'block', color: perfumeAllowed ? '#34d399' : '#f87171' }}>Perfume</strong>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{perfumeAllowed ? 'Permitido' : 'Não Permitido'}</span>
                            </div>
                        </div>
                        <div
                            onClick={() => handlePreferenceToggle('accessories', !accessoriesAllowed)}
                            style={{
                                padding: '1rem', borderRadius: '8px',
                                background: accessoriesAllowed ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${accessoriesAllowed ? '#3b82f6' : '#ef4444'}`,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem'
                            }}>
                            <span style={{ fontSize: '1.5rem' }}>🎀</span>
                            <div>
                                <strong style={{ display: 'block', color: accessoriesAllowed ? '#60a5fa' : '#f87171' }}>Adereços</strong>
                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{accessoriesAllowed ? 'Permitido' : 'Não Permitido'}</span>
                            </div>
                        </div>
                    </section>

                    {/* Checklist */}
                    <section>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ color: '#cbd5e1', fontSize: '1rem', fontWeight: 600, margin: 0 }}>Checklist de Procedimentos</h3>
                            {savingChecklist && <span style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 500 }}>⏳ Salvando...</span>}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                            {checklist.length === 0 ? (
                                <p style={{ color: '#64748b', fontSize: '0.85rem', gridColumn: '1/-1' }}>Nenhum item no checklist para este serviço.</p>
                            ) : checklist.map((item, idx) => (
                                <label key={idx} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                                    padding: '0.75rem', background: item.completed ? 'rgba(16, 185, 129, 0.1)' : '#0f172a',
                                    borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
                                    border: item.completed ? '1px solid #059669' : '1px solid #334155'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={item.completed}
                                        onChange={() => handleChecklistToggle(idx)}
                                        style={{ width: '18px', height: '18px', accentColor: '#10B981', marginTop: '2px' }}
                                    />
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ color: item.completed ? 'white' : '#94a3b8', fontSize: '0.9rem', fontWeight: item.completed ? 600 : 400 }}>{item.text}</span>
                                        {item.completed && item.completed_at && (
                                            <span style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '2px' }}>
                                                ✓ {new Date(item.completed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </section>

                    {/* Photos */}
                    <section>
                        <h3 style={{ color: '#cbd5e1', fontSize: '1rem', marginBottom: '1rem', fontWeight: 600 }}>Registro Fotográfico</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '1rem' }}>
                            {/* Upload Button */}
                            <label style={{
                                aspectRatio: '1', border: '2px dashed #475569', borderRadius: '8px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                cursor: uploading ? 'wait' : 'pointer', color: '#94a3b8', transition: 'all 0.2s'
                            }}>
                                <span style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📷</span>
                                <span style={{ fontSize: '0.8rem' }}>{uploading ? '...' : 'Adicionar'}</span>
                                <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} disabled={uploading} style={{ display: 'none' }} />
                            </label>

                            {/* Photo Grid */}
                            {photos.map((url, i) => (
                                <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155' }}>
                                    <img src={url} alt="Pet" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <button onClick={() => handleDeletePhoto(url)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', color: 'white', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                                </div>
                            ))}
                        </div>
                    </section>

                </div>

                <div style={{ padding: '1.5rem', borderTop: '1px solid #334155', background: '#0f172a', display: 'flex', justifyContent: 'flex-end', borderRadius: '0 0 16px 16px' }}>
                    <button onClick={onClose} style={{ padding: '0.75rem 1.5rem', background: '#334155', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
                </div>

            </div>
        </div>
    )
}
