'use client'

import { useState, useEffect, useRef } from 'react'
import { getNotifications, markAsRead, syncNotifications, markAllAsRead } from '@/app/actions/notification'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './Notifications.module.css'
import { Bell, RefreshCw, Check, Info, CheckCheck } from 'lucide-react'

export default function Notifications() {
    const [notifications, setNotifications] = useState<any[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<'all' | 'unread'>('unread')
    const dropdownRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    const fetchNotifications = async () => {
        setLoading(true)
        try {
            const data = await getNotifications()
            setNotifications(data)
            setUnreadCount(data.filter((n: any) => !n.read).length)
        } catch (error) {
            console.error('Failed to fetch notifications', error)
        } finally {
            setLoading(false)
        }
    }

    const hasSynced = useRef(false)

    useEffect(() => {
        const init = async () => {
            if (hasSynced.current) return
            hasSynced.current = true
            await syncNotifications()
            await fetchNotifications()
        }
        init()
    }, [])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [dropdownRef])

    const handleMarkAsRead = async (id: string, link?: string) => {
        setLoading(true)
        await markAsRead(id)
        await fetchNotifications()
        setLoading(false)
        if (link) {
            setIsOpen(false)
            router.push(link)
        }
    }

    const handleMarkAllAsRead = async () => {
        setLoading(true)
        const res = await markAllAsRead()
        if (res.success) {
            await fetchNotifications()
        }
        setLoading(false)
    }

    const toggleOpen = () => setIsOpen(!isOpen)

    const filteredNotifications = activeTab === 'all'
        ? notifications
        : notifications.filter(n => !n.read)

    return (
        <div className={styles.container} ref={dropdownRef}>
            <button className={styles.bellButton} onClick={toggleOpen} aria-label="Notificações">
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className={styles.badge}>{unreadCount}</span>
                )}
            </button>

            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.header}>
                        <div className={styles.headerTitle}>
                            <h3>Notificações</h3>
                            {unreadCount > 0 && <span className={styles.unreadCountBadge}>{unreadCount} novas</span>}
                        </div>
                        <div className={styles.headerActions}>
                            <button className={styles.refreshBtn} onClick={fetchNotifications} title="Atualizar" disabled={loading}>
                                <RefreshCw size={16} className={loading ? styles.spinning : ''} />
                            </button>
                        </div>
                    </div>

                    <div className={styles.tabs}>
                        <button
                            className={`${styles.tab} ${activeTab === 'unread' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('unread')}
                        >
                            Não lidas
                        </button>
                        <button
                            className={`${styles.tab} ${activeTab === 'all' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('all')}
                        >
                            Todas
                        </button>
                        {unreadCount > 0 && (
                            <button className={styles.markAllBtn} onClick={handleMarkAllAsRead} disabled={loading}>
                                <CheckCheck size={14} />
                                Ler todas
                            </button>
                        )}
                    </div>

                    <div className={styles.list}>
                        {filteredNotifications.length === 0 ? (
                            <div className={styles.empty}>
                                <Bell size={40} className={styles.emptyIcon} />
                                <p>Nenhuma notificação {activeTab === 'unread' ? 'não lida' : ''}</p>
                            </div>
                        ) : (
                            filteredNotifications.map(notif => (
                                <div key={notif.id} className={`${styles.item} ${notif.read ? styles.read : styles.unread}`}>
                                    <div className={styles.itemHeader}>
                                        <span className={styles.title}>{notif.title}</span>
                                        <span className={styles.date}>
                                            {new Date(notif.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className={styles.message}>{notif.message}</p>
                                    <div className={styles.actions}>
                                        {notif.type === 'package_expiry' && notif.reference_id && (
                                            <button
                                                className={styles.linkBtn}
                                                style={{ background: '#10B981', color: 'white', borderColor: '#10B981' }}
                                                disabled={loading}
                                                onClick={async () => {
                                                    setLoading(true)
                                                    const { renewCustomerPackage } = await import('@/app/actions/package')
                                                    const res = await renewCustomerPackage(notif.reference_id)
                                                    if (res.success) {
                                                        await handleMarkAsRead(notif.id)
                                                        alert('Pacote renovado com sucesso! Os agendamentos automáticos foram gerados.')
                                                    } else {
                                                        alert(res.message || 'Erro ao renovar pacote.')
                                                    }
                                                    setLoading(false)
                                                }}
                                            >
                                                Renovar
                                            </button>
                                        )}
                                        {notif.link && (
                                            <button
                                                className={styles.linkBtn}
                                                onClick={() => handleMarkAsRead(notif.id, notif.link)}
                                            >
                                                Ver
                                            </button>
                                        )}
                                        {!notif.read && (
                                            <button
                                                className={styles.markBtn}
                                                onClick={() => handleMarkAsRead(notif.id)}
                                                disabled={loading}
                                                title="Marcar como lida"
                                            >
                                                <Check size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
