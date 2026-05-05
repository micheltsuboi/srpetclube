'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateAppointment, deleteAppointment } from '@/app/actions/appointment'

interface Service {
    id: string
    name: string
    duration_minutes?: number
    base_price: number
}

interface EditAppointmentModalProps {
    appointment: {
        id: string
        pet_id: string
        service_id: string
        scheduled_at: string
        notes: string | null
        check_in_date?: string | null
        check_out_date?: string | null
        has_taxi?: boolean
        taxi_fee?: number
        pets: { name: string }
        services?: { name: string, service_categories?: { name: string } }
    }
    onClose: () => void
    onSave: () => void
}

export default function EditAppointmentModal({ appointment, onClose, onSave }: EditAppointmentModalProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [services, setServices] = useState<Service[]>([])

    // Form State
    const [serviceId, setServiceId] = useState(appointment.service_id)
    const [date, setDate] = useState(new Date(appointment.scheduled_at).toISOString().split('T')[0])
    const [time, setTime] = useState(new Date(appointment.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).slice(0, 5))
    const [notes, setNotes] = useState(appointment.notes || '')
    const [checkInDate, setCheckInDate] = useState(appointment.check_in_date || appointment.scheduled_at.split('T')[0])
    const [checkOutDate, setCheckOutDate] = useState(appointment.check_out_date || '')
    const [hasTaxi, setHasTaxi] = useState(appointment.has_taxi || false)
    const [taxiFee, setTaxiFee] = useState(appointment.taxi_fee?.toString() || '0')

    const selectedService = services.find(s => s.id === serviceId)
    const isHospedagem = selectedService?.name === 'Hospedagem' || (appointment.services as any)?.service_categories?.name === 'Hospedagem'

    useEffect(() => {
        const fetchServices = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile) return

            const { data } = await supabase
                .from('services')
                .select('id, name, base_price, duration_minutes')
                .eq('org_id', profile.org_id)
                .order('name')

            if (data) setServices(data)
        }
        fetchServices()
    }, [supabase])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const formData = new FormData()
        formData.append('id', appointment.id)
        formData.append('serviceId', serviceId)
        formData.append('date', date)
        formData.append('time', isHospedagem ? '17:00' : time)
        formData.append('notes', notes)
        if (checkInDate) formData.append('checkInDate', checkInDate)
        if (checkOutDate) formData.append('checkOutDate', checkOutDate)
        formData.append('hasTaxi', String(hasTaxi))
        formData.append('taxiFee', taxiFee)

        const result = await updateAppointment({ message: '', success: false }, formData)

        setLoading(false)
        if (result.success) {
            alert(result.message)
            onSave()
            onClose()
        } else {
            alert(result.message)
        }
    }

    const handleDelete = async () => {
        if (!confirm('Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.')) return

        setLoading(true)
        const result = await deleteAppointment(appointment.id)
        setLoading(false)

        if (result.success) {
            alert(result.message)
            onSave()
            onClose()
        } else {
            alert(result.message)
        }
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100, // Higher than daily report modal
            backdropFilter: 'blur(4px)'
        }} onClick={onClose}>
            <div style={{
                background: '#1e293b',
                padding: '2rem',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '500px',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white', margin: 0 }}>
                        Editar Agendamento
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </div>

                <div style={{ marginBottom: '1rem', color: '#cbd5e1', fontSize: '0.9rem' }}>
                    Pet: <strong style={{ color: 'white' }}>{appointment.pets?.name || 'Pet Desconhecido'}</strong>
                </div>

                <form onSubmit={handleSave}>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Serviço</label>
                            <select
                                value={serviceId}
                                onChange={e => setServiceId(e.target.value)}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                            >
                                {services.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>

                        {isHospedagem ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Check-in</label>
                                    <input
                                        type="date"
                                        value={checkInDate}
                                        onChange={e => {
                                            setCheckInDate(e.target.value)
                                            setDate(e.target.value) // Keep scheduled_at in sync
                                        }}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Check-out</label>
                                    <input
                                        type="date"
                                        value={checkOutDate}
                                        onChange={e => setCheckOutDate(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Data</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Hora</label>
                                    <input
                                        type="time"
                                        value={time}
                                        onChange={e => setTime(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                    />
                                </div>
                            </div>
                        )}

                        <div style={{ 
                            background: 'rgba(232, 130, 106, 0.05)', 
                            padding: '1rem', 
                            borderRadius: '12px', 
                            border: '1px solid rgba(232, 130, 106, 0.1)',
                            marginBottom: '0.5rem'
                        }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', color: 'white', fontWeight: 600 }}>
                                <input 
                                    type="checkbox" 
                                    checked={hasTaxi} 
                                    onChange={e => setHasTaxi(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: '#E8826A' }}
                                />
                                🚗 Taxi Dog?
                            </label>

                            {hasTaxi && (
                                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed rgba(232, 130, 106, 0.2)' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600 }}>VALOR DO TRANSPORTE (R$)</label>
                                    <input 
                                        type="number"
                                        step="0.01"
                                        value={taxiFee}
                                        onChange={e => setTaxiFee(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                        placeholder="0.00"
                                    />
                                </div>
                            )}
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem' }}>Observações</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={3}
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={loading}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    marginRight: 'auto'
                                }}
                            >
                                Excluir
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #334155',
                                    background: 'transparent',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#3b82f6',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    opacity: loading ? 0.7 : 1
                                }}
                            >
                                {loading ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
