'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import styles from './layout.module.css'
import { createClient } from '@/lib/supabase/client'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()

    const isOwner = pathname?.startsWith('/owner')
    const isMasterAdmin = pathname?.startsWith('/master-admin')

    const staffNavigation = [
        { name: 'Pets do Dia', href: '/staff', icon: '🐾' },
        { name: 'Agendamentos', href: '/staff/appointments', icon: '📅' },
        { name: 'Clientes', href: '/staff/customers', icon: '👥' },
        { name: 'Ponto', href: '/staff/timesheet', icon: '⏰' },
    ]

    const ownerNavigation = [
        { name: 'Dashboard', href: '/owner', icon: '📊' },
        { name: 'Agenda', href: '/owner/agenda', icon: '📅' },
        { name: 'Tutores', href: '/owner/tutors', icon: '👤' },
        { name: 'Pets', href: '/owner/pets', icon: '🐾' },
        { name: 'Usuários', href: '/owner/usuarios', icon: '👥' },
        { name: 'Financeiro', href: '/owner/financeiro', icon: '💰' },
        { name: 'Petshop', href: '/owner/petshop', icon: '🛍️' },
        { name: 'Vacinas', href: '/owner/vaccines', icon: '💉' },
    ]

    const masterAdminNavigation = [
        { name: 'Dashboard', href: '/master-admin', icon: '⚡' },
        { name: 'Tenants', href: '/master-admin/tenants', icon: '🏢' },
    ]



    const [user, setUser] = useState<{ name: string; role: string } | null>(null)
    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                // Fetch profile
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name, role')
                    .eq('id', user.id)
                    .single()

                if (profile) {
                    setUser({
                        name: profile.full_name || user.email?.split('@')[0] || 'Usuário',
                        role: profile.role === 'superadmin' ? 'Super Admin' :
                            profile.role === 'admin' ? 'Administrador' :
                                profile.role === 'staff' ? 'Staff' : 'Usuário'
                    })
                }
            }
        }
        getUser()
    }, [supabase])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div className={styles.container}>
            {/* Sidebar */}
            <aside className={styles.sidebar}>
                <div className={styles.logo}>
                    <Image
                        src="/logo.png"
                        alt="Sr. Pet Clube"
                        width={48}
                        height={48}
                        className={styles.logoImage}
                    />
                    <span className={styles.logoText}>Sr. Pet</span>
                </div>

                <nav className={styles.nav}>
                    {(isMasterAdmin ? masterAdminNavigation : (isOwner ? ownerNavigation : staffNavigation)).map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.navItem} ${pathname === item.href ? styles.active : ''}`}
                        >
                            <span className={styles.navIcon}>{item.icon}</span>
                            <span className={styles.navLabel}>{item.name}</span>
                        </Link>
                    ))}
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
                        <h1 className={styles.pageTitle}>Dashboard</h1>
                        <span className={styles.date}>
                            {new Date().toLocaleDateString('pt-BR', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long'
                            })}
                        </span>
                    </div>
                    <div className={styles.headerRight}>
                        <div className={styles.userInfo}>
                            <span className={styles.userName}>{user?.name || 'Carregando...'}</span>
                            <span className={styles.userRole}>{user?.role || '...'}</span>
                        </div>
                        <div className={styles.avatar}>
                            {user?.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                    </div>
                </header>

                <div className={styles.content}>
                    {children}
                </div>
            </main>
        </div>
    )
}
