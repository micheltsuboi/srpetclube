'use client'

import { useState, useEffect, useCallback, useActionState } from 'react'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/client'
import { createTutor } from '@/app/actions/tutor'

// Interface for Customer
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

    // Server Action State
    const [state, formAction, isPending] = useActionState(createTutor, initialState)

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

            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('org_id', profile.org_id)
                .order('name')

            if (error) throw error
            if (data) setTutors(data)
        } catch (error) {
            console.error('Erro ao buscar tutores:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchTutors()
    }, [fetchTutors])

    useEffect(() => {
        if (state.success) {
            setShowModal(false)
            fetchTutors()
            alert(state.message)
        } else if (state.message) {
            alert(state.message) // Simple error feedback
        }
    }, [state, fetchTutors])

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ fontSize: '1.2rem', color: '#666' }}>Carregando tutores...</div>
            </div>
        )
    }

    return (
        <div className="container">
            {/* Inline styles for simplicity matching the dashboard theme */}
            <style jsx>{`
                .container { padding: 2rem; max-width: 1200px; margin: 0 auto; }
                .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
                .title { font-size: 1.8rem; font-weight: bold; color: #1a1a1a; margin: 0; }
                .subtitle { color: #666; margin: 0.5rem 0 0 0; }
                .addButton { background: #0070f3; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
                .addButton:hover { background: #0051a2; transform: translateY(-1px); }
                .tableContainer { background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden; }
                .table { width: 100%; border-collapse: collapse; }
                .table th { background: #f8fafc; padding: 1rem; text-align: left; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
                .table td { padding: 1rem; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
                .avatar { width: 40px; height: 40px; background: #e2e8f0; border-radius: 50%; display: flex; alignItems: center; justify-content: center; font-weight: bold; color: #64748b; margin-right: 1rem; }
                .userInfo { display: flex; alignItems: center; }
                .userName { display: block; font-weight: 600; color: #1e293b; }
                .userEmail { font-size: 0.875rem; color: #64748b; }
                .modalOverlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; alignItems: center; z-index: 1000; }
                .modal { background: white; padding: 2rem; border-radius: 12px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
                .formGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
                .formGroup { margin-bottom: 1rem; }
                .label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #334155; }
                .input { width: 100%; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; }
                .fullWidth { grid-column: span 2; }
                .modalActions { display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem; }
                .cancelBtn { padding: 0.75rem 1.5rem; background: transparent; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; }
                .submitButton { padding: 0.75rem 1.5rem; background: #0070f3; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
                .backLink { color: #64748b; text-decoration: none; display: inline-block; margin-bottom: 0.5rem; font-size: 0.9rem; }
                .backLink:hover { color: #0070f3; }
            `}</style>

            <div className="header">
                <div>
                    <Link href="/owner" className="backLink">← Voltar</Link>
                    <h1 className="title">👤 Gestão de Tutores</h1>
                    <p className="subtitle">Cadastre e gerencie os clientes do pet shop</p>
                </div>
                <button className="addButton" onClick={() => setShowModal(true)}>
                    + Novo Tutor
                </button>
            </div>

            <div className="tableContainer">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Tutor</th>
                            <th>Contato</th>
                            <th>Endereço</th>
                            <th>Desde</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tutors.map(tutor => (
                            <tr key={tutor.id}>
                                <td>
                                    <div className="userInfo">
                                        <div className="avatar">
                                            {tutor.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <span className="userName">{tutor.name}</span>
                                            {tutor.instagram && <span style={{ fontSize: '0.8rem', color: '#ec4899' }}>@{tutor.instagram.replace('@', '')}</span>}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <span style={{ fontSize: '0.9rem' }}>📞 {tutor.phone_1}</span>
                                        <span className="userEmail">✉️ {tutor.email}</span>
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
                <div className="modalOverlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>Cadastrar Novo Tutor</h2>

                        <form action={formAction}>
                            <div className="formGrid">
                                <div className="formGroup fullWidth">
                                    <label htmlFor="name" className="label">Nome Completo *</label>
                                    <input id="name" name="name" type="text" className="input" required placeholder="Ex: Maria Souza" />
                                </div>

                                <div className="formGroup">
                                    <label htmlFor="email" className="label">Email *</label>
                                    <input id="email" name="email" type="email" className="input" required placeholder="maria@email.com" />
                                </div>
                                <div className="formGroup">
                                    <label htmlFor="password" className="label">Senha de Acesso *</label>
                                    <input id="password" name="password" type="password" className="input" required placeholder="******" minLength={6} />
                                </div>

                                <div className="formGroup">
                                    <label htmlFor="phone" className="label">Telefone/WhatsApp *</label>
                                    <input id="phone" name="phone" type="tel" className="input" required placeholder="(11) 99999-9999" />
                                </div>
                                <div className="formGroup">
                                    <label htmlFor="birthDate" className="label">Data de Nascimento</label>
                                    <input id="birthDate" name="birthDate" type="date" className="input" />
                                </div>

                                <div className="formGroup fullWidth">
                                    <label htmlFor="address" className="label">Endereço</label>
                                    <input id="address" name="address" type="text" className="input" placeholder="Rua das Flores, 123" />
                                </div>

                                <div className="formGroup">
                                    <label htmlFor="neighborhood" className="label">Bairro</label>
                                    <input id="neighborhood" name="neighborhood" type="text" className="input" />
                                </div>
                                <div className="formGroup">
                                    <label htmlFor="city" className="label">Cidade</label>
                                    <input id="city" name="city" type="text" className="input" defaultValue="São Paulo" />
                                </div>

                                <div className="formGroup fullWidth">
                                    <label htmlFor="instagram" className="label">Instagram</label>
                                    <input id="instagram" name="instagram" type="text" className="input" placeholder="@usuario" />
                                </div>
                            </div>

                            {state.message && !state.success && (
                                <p style={{ color: 'red', marginTop: '1rem' }}>{state.message}</p>
                            )}

                            <div className="modalActions">
                                <button type="button" className="cancelBtn" onClick={() => setShowModal(false)} disabled={isPending}>
                                    Cancelar
                                </button>
                                <button type="submit" className="submitButton" disabled={isPending}>
                                    {isPending ? 'Cadastrando...' : 'Cadastrar Tutor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
