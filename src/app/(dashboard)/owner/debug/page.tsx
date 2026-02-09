'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DebugPage() {
    const [assessments, setAssessments] = useState<any[]>([])
    const [hospedagemAppts, setHospedagemAppts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
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
                    pets(name),
                    services(name, service_categories(name))
                `)
                .eq('org_id', profile.org_id)

            setHospedagemAppts(hospData?.filter((a: any) =>
                a.services?.service_categories?.name === 'Hospedagem'
            ) || [])

            setLoading(false)
        }
        fetchDebugData()
    }, [supabase])

    if (loading) return <div style={{ padding: '2rem' }}>Carregando...</div>

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <h1>🔍 Debug Page</h1>

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
                <h2>Hospedagem Appointments ({hospedagemAppts.length})</h2>
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
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'white', borderRadius: '4px' }}>
                    <strong>Hoje:</strong> {new Date().toISOString().split('T')[0]}
                </div>
            </section>
        </div>
    )
}
