'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import styles from './layout.module.css'
import { createClient } from '@/lib/supabase/client'
import Notifications from '@/components/Notifications'
import PetRegistrationModal from '@/components/modules/PetRegistrationModal'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()

    const isOwner = pathname?.startsWith('/owner')
    const isMasterAdmin = pathname?.startsWith('/master-admin')

    const [user, setUser] = useState<{ name: string; role: string; org_id?: string | null; avatar_url?: string | null; permissions?: string[] } | null>(null)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [showPetModal, setShowPetModal] = useState(false)
    const supabase = createClient()
    const router = useRouter()

    const staffNavigation = [
        { name: 'Dashboard', href: '/staff', icon: '📊' },
        { name: 'Agenda', href: '/owner/agenda', icon: '📅' },
        { name: 'Banho e Tosa', href: '/owner/banho-tosa', icon: '🛁' },
        { name: 'Creche', href: '/owner/creche', icon: '🐾' },
        { name: 'Hospedagem', href: '/owner/hospedagem', icon: '🏨' },
        { name: 'Tutores', href: '/owner/tutors', icon: '👤' },
        { name: 'Pets', href: '/owner/pets', icon: '🐾' },
        { name: 'Vacinas', href: '/owner/vacinas-pets', icon: '💉' },
        { name: 'Serviços', href: '/owner/services', icon: '✂️' },
        { name: 'Pacotes', href: '/owner/packages', icon: '📦' },
        { name: 'Petshop', href: '/owner/petshop', icon: '🛍️' },
        { name: 'Questionário', href: '/owner/assessment', icon: '📋' },
    ]

    const ownerNavigation = [
        { name: 'Dashboard', href: '/owner', icon: '📊' },
        { name: 'Agenda', href: '/owner/agenda', icon: '📅' },
        { name: 'Banho e Tosa', href: '/owner/banho-tosa', icon: '🛁' },
        { name: 'Creche', href: '/owner/creche', icon: '🐾' },
        { name: 'Hospedagem', href: '/owner/hospedagem', icon: '🏨' },
        { name: 'Financeiro', href: '/owner/financeiro', icon: '💰' },
        { name: 'Tutores', href: '/owner/tutors', icon: '👤' },
        { name: 'Pets', href: '/owner/pets', icon: '🐶' },
        { name: 'Vacinas', href: '/owner/vacinas-pets', icon: '💉' },
        { name: 'Serviços', href: '/owner/services', icon: '✂️' },
        { name: 'Pacotes', href: '/owner/packages', icon: '📦' },
        { name: 'Petshop', href: '/owner/petshop', icon: '🛍️' },
        { name: 'Questionário', href: '/owner/assessment', icon: '📋' },
        { name: 'Usuários', href: '/owner/usuarios', icon: '👥' },
        { name: 'Ponto', href: '/owner/ponto', icon: '⏰' },
    ]

    const masterAdminNavigation = [
        { name: 'Dashboard', href: '/master-admin', icon: '⚡' },
        { name: 'Tenants', href: '/master-admin/tenants', icon: '🏢' },
        { name: 'Painel Loja', href: '/owner', icon: '🏪' },
    ]

    const tutorNavigation = [
        { name: 'Início', href: '/tutor', icon: '🏠' },
        { name: 'Histórico', href: '/tutor/history', icon: '📜' },
        { name: 'Agendar', href: '/tutor/booking', icon: '📅' },
        { name: 'Galeria', href: '/tutor/gallery', icon: '🖼️' },
        { name: 'Avaliações de Saúde', href: '/tutor/avaliacoes', icon: '📋' },
        { name: 'Cadastrar Pet', href: '#', icon: '🐶', action: 'cadastrar-pet' },
        { name: 'Perfil', href: '/tutor/profile', icon: '👤' },
    ]

    useEffect(() => {
        let isMounted = true
        const getUser = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user || !isMounted) return

                // Fetch profile
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name, role, org_id, avatar_url, is_active, permissions')
                    .eq('id', user.id)
                    .maybeSingle()

                if (!isMounted) return

                if (profile) {
                    if (profile.is_active === false) {
                        await supabase.auth.signOut()
                        setTimeout(() => {
                            router.push('/?error=Conta%20desativada')
                        }, 100)
                        return
                    }

                    const roleRaw = (profile.role || '').toLowerCase()
                    const mappedRole = (roleRaw === 'superadmin' || roleRaw === 'master_admin') ? 'Super Admin' :
                        (roleRaw === 'admin' || roleRaw === 'owner') ? 'Administrador' :
                        roleRaw === 'staff' ? 'Staff' :
                        roleRaw === 'customer' ? 'Tutor' : 'Administrador'

                    setUser({
                        name: profile.full_name || user.email?.split('@')[0] || 'Usuário',
                        role: mappedRole,
                        org_id: profile.org_id,
                        avatar_url: profile.avatar_url,
                        permissions: profile.permissions || []
                    })
                }
            } catch (err) {
                console.error('Erro ao buscar perfil no layout:', err)
            }
        }
        getUser()
        return () => { isMounted = false }
    }, [pathname])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/')
    }

    // Determine target navigation based on role AND current path to prevent confusion
    const isTutorRoute = pathname?.startsWith('/tutor')
    const isStaffRoute = pathname?.startsWith('/staff')
    const isSaaSMaster = user?.role === 'Super Admin' && !user?.org_id

    let navigation: any[] = []

    if (isTutorRoute) {
        navigation = [...tutorNavigation]
    } else if (isMasterAdmin) {
        navigation = isSaaSMaster ? [...masterAdminNavigation] : [...ownerNavigation]
    } else if (isStaffRoute || user?.role === 'Staff') {
        navigation = [...staffNavigation]
    } else {
        // Fallback e rota /owner (painel do admin): exibe todos os menus de administração
        navigation = [...ownerNavigation]
    }

    // Apenas se o usuário logado for comprovadamente Staff, aplicar restrições granulares de permissão
    if (user?.role === 'Staff') {
        const perms = user?.permissions || []
        navigation = navigation.filter((item: any) => {
            if (item.name === 'Dashboard') return true
            if (item.name === 'Agenda') return perms.includes('agenda')
            if (item.name === 'Banho e Tosa') return perms.includes('banho_tosa')
            if (item.name === 'Creche') return perms.includes('creche')
            if (item.name === 'Hospedagem') return perms.includes('hospedagem')
            if (item.name === 'Tutores') return perms.includes('tutores')
            if (item.name === 'Pets') return perms.includes('pets')
            if (item.name === 'Vacinas') return perms.includes('pets')
            if (item.name === 'Petshop') return perms.includes('petshop')
            if (item.name === 'Serviços') return perms.includes('servicos')
            if (item.name === 'Pacotes') return perms.includes('pacotes')
            if (item.name === 'Questionário') return perms.includes('pets') // Tie access to pets permission
            if (item.name === 'Ponto') return perms.includes('ponto')
            return false // Hide everything else (such as Usuários, Financeiro)
        })
    }

    return (
        <div className={styles.container}>
            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className={styles.overlay}
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.sidebarOpen : ''}`}>
                <div className={styles.logo}>
                    <Image
                        src="/logo.png"
                        alt="Sr. Pet Clube"
                        width={48}
                        height={48}
                        className={styles.logoImage}
                    />
                    <span className={styles.logoText}>Sr. Pet</span>
                    <button
                        className={styles.closeMenu}
                        onClick={() => setIsSidebarOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                <nav className={styles.nav}>
                    {navigation.map((item: any) => {
                        if (item.action === 'cadastrar-pet') {
                            return (
                                <button
                                    key={item.href}
                                    className={`${styles.navItem}`}
                                    onClick={() => {
                                        setIsSidebarOpen(false)
                                        setShowPetModal(true)
                                    }}
                                    style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                    <span className={styles.navIcon}>{item.icon}</span>
                                    <span className={styles.navLabel}>{item.name}</span>
                                </button>
                            )
                        }

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${styles.navItem} ${pathname === item.href ? styles.active : ''}`}
                                onClick={() => setIsSidebarOpen(false)}
                            >
                                <span className={styles.navIcon}>{item.icon}</span>
                                <span className={styles.navLabel}>{item.name}</span>
                            </Link>
                        )
                    })}
                </nav>

                <div className={styles.sidebarFooter}>
                    <button className={styles.clockButton} onClick={handleSignOut}>
                        <span>🚪</span>
                        <span>Sair</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={styles.main}>
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.headerTop}>
                            <button
                                className={styles.menuButton}
                                onClick={() => setIsSidebarOpen(true)}
                            >
                                ☰
                            </button>
                            <h1 className={styles.pageTitle}>Dashboard</h1>
                        </div>
                        <span className={styles.date}>
                            {new Date().toLocaleDateString('pt-BR', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long'
                            })}
                        </span>
                    </div>


                    <div className={styles.headerRight} style={{ display: 'flex', alignItems: 'center' }}>
                        {!isTutorRoute && <Notifications />}

                        <Link href={isTutorRoute ? "/tutor/profile" : "/owner/profile"} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}>
                            <div className={styles.userInfo}>
                                <span className={styles.userName}>{user?.name || 'Carregando...'}</span>
                                <span className={styles.userRole}>{user?.role || '...'}</span>
                            </div>
                            <div className={styles.avatar}>
                                {user?.avatar_url ? (
                                    <Image src={user.avatar_url} alt={user.name} width={44} height={44} className={styles.avatarImage} />
                                ) : (
                                    user?.name?.charAt(0).toUpperCase() || '?'
                                )}
                            </div>
                        </Link>
                    </div>
                </header>

                <div className={styles.content}>
                    {children}
                </div>
            </main>

            {showPetModal && (
                <PetRegistrationModal
                    onClose={() => setShowPetModal(false)}
                    onSuccess={() => {
                        setShowPetModal(false)
                        // Trigger a page reload or event to refresh tutor page data if needed
                        window.location.reload()
                    }}
                />
            )}
        </div >
    )
}
