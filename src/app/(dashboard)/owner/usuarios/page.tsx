'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'

// Use Profile interface or define local type matching DB
interface Profile {
    id: string
    full_name: string
    email: string
    role: 'superadmin' | 'admin' | 'staff' | 'customer'
    is_active: boolean
    created_at: string
    last_login?: string | null // Not in schema, removing or ignoring
}

const roleLabels: Record<string, string> = {
    superadmin: 'Super Admin',
    admin: 'Administrador',
    staff: 'Staff',
    customer: 'Cliente'
}

export default function UsuariosPage() {
    const supabase = createClient()
    const [users, setUsers] = useState<Profile[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Get current user's org
            const { data: currentUserProfile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', user.id)
                .single()

            if (!currentUserProfile?.org_id) return

            // Fetch profiles in the same org
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('org_id', currentUserProfile.org_id)
                .order('full_name')

            if (error) throw error
            if (profiles) setUsers(profiles)
        } catch (error) {
            console.error('Erro ao buscar usuários:', error)
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    const toggleUserStatus = () => {
        alert('Funcionalidade de alterar status em desenvolvimento.')
    }



    if (loading) {
        return (
            <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ fontSize: '1.2rem', color: '#666' }}>Carregando usuários...</div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <Link href="/owner" className={styles.backLink}>← Voltar</Link>
                    <h1 className={styles.title}>👥 Gestão de Usuários</h1>
                    <p className={styles.subtitle}>Gerencie os funcionários do seu pet shop</p>
                </div>
                <button className={styles.addButton} onClick={() => setShowModal(true)}>
                    + Novo Usuário
                </button>
            </div>

            {/* User Roles Info */}
            <div className={styles.rolesInfo}>
                <div className={styles.roleCard}>
                    <span className={styles.roleIcon}>👑</span>
                    <div>
                        <strong>Administrador</strong>
                        <p>Acesso total: financeiro, usuários, relatórios e todas as operações</p>
                    </div>
                </div>
                <div className={styles.roleCard}>
                    <span className={styles.roleIcon}>🛠️</span>
                    <div>
                        <strong>Staff</strong>
                        <p>Acesso operacional: check-in/out, timeline, fichas de atendimento</p>
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Usuário</th>
                            <th>Função</th>
                            <th>Status</th>
                            <th>Cadastro</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id}>
                                <td>
                                    <div className={styles.userInfo}>
                                        <div className={styles.avatar}>
                                            {(user.full_name || user.email).charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <span className={styles.userName}>{user.full_name || 'Sem Nome'}</span>
                                            <span className={styles.userEmail}>{user.email}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={`${styles.roleBadge} ${styles[user.role]}`}>
                                        {user.role.includes('admin') ? '👑' : '🛠️'} {roleLabels[user.role] || user.role}
                                    </span>
                                </td>
                                <td>
                                    <span className={`${styles.statusBadge} ${user.is_active ? styles.active : styles.inactive}`}>
                                        {user.is_active ? 'Ativo' : 'Inativo'}
                                    </span>
                                </td>
                                <td>
                                    <span className={styles.lastLogin}>
                                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                                    </span>
                                </td>
                                <td>
                                    <div className={styles.actions}>
                                        <button
                                            className={`${styles.actionBtn} ${user.is_active ? styles.deactivate : styles.activate}`}
                                            onClick={() => toggleUserStatus()}
                                        >
                                            {user.is_active ? 'Desativar' : 'Ativar'}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {users.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Nenhum usuário encontrado além de você.</p>
                )}
            </div>

            {/* Add User Modal */}
            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2>Adicionar Novo Usuário</h2>
                        <p style={{ marginBottom: '1rem', color: '#666' }}>
                            Esta funcionalidade ainda está em desenvolvimento. Por favor, crie usuários diretamente no painel administrativo por enquanto.
                        </p>

                        <div className={styles.modalActions}>
                            <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
