'use client'

import { useState, useEffect } from 'react'
import { uploadReportPhoto, saveDailyReport, getDailyReport } from '@/app/actions/dailyReport'

interface DailyReportModalProps {
    appointmentId: string
    petName: string
    serviceName: string
    onClose: () => void
    onSave: () => void
    readOnly?: boolean
}

export default function DailyReportModal({
    appointmentId,
    petName,
    serviceName,
    onClose,
    onSave,
    readOnly = false
}: DailyReportModalProps) {
    const [reportText, setReportText] = useState('')
    const [photos, setPhotos] = useState<string[]>([])
    const [uploading, setUploading] = useState(false)
    const [saving, setSaving] = useState(false)

    // Load existing report on mount
    useEffect(() => {
        const loadReport = async () => {
            const report = await getDailyReport(appointmentId)
            if (report) {
                setReportText(report.report_text || '')
                setPhotos(report.photos || [])
            }
        }
        loadReport()
    }, [appointmentId])

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (readOnly) return
        const files = e.target.files
        if (!files || files.length === 0) return

        setUploading(true)

        for (const file of Array.from(files)) {
            const formData = new FormData()
            formData.append('file', file)

            const result = await uploadReportPhoto(formData)
            if (result.success && result.url) {
                setPhotos(prev => [...prev, result.url!])
            } else {
                alert(result.message || 'Erro ao fazer upload da foto')
            }
        }

        setUploading(false)
    }

    const handleDeletePhoto = (photoUrl: string) => {
        if (readOnly) return
        if (confirm('Deletar esta foto?')) {
            setPhotos(prev => prev.filter(url => url !== photoUrl))
        }
    }

    const handleSave = async () => {
        if (readOnly) {
            onClose()
            return
        }
        if (!reportText.trim() && photos.length === 0) {
            alert('Adicione pelo menos um texto ou foto')
            return
        }

        setSaving(true)
        const result = await saveDailyReport(appointmentId, reportText, photos)
        setSaving(false)

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
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                background: '#1e293b', // Dark theme consistent
                borderRadius: '16px',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                border: '1px solid #334155'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#0f172a'
                }}>
                    <div>
                        <h2 style={{ margin: 0, color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>
                            Relatório do Dia
                        </h2>
                        <p style={{ margin: '0.25rem 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
                            {petName} • {serviceName}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: '#cbd5e1'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '1.5rem' }}>
                    {/* Text Area */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: 600,
                            color: '#cbd5e1'
                        }}>
                            Atividades do Dia
                        </label>
                        <textarea
                            value={reportText}
                            onChange={(e) => setReportText(e.target.value)}
                            readOnly={readOnly}
                            placeholder={readOnly ? "Nenhum relatório preenchido." : "Descreva o que o pet fez durante o dia..."}
                            style={{
                                width: '100%',
                                minHeight: '120px',
                                padding: '0.75rem',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                background: readOnly ? 'rgba(0,0,0,0.2)' : '#0f172a',
                                color: 'white',
                                fontSize: '0.9rem',
                                fontFamily: 'inherit',
                                resize: 'vertical'
                            }}
                        />
                    </div>

                    {/* Photo Upload */}
                    <div>
                        <label style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: 600,
                            color: '#cbd5e1'
                        }}>
                            Fotos do Dia
                        </label>

                        {/* Upload Button */}
                        {!readOnly && (
                            <label style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 1rem',
                                background: '#3b82f6',
                                color: 'white',
                                borderRadius: '8px',
                                cursor: uploading ? 'not-allowed' : 'pointer',
                                fontWeight: 600,
                                opacity: uploading ? 0.6 : 1,
                                marginBottom: '1rem'
                            }}>
                                {uploading ? '⏳ Enviando...' : '📷 Adicionar Fotos'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleFileSelect}
                                    disabled={uploading}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        )}

                        {/* Photo Gallery */}
                        {photos.length > 0 ? (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                                gap: '1rem',
                                marginTop: '0.5rem'
                            }}>
                                {photos.map((photoUrl, index) => (
                                    <div key={index} style={{ position: 'relative', aspectRatio: '1' }}>
                                        <img
                                            src={photoUrl}
                                            alt={`Foto ${index + 1}`}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                                borderRadius: '8px',
                                                border: '1px solid #334155'
                                            }}
                                        />
                                        {!readOnly && (
                                            <button
                                                onClick={() => handleDeletePhoto(photoUrl)}
                                                style={{
                                                    position: 'absolute',
                                                    top: '4px',
                                                    right: '4px',
                                                    background: 'rgba(0,0,0,0.6)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '50%',
                                                    width: '24px',
                                                    height: '24px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.875rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : readOnly && (
                            <p style={{ color: '#64748b', fontStyle: 'italic' }}>Nenhuma foto registrada.</p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '1.5rem',
                    borderTop: '1px solid #334155',
                    display: 'flex',
                    gap: '1rem',
                    justifyContent: 'flex-end',
                    background: '#0f172a',
                    borderRadius: '0 0 16px 16px'
                }}>
                    {!readOnly && (
                        <button
                            onClick={onClose}
                            style={{
                                padding: '0.75rem 1.5rem',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                background: 'transparent',
                                color: 'white',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            Cancelar
                        </button>
                    )}
                    <button
                        onClick={readOnly ? onClose : handleSave}
                        disabled={saving}
                        style={{
                            padding: '0.75rem 1.5rem',
                            border: 'none',
                            borderRadius: '8px',
                            background: readOnly ? '#334155' : '#10B981',
                            color: 'white',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            opacity: saving ? 0.6 : 1
                        }}
                    >
                        {readOnly ? 'Fechar' : (saving ? 'Salvando...' : 'Salvar Relatório')}
                    </button>
                </div>
            </div>
        </div>
    )
}
