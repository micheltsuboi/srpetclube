'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './layout.module.css'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()

    const navigation = [
        { name: 'Pets do Dia', href: '/staff', icon: '🐾' },
        { name: 'Agendamentos', href: '/staff/appointments', icon: '📅' },
        { name: 'Clientes', href: '/staff/customers', icon: '👥' },
        { name: 'Ponto', href: '/staff/timesheet', icon: '⏰' },
    ]

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
                    {navigation.map((item) => (
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
                    <button className={styles.clockButton}>
                        <span>⏰</span>
                        <span>Bater Ponto</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={styles.main}>
                {/* Header */}
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
                            <span className={styles.userName}>Tainara</span>
                            <span className={styles.userRole}>Staff</span>
                        </div>
                        <div className={styles.avatar}>T</div>
                    </div>
                </header>

                {/* Content */}
                <div className={styles.content}>
                    {children}
                </div>
            </main>
        </div>
    )
}
