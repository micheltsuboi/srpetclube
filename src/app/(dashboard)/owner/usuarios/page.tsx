'use client'

import { useState, useEffect, useCallback, useActionState } from 'react'
import Link from 'next/link'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import { createUser, updateUser } from '@/app/actions/user'

export interface WorkScheduleDay {
    day: number
    isActive: boolean
    start: string
    end: string
    lunchStart: string
    lunchEnd: string
}

export const defaultSchedule: WorkScheduleDay[] = [
    { day: 0, isActive: false, start: '', end: '', lunchStart: '', lunchEnd: '' },
    { day: 1, isActive: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    { day: 2, isActive: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    { day: 3, isActive: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    { day: 4, isActive: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    { day: 5, isActive: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    { day: 6, isActive: false, start: '', end: '', lunchStart: '', lunchEnd: '' }
]

// Use Profile interface or define local type matching DB
export interface Profile {
    id: string
    full_name: string
    email: string
    role: 'superadmin' | 'admin' | 'staff' | 'customer'
    is_active: boolean
    work_schedule?: any
    permissions?: string[]
    created_at: string
}

const roleLabels: Record<string, string> = {
    superadmin: 'Super Admin',
    admin: 'Administrador',
    staff: 'Staff',
    customer: 'Cliente'
}

const STAFF_MODULES = [
    { id: 'agenda', label: '📅 Agenda' },
    { id: 'banho_tosa', label: '🛁 Banho e Tosa' },
    { id: 'creche', label: '🐕 Creche' },
    { id: 'hospedagem', label: '🏨 Hospedagem' },
    { id: 'pacotes', label: '📦 Pacotes' },
    { id: 'tutores', label: '👤 Tutores' },
    { id: 'pets', label: '🐾 Pets' },
    { id: 'petshop', label: '🛍️ Petshop' },
    { id: 'servicos', label: '📋 Serviços' },
    { id: 'ponto', label: '⏰ Cartão Ponto' }
]

const initialState = {
    message: '',
    success: false
}

export default function UsuariosPage() {
    const supabase = createClient()
    const [users, setUsers] = useState<Profile[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [workSchedule, setWorkSchedule] = useState<WorkScheduleDay[]>(defaultSchedule)
    const [selectedRole, setSelectedRole] = useState<string>('staff')
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])

    // Server Action State - Create
    const [state, formAction, isPending] = useActionState(createUser, initialState)

    // Server Action State - Update
    const [updateState, updateFormAction, isUpdatePending] = useActionState(updateUser, initialState)

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

            // Fetch profiles in the same org, excluding customers
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('org_id', currentUserProfile.org_id)
                .neq('role', 'customer')
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

    useEffect(() => {
        if (state.success) {
            setShowModal(false)
            fetchUsers()
            alert(state.message)
        }
    }, [state, fetchUsers])

    useEffect(() => {
        if (updateState.success) {
            setShowEditModal(false)
            fetchUsers()
            alert(updateState.message)
        }
    }, [updateState, fetchUsers])

    const handleEdit = (user: Profile) => {
        setSelectedUser(user)
        setSelectedRole(user.role)
        setWorkSchedule(Array.isArray(user.work_schedule) && user.work_schedule.length > 0 ? user.work_schedule : defaultSchedule)
        setSelectedPermissions(user.permissions || [])
        setShowEditModal(true)
    }

    const toggleUserStatus = async (user: Profile) => {
        if (!confirm(`Tem certeza que deseja ${user.is_active ? 'desativar' : 'ativar'} este usuário?`)) return

        const formData = new FormData()
        formData.append('userId', user.id)
        formData.append('fullName', user.full_name)
        formData.append('role', user.role)
        formData.append('isActive', (!user.is_active).toString())

        // Pass existing work schedule if any
        if (user.work_schedule) formData.append('workSchedule', JSON.stringify(user.work_schedule))
        if (user.permissions) formData.append('permissions', JSON.stringify(user.permissions))

        const result = await updateUser(null, formData)
        if (result.success) {
            fetchUsers()
        } else {
            alert(result.message)
        }
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
                <button className={styles.addButton} onClick={() => {
                    setWorkSchedule(defaultSchedule);
                    setSelectedRole('staff');
                    setSelectedPermissions([]);
                    setShowModal(true)
                }}>
                    + Novo Usuário
                </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
                <input
                    type="text"
                    placeholder="🔍 Buscar usuário por nome ou email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.input}
                    style={{ maxWidth: '400px' }}
                />
            </div>

            {/* User Roles Info */}
            <div className={styles.rolesInfo}>
                {/* ... */}
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
                        {users
                            .filter(user =>
                                !searchTerm ||
                                user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                user.email.toLowerCase().includes(searchTerm.toLowerCase())
                            )
                            .map(user => (
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
                                                className={styles.editBtn}
                                                onClick={() => handleEdit(user)}
                                            >
                                                ✏️ Editar
                                            </button>
                                            <button
                                                className={`${styles.actionBtn} ${user.is_active ? styles.deactivate : styles.activate}`}
                                                onClick={() => toggleUserStatus(user)}
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
            {
                showModal && (
                    <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                        <div className={styles.modal} onClick={e => e.stopPropagation()}>
                            <h2>Adicionar Novo Usuário</h2>
                            <p style={{ marginBottom: '1.5rem', color: '#666' }}>
                                Preencha os dados abaixo para cadastrar um novo usuário no sistema.
                            </p>

                            <form action={formAction} className={styles.form}>
                                <div className={styles.formGroup}>
                                    <label htmlFor="fullName" className={styles.label}>Nome Completo</label>
                                    <input
                                        id="fullName"
                                        name="fullName"
                                        type="text"
                                        className={styles.input}
                                        placeholder="Ex: João da Silva"
                                        required
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label htmlFor="email" className={styles.label}>Email</label>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        className={styles.input}
                                        placeholder="exemplo@email.com"
                                        required
                                    />
                                </div>

                                <div className={styles.row}>
                                    <div className={styles.formGroup} style={{ flex: 1 }}>
                                        <label htmlFor="password" className={styles.label}>Senha</label>
                                        <input
                                            id="password"
                                            name="password"
                                            type="password"
                                            className={styles.input}
                                            placeholder="******"
                                            minLength={6}
                                            required
                                        />
                                    </div>
                                    <div className={styles.formGroup} style={{ flex: 1 }}>
                                        <label htmlFor="role" className={styles.label}>Nível de Acesso</label>
                                        <select
                                            id="role"
                                            name="role"
                                            className={styles.select}
                                            required
                                            value={selectedRole}
                                            onChange={(e) => setSelectedRole(e.target.value)}
                                        >
                                            <option value="staff">Staff (Operacional)</option>
                                            <option value="admin">Administrador</option>
                                        </select>
                                    </div>
                                </div>

                                {selectedRole === 'staff' && (
                                    <>
                                        <div className={styles.sectionDivider}>⏰ Escala de Horários</div>
                                        <input type="hidden" name="workSchedule" value={JSON.stringify(workSchedule)} />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                            {workSchedule.map((day, idx) => (
                                                <div key={day.day} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', opacity: day.isActive ? 1 : 0.5, flexWrap: 'wrap' }}>
                                                    <div style={{ width: '60px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={day.isActive}
                                                                onChange={(e) => {
                                                                    const newSch = [...workSchedule]
                                                                    newSch[idx] = { ...newSch[idx], isActive: e.target.checked }
                                                                    setWorkSchedule(newSch)
                                                                }}
                                                            />
                                                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][day.day]}
                                                        </label>
                                                    </div>
                                                    <input type="time" className={styles.input} style={{ padding: '0.25rem 0.5rem', width: 'auto' }} value={day.start} onChange={e => { const newSch = [...workSchedule]; newSch[idx].start = e.target.value; setWorkSchedule(newSch) }} disabled={!day.isActive} title="Entrada" />
                                                    <span style={{ fontSize: '0.8rem', color: '#666' }}>até</span>
                                                    <input type="time" className={styles.input} style={{ padding: '0.25rem 0.5rem', width: 'auto' }} value={day.lunchStart} onChange={e => { const newSch = [...workSchedule]; newSch[idx].lunchStart = e.target.value; setWorkSchedule(newSch) }} disabled={!day.isActive} title="Saída Almoço" />
                                                    <span style={{ fontSize: '0.8rem', color: '#666' }}>-</span>
                                                    <input type="time" className={styles.input} style={{ padding: '0.25rem 0.5rem', width: 'auto' }} value={day.lunchEnd} onChange={e => { const newSch = [...workSchedule]; newSch[idx].lunchEnd = e.target.value; setWorkSchedule(newSch) }} disabled={!day.isActive} title="Volta Almoço" />
                                                    <span style={{ fontSize: '0.8rem', color: '#666' }}>até</span>
                                                    <input type="time" className={styles.input} style={{ padding: '0.25rem 0.5rem', width: 'auto' }} value={day.end} onChange={e => { const newSch = [...workSchedule]; newSch[idx].end = e.target.value; setWorkSchedule(newSch) }} disabled={!day.isActive} title="Saída" />
                                                </div>
                                            ))}
                                        </div>

                                        <div className={styles.sectionDivider}>🚪 Permissões de Acesso</div>
                                        <input type="hidden" name="permissions" value={JSON.stringify(selectedPermissions)} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                            {STAFF_MODULES.map((module) => (
                                                <label key={module.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        style={{ width: '1.1rem', height: '1.1rem' }}
                                                        checked={selectedPermissions.includes(module.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedPermissions([...selectedPermissions, module.id])
                                                            } else {
                                                                setSelectedPermissions(selectedPermissions.filter(id => id !== module.id))
                                                            }
                                                        }}
                                                    />
                                                    {module.label}
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {state.message && !state.success && (
                                    <p className={styles.errorMessage} style={{ color: 'red', marginBottom: '1rem' }}>
                                        {state.message}
                                    </p>
                                )}

                                <div className={styles.modalActions}>
                                    <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)} disabled={isPending}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className={styles.submitButton} disabled={isPending}>
                                        {isPending ? 'Criando...' : 'Criar Usuário'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Edit User Modal */}
            {
                showEditModal && selectedUser && (
                    <div className={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
                        <div className={styles.modal} onClick={e => e.stopPropagation()}>
                            <h2>Editar Usuário</h2>
                            <p style={{ marginBottom: '1.5rem', color: '#666' }}>
                                Atualize as informações do funcionário.
                            </p>

                            <form action={updateFormAction} className={styles.form}>
                                <input type="hidden" name="userId" value={selectedUser.id} />
                                <input type="hidden" name="isActive" value={selectedUser.is_active.toString()} />

                                <div className={styles.formGroup}>
                                    <label htmlFor="editFullName" className={styles.label}>Nome Completo</label>
                                    <input
                                        id="editFullName"
                                        name="fullName"
                                        type="text"
                                        className={styles.input}
                                        defaultValue={selectedUser.full_name}
                                        required
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Email (Não alterável)</label>
                                    <input
                                        type="email"
                                        className={styles.input}
                                        defaultValue={selectedUser.email}
                                        disabled
                                        style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', cursor: 'not-allowed' }}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label htmlFor="editRole" className={styles.label}>Nível de Acesso</label>
                                    <select
                                        id="editRole"
                                        name="role"
                                        className={styles.select}
                                        required
                                        value={selectedRole}
                                        onChange={(e) => setSelectedRole(e.target.value)}
                                    >
                                        <option value="staff">Staff (Operacional)</option>
                                        <option value="admin">Administrador</option>
                                    </select>
                                </div>

                                {selectedRole === 'staff' && (
                                    <>
                                        <div className={styles.sectionDivider}>⏰ Escala de Horários</div>
                                        <input type="hidden" name="workSchedule" value={JSON.stringify(workSchedule)} />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                            {workSchedule.map((day, idx) => (
                                                <div key={day.day} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', opacity: day.isActive ? 1 : 0.5, flexWrap: 'wrap' }}>
                                                    <div style={{ width: '60px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={day.isActive}
                                                                onChange={(e) => {
                                                                    const newSch = [...workSchedule]
                                                                    newSch[idx] = { ...newSch[idx], isActive: e.target.checked }
                                                                    setWorkSchedule(newSch)
                                                                }}
                                                            />
                                                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][day.day]}
                                                        </label>
                                                    </div>
                                                    <input type="time" className={styles.input} style={{ padding: '0.25rem 0.5rem', width: 'auto' }} value={day.start} onChange={e => { const newSch = [...workSchedule]; newSch[idx].start = e.target.value; setWorkSchedule(newSch) }} disabled={!day.isActive} title="Entrada" />
                                                    <span style={{ fontSize: '0.8rem', color: '#666' }}>até</span>
                                                    <input type="time" className={styles.input} style={{ padding: '0.25rem 0.5rem', width: 'auto' }} value={day.lunchStart} onChange={e => { const newSch = [...workSchedule]; newSch[idx].lunchStart = e.target.value; setWorkSchedule(newSch) }} disabled={!day.isActive} title="Saída Almoço" />
                                                    <span style={{ fontSize: '0.8rem', color: '#666' }}>-</span>
                                                    <input type="time" className={styles.input} style={{ padding: '0.25rem 0.5rem', width: 'auto' }} value={day.lunchEnd} onChange={e => { const newSch = [...workSchedule]; newSch[idx].lunchEnd = e.target.value; setWorkSchedule(newSch) }} disabled={!day.isActive} title="Volta Almoço" />
                                                    <span style={{ fontSize: '0.8rem', color: '#666' }}>até</span>
                                                    <input type="time" className={styles.input} style={{ padding: '0.25rem 0.5rem', width: 'auto' }} value={day.end} onChange={e => { const newSch = [...workSchedule]; newSch[idx].end = e.target.value; setWorkSchedule(newSch) }} disabled={!day.isActive} title="Saída" />
                                                </div>
                                            ))}
                                        </div>

                                        <div className={styles.sectionDivider}>🚪 Permissões de Acesso</div>
                                        <input type="hidden" name="permissions" value={JSON.stringify(selectedPermissions)} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                            {STAFF_MODULES.map((module) => (
                                                <label key={module.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        style={{ width: '1.1rem', height: '1.1rem' }}
                                                        checked={selectedPermissions.includes(module.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedPermissions([...selectedPermissions, module.id])
                                                            } else {
                                                                setSelectedPermissions(selectedPermissions.filter(id => id !== module.id))
                                                            }
                                                        }}
                                                    />
                                                    {module.label}
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {updateState.message && !updateState.success && (
                                    <p className={styles.errorMessage} style={{ color: 'red', marginBottom: '1rem' }}>
                                        {updateState.message}
                                    </p>
                                )}

                                <div className={styles.modalActions}>
                                    <button type="button" className={styles.cancelBtn} onClick={() => setShowEditModal(false)} disabled={isUpdatePending}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className={styles.submitButton} disabled={isUpdatePending}>
                                        {isUpdatePending ? 'Salvando...' : 'Salvar Alterações'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
