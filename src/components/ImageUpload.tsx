'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '@/lib/image-utils'

interface ImageUploadProps {
    bucket: 'products' | 'avatars' | 'pets'
    url?: string | null
    onUpload: (url: string) => void
    onRemove: () => void
    label?: string
    circle?: boolean // For avatars
    resetAfterUpload?: boolean // For galleries
    aspect?: number // Aspect ratio for crop (e.g. 1 for square, 3/4 for cards)
}

export default function ImageUpload({
    bucket,
    url,
    onUpload,
    onRemove,
    label = 'Foto',
    circle = false,
    resetAfterUpload = false,
    aspect = 1
}: ImageUploadProps) {
    const supabase = createClient()
    const [uploading, setUploading] = useState(false)
    const [previewUrl, setPreviewUrl] = useState<string | null>(url || null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Crop State
    const [imageToCrop, setImageToCrop] = useState<string | null>(null)
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)
    const [showCropModal, setShowCropModal] = useState(false)

    const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels)
    }, [])

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0]
            const reader = new FileReader()
            reader.addEventListener('load', () => {
                setImageToCrop(reader.result as string)
                setShowCropModal(true)
            })
            reader.readAsDataURL(file)
        }
    }

    const handleUpload = async () => {
        if (!imageToCrop || !croppedAreaPixels) return

        try {
            setUploading(true)
            setShowCropModal(false)

            // 1. Crop image
            const croppedImageBlob = await getCroppedImg(imageToCrop, croppedAreaPixels)
            if (!croppedImageBlob) throw new Error('Falha ao processar imagem.')

            // 2. Generate filename
            const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.webp`
            const filePath = `${fileName}`

            // 3. Upload to Supabase
            const { error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(filePath, croppedImageBlob, {
                    contentType: 'image/webp'
                })

            if (uploadError) throw uploadError

            // 4. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from(bucket)
                .getPublicUrl(filePath)

            if (!resetAfterUpload) {
                setPreviewUrl(publicUrl)
            } else {
                setPreviewUrl(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
            }
            
            onUpload(publicUrl)
            setImageToCrop(null)

        } catch (error) {
            console.error('Erro ao fazer upload:', error)
            alert('Erro ao fazer upload da imagem.')
        } finally {
            setUploading(false)
        }
    }

    const handleRemove = () => {
        setPreviewUrl(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
        onRemove()
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {label && <label style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</label>}

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {!resetAfterUpload && (
                    <div
                        style={{
                            position: 'relative',
                            width: circle ? '100px' : '120px',
                            height: circle ? '100px' : '120px',
                            borderRadius: circle ? '50%' : '12px',
                            overflow: 'hidden',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '2px dashed var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.2s'
                        }}
                    >
                        {previewUrl ? (
                            <Image
                                src={previewUrl}
                                alt="Preview"
                                fill
                                style={{ objectFit: 'cover' }}
                            />
                        ) : (
                            <span style={{ fontSize: '2rem', opacity: 0.5 }}>📷</span>
                        )}

                        {uploading && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                backgroundColor: 'rgba(0,0,0,0.6)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                backdropFilter: 'blur(4px)',
                                zIndex: 10
                            }}>
                                <div style={{ width: '24px', height: '24px', border: '3px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            </div>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: 'var(--color-primary, #6366f1)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        {uploading ? (
                            <>
                                <div style={{ width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                Enviando...
                            </>
                        ) : (
                            <>
                                <span>{resetAfterUpload ? '➕ Adicionar Foto' : (previewUrl ? 'Alterar Foto' : 'Selecionar Foto')}</span>
                            </>
                        )}
                    </button>

                    {previewUrl && !resetAfterUpload && (
                        <button
                            type="button"
                            onClick={handleRemove}
                            disabled={uploading}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: 'transparent',
                                color: '#ef4444',
                                border: '1px solid #ef4444',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        >
                            Remover
                        </button>
                    )}
                </div>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                disabled={uploading}
            />

            {/* Modal de Crop */}
            {showCropModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px',
                    backdropFilter: 'blur(8px)'
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-primary, #ffffff)',
                        width: '100%',
                        maxWidth: '600px',
                        borderRadius: '20px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Ajustar Imagem</h3>
                            <button 
                                onClick={() => setShowCropModal(false)}
                                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', opacity: 0.5 }}
                            >
                                &times;
                            </button>
                        </div>

                        <div style={{ position: 'relative', height: '400px', backgroundColor: '#000' }}>
                            <Cropper
                                image={imageToCrop!}
                                crop={crop}
                                zoom={zoom}
                                aspect={aspect}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                                cropShape={circle ? 'round' : 'rect'}
                                showGrid={true}
                            />
                        </div>

                        <div style={{ padding: '24px' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Zoom</label>
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    style={{ width: '100%', accentColor: 'var(--color-primary, #6366f1)' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => setShowCropModal(false)}
                                    style={{
                                        padding: '10px 20px',
                                        backgroundColor: 'transparent',
                                        border: '1px solid var(--border)',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: 600
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleUpload}
                                    style={{
                                        padding: '10px 24px',
                                        backgroundColor: 'var(--color-primary, #6366f1)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                                    }}
                                >
                                    Confirmar e Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}

