'use client'

import { useEffect, useState, useCallback } from 'react'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'

interface Photo {
    id: string
    url: string
    date: string
    service_name: string
    pet_name: string
}

interface Pet {
    id: string
    name: string
}

export default function GalleryPage() {
    const supabase = createClient()
    const [pets, setPets] = useState<Pet[]>([])
    const [selectedPetId, setSelectedPetId] = useState<string>('all')
    const [photos, setPhotos] = useState<Photo[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)

    const fetchPhotos = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // 1. Get pets for this customer
            const { data: customer } = await supabase
                .from('customers')
                .select('id')
                .eq('user_id', user.id)
                .single()

            if (!customer) return

            const { data: petData } = await supabase
                .from('pets')
                .select('id, name')
                .eq('customer_id', customer.id)

            if (!petData || petData.length === 0) return
            setPets(petData)

            const petIds = selectedPetId === 'all'
                ? petData.map(p => p.id)
                : [selectedPetId]

            // 2. Get reports with photos for these pets
            const { data: reportData } = await supabase
                .from('appointment_daily_reports')
                .select(`
                    id,
                    photos,
                    created_at,
                    appointments!inner (
                        services (name),
                        pets (name)
                    )
                `)
                .in('appointments.pet_id', petIds)
                .order('created_at', { ascending: false })

            if (reportData) {
                const galleryPhotos: Photo[] = []
                reportData.forEach(report => {
                    if (report.photos && report.photos.length > 0) {
                        report.photos.forEach((url: string, idx: number) => {
                            galleryPhotos.push({
                                id: `${report.id}_${idx}`,
                                url,
                                date: report.created_at,
                                service_name: (report.appointments as any).services?.name || 'Serviço',
                                pet_name: (report.appointments as any).pets?.name || 'Pet'
                            })
                        })
                    }
                })
                setPhotos(galleryPhotos)
            }

        } catch (error) {
            console.error('Error fetching gallery photos:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase, selectedPetId])

    useEffect(() => {
        fetchPhotos()
    }, [fetchPhotos])

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    if (loading && pets.length === 0) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
                <p>Carregando fotos...</p>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <a href="/tutor" className={styles.backButton}>← Voltar</a>
                <h1 className={styles.title}>🖼️ Galeria</h1>
            </div>

            {pets.length > 1 && (
                <div className={styles.filterContainer}>
                    <label className={styles.filterLabel}>Filtrar por pet:</label>
                    <select
                        className={styles.filterSelect}
                        value={selectedPetId}
                        onChange={(e) => setSelectedPetId(e.target.value)}
                    >
                        <option value="all">Todos os pets</option>
                        {pets.map(pet => (
                            <option key={pet.id} value={pet.id}>{pet.name}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className={styles.gallery}>
                {photos.length > 0 ? photos.map((photo) => (
                    <div
                        key={photo.id}
                        className={styles.photoCard}
                        onClick={() => setSelectedPhoto(photo)}
                    >
                        <img src={photo.url} alt={`Foto de ${photo.service_name}`} />
                        <div className={styles.photoOverlay}>
                            <span className={styles.photoService}>{photo.pet_name} • {photo.service_name}</span>
                            <span className={styles.photoDate}>{formatDate(photo.date)}</span>
                        </div>
                    </div>
                )) : (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                        <p>Nenhuma foto encontrada.</p>
                    </div>
                )}
            </div>

            {/* Lightbox */}
            {selectedPhoto && (
                <div className={styles.lightbox} onClick={() => setSelectedPhoto(null)}>
                    <button className={styles.closeBtn}>✕</button>
                    <img src={selectedPhoto.url} alt="Foto ampliada" />
                    <div className={styles.lightboxInfo}>
                        <span>{selectedPhoto.service_name}</span>
                        <span>{formatDate(selectedPhoto.date)}</span>
                    </div>
                </div>
            )}
        </div>
    )
}
