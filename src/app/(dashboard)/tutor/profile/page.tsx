'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './page.module.css'
import { updateOwnTutorProfile } from '@/app/actions/tutor'
import ImageUpload from '@/components/ImageUpload'

interface Profile {
    id: string
    email: string
    full_name: string | null
    phone: string | null
    avatar_url: string | null
    role: string
}

export default function TutorProfilePage() {
    const supabase = createClient()
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [formData, setFormData] = useState({
        full_name: '',
        phone: '',
        avatar_url: '' as string | null,
        address: '',
        neighborhood: '',
        city: 'São Paulo',
        instagram: '',
        birth_date: ''
    })
    const [passwordData, setPasswordData] = useState({
        new: '',
        confirm: '',
        loading: false
    })

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single()

                if (error) throw error

                if (data) {
                    setProfile(data)

                    const { data: customerData } = await supabase
                        .from('customers')
                        .select('address, neighborhood, city, instagram, birth_date')
                        .eq('user_id', user.id)
                        .single()

                    setFormData({
                        full_name: data.full_name || '',
                        phone: data.phone || '',
                        avatar_url: data.avatar_url || null,
                        address: customerData?.address || '',
                        neighborhood: customerData?.neighborhood || '',
                        city: customerData?.city || 'São Paulo',
                        instagram: customerData?.instagram || '',
                        birth_date: customerData?.birth_date || ''
                    })
                }
            } catch (error) {
                console.error('Error fetching profile:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchProfile()
    }, [supabase])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!profile) return

        try {
            setSaving(true)

            const submitData = new FormData()
            submitData.append('full_name', formData.full_name)
            submitData.append('phone', formData.phone)
            submitData.append('address', formData.address)
            submitData.append('neighborhood', formData.neighborhood)
            submitData.append('city', formData.city)
            submitData.append('instagram', formData.instagram)
            submitData.append('birth_date', formData.birth_date)
            if (formData.avatar_url) submitData.append('avatar_url', formData.avatar_url)

            const res = await updateOwnTutorProfile({ message: '', success: false }, submitData)

            if (res.success) {
                alert('Perfil atualizado com sucesso!')
            } else {
                alert(res.message)
            }
        } catch (error) {
            console.error('Error updating profile:', error)
            alert('Erro ao atualizar perfil.')
        } finally {
            setSaving(false)
        }
    }

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (passwordData.new !== passwordData.confirm) {
            alert('As senhas não conferem.')
            return
        }
        if (passwordData.new.length < 6) {
            alert('A senha deve ter no mínimo 6 caracteres.')
            return
        }

        try {
            setPasswordData(prev => ({ ...prev, loading: true }))
            const { error } = await supabase.auth.updateUser({
                password: passwordData.new
            })

            if (error) throw error

            alert('Senha atualizada com sucesso!')
            setPasswordData({ new: '', confirm: '', loading: false })
        } catch (error) {
            console.error('Error updating password:', error)
            alert('Erro ao atualizar senha.')
            setPasswordData(prev => ({ ...prev, loading: false }))
        }
    }

    if (loading) {
        return (
            <div className={styles.container}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '4rem' }}>
                    <div style={{ width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-coral)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <p style={{ color: 'var(--text-secondary)' }}>Carregando seu perfil...</p>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <header style={{ marginBottom: '2rem' }}>
                <h1 className={styles.title}>Meu Perfil</h1>
                <p className={styles.subtitle}>Gerencie suas informações e segurança da conta</p>
            </header>

            <div className={styles.card}>
                <form onSubmit={handleSave} className={styles.form}>
                    <div className={styles.avatarSection}>
                        <ImageUpload
                            bucket="avatars"
                            url={formData.avatar_url}
                            onUpload={(url) => setFormData(prev => ({ ...prev, avatar_url: url }))}
                            onRemove={() => setFormData(prev => ({ ...prev, avatar_url: null }))}
                            label="Foto de Perfil"
                            circle={true}
                        />
                    </div>

                    <h3 className={styles.sectionTitle}>👤 Informações Pessoais</h3>

                    <div className={styles.formGroup}>
                        <label>Nome Completo</label>
                        <input
                            type="text"
                            placeholder="Seu nome completo"
                            value={formData.full_name}
                            onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                            className={styles.input}
                            required
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Telefone</label>
                        <input
                            type="text"
                            placeholder="(00) 00000-0000"
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Data de Nascimento (Opcional)</label>
                        <input
                            type="date"
                            value={formData.birth_date}
                            onChange={e => setFormData({ ...formData, birth_date: e.target.value })}
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Email</label>
                        <input
                            type="text"
                            value={profile?.email}
                            disabled
                            className={`${styles.input} ${styles.disabled}`}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Endereço</label>
                        <input
                            type="text"
                            placeholder="Sua rua, número"
                            value={formData.address}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Bairro</label>
                        <input
                            type="text"
                            placeholder="Seu bairro"
                            value={formData.neighborhood}
                            onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Cidade</label>
                        <input
                            type="text"
                            value={formData.city}
                            onChange={e => setFormData({ ...formData, city: e.target.value })}
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label>Instagram</label>
                        <input
                            type="text"
                            placeholder="@seuusuario"
                            value={formData.instagram}
                            onChange={e => setFormData({ ...formData, instagram: e.target.value })}
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.buttonGroup}>
                        <button type="submit" className={styles.saveButton} disabled={saving}>
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>

                <div className={styles.passwordSection}>
                    <h3 className={styles.sectionTitle}>🔐 Segurança</h3>
                    <form onSubmit={handleUpdatePassword} className={styles.form}>
                        <div className={styles.formGroup}>
                            <label>Nova Senha</label>
                            <input
                                type="password"
                                value={passwordData.new}
                                onChange={e => setPasswordData({ ...passwordData, new: e.target.value })}
                                className={styles.input}
                                placeholder="Pelo menos 6 caracteres"
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Confirmar Nova Senha</label>
                            <input
                                type="password"
                                value={passwordData.confirm}
                                onChange={e => setPasswordData({ ...passwordData, confirm: e.target.value })}
                                className={styles.input}
                                placeholder="Confirme sua nova senha"
                            />
                        </div>
                        <div className={styles.buttonGroup}>
                            <button type="submit" className={styles.saveButton} disabled={passwordData.loading || !passwordData.new}>
                                {passwordData.loading ? 'Atualizando...' : 'Atualizar Senha'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
