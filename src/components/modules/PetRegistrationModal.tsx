'use client'

import { useActionState, useEffect, useState } from 'react'
import { createPetByTutor } from '@/app/actions/pet'
import styles from './PetRegistrationModal.module.css'
import ImageUpload from '@/components/ImageUpload'
import { maskPhone } from '@/utils/mask'

const initialState = {
    message: '',
    success: false
}

export default function PetRegistrationModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
    const [state, formAction, isPending] = useActionState(createPetByTutor, initialState)
    const [photoUrl, setPhotoUrl] = useState<string | null>(null)
    const [responsible2Phone, setResponsible2Phone] = useState('')

    useEffect(() => {
        if (state.success) {
            const timer = setTimeout(() => {
                onSuccess()
                onClose()
            }, 1500)
            return () => clearTimeout(timer)
        }
    }, [state, onSuccess, onClose])

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Cadastrar Novo Pet</h2>
                    <button className={styles.closeBtn} onClick={onClose}>&times;</button>
                </div>

                {state.message && (
                    <div className={`${styles.msg} ${state.success ? styles.success : styles.error}`}>
                        {state.message}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <ImageUpload
                        bucket="pets"
                        url={photoUrl}
                        onUpload={setPhotoUrl}
                        onRemove={() => setPhotoUrl(null)}
                        label="Foto do Pet (Opcional)"
                        circle={true}
                    />
                </div>

                <form action={formAction} className={styles.formGrid}>
                    <input type="hidden" name="photo_url" value={photoUrl || ''} />

                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                        <label className={styles.label}>Nome do Pet *</label>
                        <input name="name" required className={styles.input} placeholder="Ex: Rex" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Espécie *</label>
                        <select name="species" className={styles.select} required defaultValue="dog">
                            <option value="dog">Cão</option>
                            <option value="cat">Gato</option>
                            <option value="other">Outro</option>
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Raça</label>
                        <input name="breed" className={styles.input} placeholder="Ex: Vira-lata" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Sexo *</label>
                        <select name="gender" className={styles.select} required defaultValue="male">
                            <option value="male">Macho</option>
                            <option value="female">Fêmea</option>
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Porte *</label>
                        <select name="size" className={styles.select} required defaultValue="medium">
                            <option value="small">Pequeno</option>
                            <option value="medium">Médio</option>
                            <option value="large">Grande</option>
                            <option value="giant">Gigante</option>
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Data de Nascimento (Opcional)</label>
                        <input name="birthDate" type="date" className={styles.input} />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Peso (kg)</label>
                        <input name="weight" type="number" step="0.1" className={styles.input} placeholder="0.0" />
                    </div>

                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                        <label className={styles.label} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input type="checkbox" name="isNeutered" /> É castrado?
                        </label>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Responsável 2 (Nome)</label>
                        <input name="responsible2_name" className={styles.input} placeholder="Ex: Maria" />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Responsável 2 (Celular)</label>
                        <input
                            name="responsible2_phone"
                            className={styles.input}
                            value={responsible2Phone}
                            onChange={(e) => setResponsible2Phone(maskPhone(e.target.value))}
                            placeholder="Ex: (11) 99999-9999"
                        />
                    </div>

                    <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                        <label className={styles.label}>Condições de Saúde (Opcional)</label>
                        <textarea name="existing_conditions" className={styles.input} rows={2} placeholder="Ex: Alergia a frango..." />
                    </div>

                    <button type="submit" className={`btn btn-primary ${styles.submitBtn}`} disabled={isPending}>
                        {isPending ? 'Salvando...' : 'Cadastrar Pet'}
                    </button>
                    {!state.success && (
                        <p style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', gridColumn: '1/-1' }}>
                            * Você não poderá editar ou excluir estas informações depois. Caso precise, contate o staff.
                        </p>
                    )}
                </form>
            </div>
        </div>
    )
}
