'use client'

import { useState } from 'react'
import { registerClient } from '@/app/actions/auth'
import styles from '@/app/page.module.css'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegisterForm() {
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState('')
    const [isSuccess, setIsSuccess] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)
        setMsg('')

        const formData = new FormData(e.currentTarget)
        const res = await registerClient({ message: '', success: false }, formData) // server action

        if (res.success) {
            setIsSuccess(true)
            setMsg('Cadastro realizado com sucesso! Redirecionando para login...')
            router.push('/')
        } else {
            setMsg(res.message)
        }
        setLoading(false)
    }

    if (isSuccess) {
        return (
            <div className={styles.successCard}>
                <h3>{msg}</h3>
                <Link href="/" className={styles.button}>Ir para Login</Link>
            </div>
        )
    }

    return (
        <div className={styles.registerCard}>
            <h2 className={styles.cardTitle}>Cadastre-se</h2>
            <p className={styles.cardSubtitle}>Crie sua conta para acessar o portal do tutor.</p>

            <form onSubmit={handleSubmit} className={styles.formStack}>
                <div className={styles.field}>
                    <label>Nome Completo</label>
                    <input name="name" type="text" required placeholder="Seu nome" className={styles.input} />
                </div>

                <div className={styles.field}>
                    <label>Email</label>
                    <input name="email" type="email" required placeholder="seu@email.com" className={styles.input} />
                </div>

                <div className={styles.field}>
                    <label>Telefone / WhatsApp</label>
                    <input name="phone" type="tel" required placeholder="(11) 99999-9999" className={styles.input} />
                </div>

                <div className={styles.field}>
                    <label>Data de Nascimento (Opcional)</label>
                    <input name="birthDate" type="date" className={styles.input} />
                </div>

                <div className={styles.field}>
                    <label>Endereço</label>
                    <input name="address" type="text" placeholder="Sua rua, número" className={styles.input} />
                </div>

                <div className={styles.field}>
                    <label>Bairro</label>
                    <input name="neighborhood" type="text" placeholder="Seu bairro" className={styles.input} />
                </div>

                <div className={styles.field}>
                    <label>Cidade</label>
                    <input name="city" type="text" defaultValue="São Paulo" className={styles.input} />
                </div>

                <div className={styles.field}>
                    <label>Instagram</label>
                    <input name="instagram" type="text" placeholder="@seuusuario" className={styles.input} />
                </div>

                <div className={styles.field}>
                    <label>Senha</label>
                    <input name="password" type="password" required placeholder="Crie uma senha" className={styles.input} minLength={6} />
                </div>

                {msg && <p className={styles.errorMsg}>{msg}</p>}

                <button type="submit" className={styles.primaryButton} disabled={loading}>
                    {loading ? 'Criando conta...' : 'Cadastrar'}
                </button>
            </form>

            <div className={styles.loginDivider}>
                <span>Já possui conta?</span>
                <Link href="/" className={styles.textLink}>Login do Tutor</Link>
                <span className={styles.sep}>•</span>
                <Link href="/" className={styles.textLink}>Login do Pet Shop</Link>
                <span className={styles.sep}>•</span>
                <Link href="/" className={styles.textLink}>Sou Staff</Link>
            </div>
        </div>
    )
}
