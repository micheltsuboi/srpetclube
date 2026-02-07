'use client'

import Image from 'next/image'
import Link from 'next/link'
import styles from './page.module.css'

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Background gradient orbs */}
      <div className={styles.gradientOrb1} />
      <div className={styles.gradientOrb2} />

      <div className={styles.container}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.logoContainer}>
            <Image
              src="/logo.png"
              alt="Sr. Pet Clube"
              width={180}
              height={180}
              className={styles.logoImage}
              priority
            />
          </div>

          <p className={styles.subtitle}>
            Sistema completo para gestão do seu Pet Shop
          </p>

          <p className={styles.description}>
            Creche, Hotel, Banho e Tosa - Tudo em um só lugar
          </p>
        </section>

        {/* Cards Grid */}
        <section className={styles.cardsGrid}>
          <Link href="/login" className={styles.card}>
            <div className={styles.cardIcon}>👤</div>
            <h2>Entrar</h2>
            <p>Acesse sua conta</p>
          </Link>

          <Link href="/staff" className={styles.card}>
            <div className={styles.cardIcon}>📋</div>
            <h2>Staff</h2>
            <p>Painel de atendimento</p>
          </Link>

          <Link href="/admin" className={styles.card}>
            <div className={styles.cardIcon}>⚙️</div>
            <h2>Admin</h2>
            <p>Gestão completa</p>
          </Link>

          <Link href="/tutor" className={styles.card}>
            <div className={styles.cardIcon}>📱</div>
            <h2>Portal do Tutor</h2>
            <p>Acompanhe seu pet</p>
          </Link>
        </section>

        {/* Features */}
        <section className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🛁</span>
            <span>Banho & Tosa</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🏨</span>
            <span>Hotel</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🎓</span>
            <span>Creche</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>📅</span>
            <span>Agendamentos</span>
          </div>
        </section>

        <footer className={styles.footer}>
          <p>© 2024 Sr. Pet Clube. Todos os direitos reservados.</p>
        </footer>
      </div>
    </main>
  )
}
