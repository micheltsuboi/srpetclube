'use client'

import { useState, useEffect, useCallback, useActionState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { createTutor, updateTutor, deleteTutor } from '@/app/actions/tutor'

interface Customer {
    id: string
    name: string
    email: string | null
    phone_1: string | null
    address: string | null
    neighborhood: string | null
    city: string | null
    instagram: string | null
    birth_date: string | null
    user_id: string | null
    created_at: string
}

const initialState = {
    message: '',
    success: false
}

export default function TutorsPage() {
    const supabase = createClient()
    const [tutors, setTutors] = useState<Customer[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [selectedTutor, setSelectedTutor] = useState<Customer | null>(null)
    const [searchTerm, setSearchTerm] = useState('')

    // Server Action States
    const [createState, createAction, isCreatePending] = useActionState(createTutor, initialState)
    const [updateState, updateAction, isUpdatePending] = useActionState(updateTutor, initialState)

    // Derived state for feedback handling
    const isPending = isCreatePending || isUpdatePending

    const fetchTutors = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', user.id)
                .single()

            if (!profile?.org_id) return

            let query = supabase
                .from('customers')
                .select('*')
                .eq('org_id', profile.org_id)
                .order('name')

            if (searchTerm) {
                query = query.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone_1.ilike.%${searchTerm}%`)
            }

            const { data, error } = await query

            if (error) throw error
            if (data) setTutors(data)
        } catch (error) {
            console.error('Erro ao buscar tutores:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase, searchTerm])

    useEffect(() => {
        fetchTutors()
    }, [fetchTutors])

    // Success/Error Handling
    useEffect(() => {
        if (createState.success) {
            setShowModal(false)
            fetchTutors()
            alert(createState.message)
            // Reset state logically by unmounting/remounting logic or just ignoring old state
        } else if (createState.message) {
            alert(createState.message)
        }
    }, [createState, fetchTutors])

    useEffect(() => {
        if (updateState.success) {
            setShowModal(false)
            setSelectedTutor(null)
            fetchTutors()
            alert(updateState.message)
        } else if (updateState.message) {
            alert(updateState.message)
        }
    }, [updateState, fetchTutors])

    const handleRowClick = (tutor: Customer) => {
        setSelectedTutor(tutor)
        setShowModal(true)
    }

    const handleNewTutor = () => {
        setSelectedTutor(null)
        setShowModal(true)
    }

    const handleDelete = async () => {
        if (!selectedTutor) return
        if (!confirm('Tem certeza que deseja excluir este tutor? Esta ação não pode ser desfeita.')) return

        const res = await deleteTutor(selectedTutor.id)
        if (res.success) {
            alert(res.message)
            setShowModal(false)
            setSelectedTutor(null)
            fetchTutors()
        } else {
            alert(res.message)
        }
    }

    if (loading) {
        return (
            <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ fontSize: '1.2rem', color: '#666' }}>Carregando tutores...</div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <Link href="/owner" className={styles.backLink}>← Voltar</Link>
                    <h1 className={styles.title}>👤 Gestão de Tutores</h1>
                    <p className={styles.subtitle}>Cadastre e gerencie os clientes do pet shop</p>
                </div>
                <button className={styles.addButton} onClick={handleNewTutor}>
                    + Novo Tutor
                </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
                <input
                    type="text"
                    placeholder="🔍 Buscar tutor por nome, email ou telefone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.input}
                    style={{ maxWidth: '400px' }}
                />
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Tutor</th>
                            <th>Contato</th>
                            <th>Endereço</th>
                            <th>Portal</th>
                            <th>Desde</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tutors.map(tutor => (
                            <tr key={tutor.id} onClick={() => handleRowClick(tutor)} style={{ cursor: 'pointer' }}>
                                <td>
                                    <div className={styles.userInfo}>
                                        <div className={styles.avatar}>
                                            {tutor.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <span className={styles.userName}>{tutor.name}</span>
                                            {tutor.instagram && <span style={{ fontSize: '0.8rem', color: '#ec4899' }}>@{tutor.instagram.replace('@', '')}</span>}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <span style={{ fontSize: '0.9rem' }}>📞 {tutor.phone_1}</span>
                                        <span className={styles.userEmail}>✉️ {tutor.email}</span>
                                        {tutor.birth_date && (
                                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>🎂 {new Date(tutor.birth_date).toLocaleDateString('pt-BR')}</span>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <div style={{ fontSize: '0.9rem', color: '#475569' }}>
                                        {tutor.address && <div>{tutor.address}</div>}
                                        {(tutor.neighborhood || tutor.city) && (
                                            <div style={{ fontSize: '0.8rem' }}>
                                                {tutor.neighborhood}{tutor.neighborhood && tutor.city ? ' - ' : ''}{tutor.city}
                                            </div>
                                        )}
                                        {!tutor.address && !tutor.neighborhood && !tutor.city && '-'}
                                    </div>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {tutor.user_id ? (
                                            <span style={{ color: '#2ecc71', fontSize: '1.2rem' }} title="Com acesso ao portal">✅</span>
                                        ) : (
                                            <span style={{ color: '#cbd5e1', fontSize: '1.2rem' }} title="Sem acesso ao portal">⚪</span>
                                        )}
                                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                            {tutor.user_id ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    {new Date(tutor.created_at).toLocaleDateString('pt-BR')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {tutors.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>Nenhum tutor cadastrado.</p>
                )}
            </div>

            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>
                            {selectedTutor ? 'Editar Tutor' : 'Cadastrar Novo Tutor'}
                        </h2>

                        <form action={selectedTutor ? updateAction : createAction}>
                            {selectedTutor && <input type="hidden" name="id" value={selectedTutor.id} />}

                            <div className={styles.formGrid}>
                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                    <label htmlFor="name" className={styles.label}>Nome Completo *</label>
                                    <input
                                        id="name" name="name" type="text" className={styles.input} required
                                        placeholder="Ex: Maria Souza"
                                        defaultValue={selectedTutor?.name || ''}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label htmlFor="email" className={styles.label}>Email *</label>
                                    <input
                                        id="email" name="email" type="email" className={styles.input} required
                                        placeholder="maria@email.com"
                                        defaultValue={selectedTutor?.email || ''}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label htmlFor="password" className={styles.label}>
                                        {selectedTutor ? 'Alterar Senha de Acesso' : 'Senha de Acesso *'}
                                    </label>
                                    <input
                                        id="password" name="password" type="password" className={styles.input}
                                        required={!selectedTutor}
                                        placeholder={selectedTutor ? "Deixe em branco para não alterar" : "******"}
                                        minLength={6}
                                    />
                                    {selectedTutor && !selectedTutor.user_id && (
                                        <small style={{ color: 'var(--color-coral)', fontSize: '0.75rem' }}>
                                            ⚠️ Este tutor ainda não tem acesso ao portal. Defina uma senha para criar o acesso.
                                        </small>
                                    )}
                                </div>

                                <div className={styles.formGroup}>
                                    <label htmlFor="phone" className={styles.label}>Telefone/WhatsApp *</label>
                                    <input
                                        id="phone" name="phone" type="tel" className={styles.input} required
                                        placeholder="(11) 99999-9999"
                                        defaultValue={selectedTutor?.phone_1 || ''}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="birthDate" className={styles.label}>Data de Nascimento</label>
                                    <input
                                        id="birthDate" name="birthDate" type="date" className={styles.input}
                                        defaultValue={selectedTutor?.birth_date || ''}
                                    />
                                </div>

                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                    <label htmlFor="address" className={styles.label}>Endereço</label>
                                    <input
                                        id="address" name="address" type="text" className={styles.input}
                                        placeholder="Rua das Flores, 123"
                                        defaultValue={selectedTutor?.address || ''}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label htmlFor="neighborhood" className={styles.label}>Bairro</label>
                                    <input
                                        id="neighborhood" name="neighborhood" type="text" className={styles.input}
                                        defaultValue={selectedTutor?.neighborhood || ''}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="city" className={styles.label}>Cidade</label>
                                    <input
                                        id="city" name="city" type="text" className={styles.input} defaultValue={selectedTutor?.city || 'São Paulo'}
                                    />
                                </div>

                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                    <label htmlFor="instagram" className={styles.label}>Instagram</label>
                                    <input
                                        id="instagram" name="instagram" type="text" className={styles.input}
                                        placeholder="@usuario"
                                        defaultValue={selectedTutor?.instagram || ''}
                                    />
                                </div>
                            </div>

                            <div className={styles.modalActions} style={{ justifyContent: 'space-between' }}>
                                <div>
                                    {selectedTutor && (
                                        <button
                                            type="button"
                                            className={styles.cancelBtn}
                                            style={{ color: 'red', borderColor: 'red', background: 'rgba(255,0,0,0.05)' }}
                                            onClick={handleDelete}
                                        >
                                            Excluir
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)} disabled={isPending}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className={styles.submitButton} disabled={isPending}>
                                        {isPending ? 'Salvando...' : (selectedTutor ? 'Salvar Alterações' : 'Cadastrar Tutor')}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
