'use client'

import { useState, useEffect, useCallback, useActionState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { createTutor, updateTutor, deleteTutor, searchCustomers } from '@/app/actions/tutor'
import { maskCPF, maskPhone, getWhatsAppLink } from '@/utils/mask'

interface Pet {
    id: string
    name: string
}

interface Customer {
    id: string
    name: string
    email: string | null
    phone_1: string | null
    cpf: string | null
    address: string | null
    neighborhood: string | null
    city: string | null
    instagram: string | null
    birth_date: string | null
    user_id: string | null
    created_at: string
    pets?: Pet[]
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
    const [debouncedSearch, setDebouncedSearch] = useState('')

    // Pagination
    const [displayLimit, setDisplayLimit] = useState(50)
    const [hasMore, setHasMore] = useState(false)

    // Debounce search term
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm)
        }, 500)
        return () => clearTimeout(timer)
    }, [searchTerm])

    // Server Action States
    const [createState, createAction, isCreatePending] = useActionState(createTutor, initialState)
    const [updateState, updateAction, isUpdatePending] = useActionState(updateTutor, initialState)

    // Derived state for feedback handling
    const isPending = isCreatePending || isUpdatePending

    const fetchTutors = useCallback(async (isInitial = false) => {
        try {
            if (isInitial) setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', user.id)
                .single()

            if (!profile?.org_id) return

            let finalTutors: any[] = []

            if (debouncedSearch) {
                const { data: rpcData, error: rpcError } = await supabase.rpc('search_tutors_rpc', {
                    search_term: debouncedSearch,
                    organization_id: profile.org_id,
                    p_limit: displayLimit + 1
                })
                
                if (rpcError) throw rpcError
                
                finalTutors = rpcData || []
                
                // Remapear pets_data para pets esperado pela UI
                finalTutors = finalTutors.map((c: any) => ({
                    ...c,
                    pets: c.pets_data
                }))
                
                setHasMore(false)
            } else {
                const { data, error } = await supabase
                    .from('customers')
                    .select('*, pets(id, name)')
                    .eq('org_id', profile.org_id)
                    .order('name')
                    .limit(displayLimit + 1)

                if (error) throw error
                
                finalTutors = data || []
                if (finalTutors.length > displayLimit) {
                    setHasMore(true)
                    finalTutors = finalTutors.slice(0, displayLimit)
                } else {
                    setHasMore(false)
                }
            }


            if (finalTutors) setTutors(finalTutors)
        } catch (error) {
            console.error('Erro ao buscar tutores:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase, debouncedSearch, displayLimit])

    useEffect(() => {
        fetchTutors(tutors.length === 0)
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
                            <th>Pets</th>
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span className={styles.userName}>{tutor.name}</span>
                                                {tutor.phone_1 && (
                                                    <a 
                                                        href={getWhatsAppLink(tutor.phone_1) || '#'} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title="Abrir WhatsApp"
                                                        style={{ color: '#25D366', display: 'flex', alignItems: 'center' }}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                                                        </svg>
                                                    </a>
                                                )}
                                            </div>
                                            {tutor.instagram && <span style={{ fontSize: '0.8rem', color: '#ec4899' }}>@{tutor.instagram.replace('@', '')}</span>}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div className={styles.petsList}>
                                        {tutor.pets && tutor.pets.length > 0 ? (
                                            tutor.pets.map(pet => (
                                                <span key={pet.id} className={styles.petBadge}>
                                                    🐾 {pet.name}
                                                </span>
                                            ))
                                        ) : (
                                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Sem pets</span>
                                        )}
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
                {hasMore && !debouncedSearch && (
                    <div style={{ textAlign: 'center', padding: '1.5rem', borderTop: '1px solid var(--border)' }}>
                        <button 
                            onClick={() => setDisplayLimit(prev => prev + 50)}
                            className={styles.addTaskBtn || ''}
                            style={{ background: 'var(--bg-tertiary)', padding: '0.6rem 2rem', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        >
                            ⬇️ Carregar mais tutores...
                        </button>
                    </div>
                )}
            </div>

            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>
                            {selectedTutor ? 'Editar Tutor' : 'Cadastrar Novo Tutor'}
                        </h2>

                        <form action={selectedTutor ? updateAction : createAction} autoComplete="off">
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
                                    <label htmlFor="cpf" className={styles.label}>CPF (Opcional)</label>
                                    <input
                                        id="cpf" name="cpf" type="text" className={styles.input}
                                        placeholder="000.000.000-00"
                                        defaultValue={selectedTutor?.cpf ? maskCPF(selectedTutor.cpf) : ''}
                                        onChange={(e) => e.target.value = maskCPF(e.target.value)}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label htmlFor="email" className={styles.label}>Email (Opcional)</label>
                                    <input
                                        id="email" name="email" type="email" className={styles.input}
                                        placeholder="maria@email.com"
                                        defaultValue={selectedTutor?.email || ''}
                                        autoComplete="off"
                                        data-lpignore="true"
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label htmlFor="password" className={styles.label}>
                                        {selectedTutor ? 'Alterar Senha' : 'Senha (Opcional)'}
                                    </label>
                                    <input
                                        id="password" name="password" type="password" className={styles.input}
                                        placeholder={selectedTutor ? "Deixe em branco para não alterar" : "Mínimo 6 caracteres"}
                                        minLength={6}
                                        autoComplete="new-password"
                                        data-lpignore="true"
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
                                        defaultValue={selectedTutor?.phone_1 ? maskPhone(selectedTutor.phone_1) : ''}
                                        onChange={(e) => e.target.value = maskPhone(e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="birthDate" className={styles.label}>Data de Nascimento (Opcional)</label>
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
                                        id="city" name="city" type="text" className={styles.input} defaultValue={selectedTutor?.city || ''}
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
