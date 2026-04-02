'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { deleteAppointment } from '@/app/actions/appointment'
import { fixServiceCategories, listServicesWithCategories, fixPackageUsageIndices } from '@/app/actions/fix_data'
import { searchPets } from '@/app/actions/pet'

export default function DebugPage() {
    const [assessments, setAssessments] = useState<any[]>([])
    const [hospedagemAppts, setHospedagemAppts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [servicesDebug, setServicesDebug] = useState<any[]>([])
    const [categoriesDebug, setCategoriesDebug] = useState<any[]>([])
    const [debugSearchTerm, setDebugSearchTerm] = useState('')
    const [debugSearchResults, setDebugSearchResults] = useState<any>(null)
    const [isDebugSearching, setIsDebugSearching] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        async function fetchDebugData() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile?.org_id) return

            // Fetch all assessments
            const { data: assessmentData } = await supabase
                .from('pet_assessments')
                .select('*, pets(name)')
                .eq('org_id', profile.org_id)

            setAssessments(assessmentData || [])

            // Fetch all Hospedagem appointments
            const { data: hospData } = await supabase
                .from('appointments')
                .select(`
                    id, scheduled_at, check_in_date, check_out_date, status,
                    package_credit_id, package_usage_index,
                    pets(name),
                    services(name, service_categories(name))
                `)
                .eq('org_id', profile.org_id)

            setHospedagemAppts(hospData?.filter((a: any) =>
                a.services?.service_categories?.name === 'Hospedagem' || a.services?.service_categories?.name === 'Creche'
            ) || [])

            // Load services debug info
            const result = await listServicesWithCategories()
            setServicesDebug(result.services)
            setCategoriesDebug(result.categories)

            setLoading(false)
        }
        fetchDebugData()
    }, [supabase])

    if (loading) return <div style={{ padding: '2rem' }}>Carregando...</div>

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <h1>🔍 Debug Page</h1>

            <section style={{ marginTop: '2rem', padding: '1rem', background: '#dbeafe', borderRadius: '8px' }}>
                <h2>🛠️ Tools</h2>
                <button
                    onClick={async () => {
                        if (confirm('Isso vai atualizar a categoria de todos os serviços com nome "Hospedagem" ou "Hotel". Continuar?')) {
                            const res = await fixServiceCategories()
                            alert(res.message)
                            window.location.reload()
                        }
                    }}
                    style={{ background: 'blue', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                >
                    Corrigir Categorias de Hospedagem
                </button>

                <button
                    onClick={async () => {
                        if (confirm('Isso vai re-calcular a ordem das sessões (1/4, 2/4...) de todos os agendamentos vinculados a pacotes. Continuar?')) {
                            const res = await fixPackageUsageIndices()
                            alert(res.message)
                        }
                    }}
                    style={{ background: '#7c3aed', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer', marginLeft: '1rem' }}
                >
                    🔄 Sincronizar Índices de Pacote
                </button>

                <div style={{ marginTop: '2rem', padding: '1rem', background: 'white', borderRadius: '4px' }}>
                    <h3>Teste de Busca de Pets (Server Action)</h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input 
                            type="text" 
                            value={debugSearchTerm}
                            onChange={(e) => setDebugSearchTerm(e.target.value)}
                            placeholder="Nome do pet ou tutor..."
                            style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                        />
                        <button 
                            onClick={async () => {
                                setIsDebugSearching(true)
                                try {
                                    const res = await searchPets(debugSearchTerm)
                                    setDebugSearchResults(res)
                                } catch (err: any) {
                                    setDebugSearchResults({ error: err.message })
                                } finally {
                                    setIsDebugSearching(false)
                                }
                            }}
                            disabled={isDebugSearching}
                            style={{ background: '#059669', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                        >
                            {isDebugSearching ? 'Buscando...' : 'Testar Busca'}
                        </button>
                    </div>
                    {debugSearchResults && (
                        <pre style={{ marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '4px', overflow: 'auto', maxHeight: '300px', fontSize: '0.8rem' }}>
                            {JSON.stringify(debugSearchResults, null, 2)}
                        </pre>
                    )}
                </div>
            </section>

            {/* Services & Categories Debug */}
            <section style={{ marginTop: '2rem', padding: '1rem', background: '#ecfdf5', borderRadius: '8px' }}>
                <h2>📋 Categorias ({categoriesDebug.length})</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #ccc' }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Nome</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categoriesDebug.map(c => (
                            <tr key={c.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '0.5rem' }}>{c.icon} {c.name}</td>
                                <td style={{ padding: '0.5rem', fontSize: '0.7rem', fontFamily: 'monospace' }}>{c.id}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <h2 style={{ marginTop: '1.5rem' }}>🔧 Serviços ({servicesDebug.length})</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #ccc' }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Serviço</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Preço Base</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Categoria</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Category ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {servicesDebug.map((s: any) => (
                            <tr key={s.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '0.5rem' }}>{s.name}</td>
                                <td style={{ padding: '0.5rem' }}>R$ {s.base_price?.toFixed(2) || '0.00'}</td>
                                <td style={{ padding: '0.5rem', fontWeight: 700, color: s.service_categories?.name === 'Hospedagem' ? '#F97316' : s.service_categories?.name === 'Banho e Tosa' ? '#3B82F6' : '#10B981' }}>
                                    {s.service_categories?.name || '⚠️ SEM CATEGORIA'}
                                </td>
                                <td style={{ padding: '0.5rem', fontSize: '0.7rem', fontFamily: 'monospace' }}>{s.category_id || 'NULL'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section style={{ marginTop: '2rem', padding: '1rem', background: '#f3f4f6', borderRadius: '8px' }}>
                <h2>Pet Assessments ({assessments.length})</h2>
                {assessments.length === 0 ? (
                    <p>Nenhuma avaliação encontrada</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #ccc' }}>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Pet</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Pet ID</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Criado em</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Sociável</th>
                            </tr>
                        </thead>
                        <tbody>
                            {assessments.map(a => (
                                <tr key={a.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '0.5rem' }}>{a.pets?.name || 'N/A'}</td>
                                    <td style={{ padding: '0.5rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>{a.pet_id}</td>
                                    <td style={{ padding: '0.5rem' }}>{new Date(a.created_at).toLocaleString('pt-BR')}</td>
                                    <td style={{ padding: '0.5rem' }}>{a.sociable_with_dogs ? '✅' : '❌'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <section style={{ marginTop: '2rem', padding: '1rem', background: '#fef3c7', borderRadius: '8px' }}>
                <h2>Creche & Hospedagem Appointments ({hospedagemAppts.length})</h2>
                {hospedagemAppts.length === 0 ? (
                    <p>Nenhum agendamento de hospedagem encontrado</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #ccc' }}>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Pet</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Service</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Scheduled</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Check-in</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Check-out</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Status</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Pacote?</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>ID Crédito</th>
                            </tr>
                        </thead>
                        <tbody>
                            {hospedagemAppts.map(a => (
                                <tr key={a.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '0.5rem' }}>{a.pets?.name || 'N/A'}</td>
                                    <td style={{ padding: '0.5rem' }}>{a.services?.name || 'N/A'}</td>
                                    <td style={{ padding: '0.5rem' }}>{new Date(a.scheduled_at).toLocaleDateString('pt-BR')}</td>
                                    <td style={{ padding: '0.5rem' }}>{a.check_in_date || '-'}</td>
                                    <td style={{ padding: '0.5rem' }}>{a.check_out_date || '-'}</td>
                                    <td style={{ padding: '0.5rem' }}>{a.status}</td>
                                    <td style={{ padding: '0.5rem' }}>
                                        {a.package_credit_id ? `✅ (${a.package_usage_index || '?'})` : '❌'}
                                    </td>
                                    <td style={{ padding: '0.5rem', fontSize: '0.6rem' }}>{a.package_credit_id || '-'}</td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <button
                                            onClick={async () => {
                                                if (confirm('Deletar agendamento?')) {
                                                    try {
                                                        await deleteAppointment(a.id)
                                                        alert('Agendamento deletado!')
                                                        window.location.reload()
                                                    } catch (err: any) {
                                                        console.error(err)
                                                        alert('Erro ao deletar: ' + (err.message || err))
                                                    }
                                                }
                                            }}
                                            style={{ background: 'red', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer' }}
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '4px' }}>
                    <strong>Hoje:</strong> {new Date().toISOString().split('T')[0]}
                </div>
            </section>
        </div >
    )
}
