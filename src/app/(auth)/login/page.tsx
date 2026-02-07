'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        // TODO: Implementar autenticação real com Supabase
        // Por enquanto, simular login
        setTimeout(() => {
            if (email && password) {
                router.push('/staff')
            } else {
                setError('Por favor, preencha todos os campos')
            }
            setLoading(false)
        }, 1000)
    }

    return (
        <main className={styles.main}>
            {/* Background gradient orbs */}
            <div className={styles.gradientOrb1} />
            <div className={styles.gradientOrb2} />

            <div className={styles.container}>
                <div className={styles.card}>
                    {/* Logo */}
                    <div className={styles.logo}>
                        <Image
                            src="/logo.png"
                            alt="Sr. Pet Clube"
                            width={100}
                            height={100}
                            className={styles.logoImage}
                        />
                    </div>

                    <p className={styles.subtitle}>Entre na sua conta</p>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className={styles.form}>
                        {error && (
                            <div className={styles.error}>
                                {error}
                            </div>
                        )}

                        <div className={styles.field}>
                            <label htmlFor="email" className={styles.label}>Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="seu@email.com"
                                className={styles.input}
                                autoComplete="email"
                            />
                        </div>

                        <div className={styles.field}>
                            <label htmlFor="password" className={styles.label}>Senha</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className={styles.input}
                                autoComplete="current-password"
                            />
                        </div>

                        <button
                            type="submit"
                            className={styles.button}
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className={styles.spinner} />
                                    Entrando...
                                </>
                            ) : (
                                'Entrar'
                            )}
                        </button>
                    </form>

                    <div className={styles.divider}>
                        <span>ou</span>
                    </div>

                    {/* Quick Access for Demo */}
                    <div className={styles.quickAccess}>
                        <p className={styles.quickAccessTitle}>Acesso rápido (Demo)</p>
                        <div className={styles.quickAccessButtons}>
                            <Link href="/staff" className={styles.quickBtn}>
                                📋 Staff
                            </Link>
                            <Link href="/admin" className={styles.quickBtn}>
                                ⚙️ Admin
                            </Link>
                        </div>
                    </div>

                    <Link href="/" className={styles.backLink}>
                        ← Voltar ao início
                    </Link>
                </div>
            </div>
        </main>
    )
}
