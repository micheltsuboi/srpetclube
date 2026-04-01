'use client'
/* eslint-disable react-hooks/exhaustive-deps */

import { useState, useEffect, useCallback, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'
import { createClient } from '@/lib/supabase/client'
import {
    createAppointment,
    updateAppointment,
    deleteAppointment,
    updateChecklist,
    updateAppointmentStatus,
    updatePetPreferences
} from '@/app/actions/appointment'
import { searchPets } from '@/app/actions/pet'
import { checkInAppointment, checkOutAppointment } from '@/app/actions/checkInOut'
import {
    createScheduleBlock,
    deleteScheduleBlock
} from '@/app/actions/schedule'
import DateRangeFilter, { DateRange, getDateRange } from '@/components/DateRangeFilter'
import PaymentControls from '@/components/PaymentControls'
import EditAppointmentModal from '@/components/EditAppointmentModal'

interface Customer {
    name: string
}

interface Pet {
    id: string
    name: string
    species: string
    breed: string | null
    customers: Customer | null
    perfume_allowed: boolean
    accessories_allowed: boolean
    special_care: string | null
    is_adapted?: boolean
}

interface ServiceCategory {
    id: string
    name: string
    color: string
    icon: string
}

interface Service {
    id: string
    name: string
    duration_minutes?: number
    base_price: number
    category_id: string
    category?: string
    target_species?: string
    service_categories?: ServiceCategory
    scheduling_rules?: { day: number, species: string[] }[]
}

interface Appointment {
    id: string
    pet_id: string
    service_id: string
    scheduled_at: string
    status: 'pending' | 'confirmed' | 'in_progress' | 'done' | 'cancelled'
    checklist: any
    notes: string | null
    actual_check_in: string | null
    actual_check_out: string | null
    check_in_date?: string | null
    check_out_date?: string | null
    pets: Pet | null
    services: Service | null
    calculated_price?: number | null
    final_price?: number | null
    discount_percent?: number | null
    payment_status?: string | null
    payment_method?: string | null
    package_credit_id?: string | null
    package_slot_id?: string | null
}

interface ScheduleBlock {
    id: string
    start_at: string
    end_at: string
    reason: string
    allowed_species?: string[] | null
}

function normalizeChecklist(raw: any[] | undefined): { text: string, completed: boolean, completed_at: string | null }[] {
    if (!raw || raw.length === 0) return []
    return raw.map((item: any) => ({
        text: item.text || item.label || item.item || 'Item',
        completed: item.completed ?? item.checked ?? item.done ?? false,
        completed_at: item.completed_at || null
    }))
}

const initialState = { message: '', success: false }

export default function AgendaPage() {
    const supabase = createClient()
    const router = useRouter()

    // Data State
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
    const [pets, setPets] = useState<Pet[]>([])
    const [services, setServices] = useState<Service[]>([])

    // UI State
    const [todayStr] = useState(() => {
        const d = new Date()
        const y = d.getFullYear()
        const m = (d.getMonth() + 1).toString().padStart(2, '0')
        const day = d.getDate().toString().padStart(2, '0')
        return `${y}-${m}-${day}`
    })

    const [selectedDate, setSelectedDate] = useState<string>(todayStr)
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('month')
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    const [categoryFilter, setCategoryFilter] = useState<string>('')

    // Modal State
    const [showNewModal, setShowNewModal] = useState(false)
    const [showDetailModal, setShowDetailModal] = useState(false)
    const [showBlockModal, setShowBlockModal] = useState(false)

    // Selection State
    const [selectedHourSlot, setSelectedHourSlot] = useState<string | null>(null)
    const [preSelectedPetId, setPreSelectedPetId] = useState<string | null>(null)
    const [preSelectedServiceId, setPreSelectedServiceId] = useState<string | null>(null)
    const [selectedServiceId, setSelectedServiceId] = useState<string>('')
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
    const [isEditing, setIsEditing] = useState(false)

    // Checklist State
    const [currentChecklist, setCurrentChecklist] = useState<any[]>([])

    // Validation State
    const [bookingError, setBookingError] = useState<string | null>(null)
    const [loadingDynamicPrice, setLoadingDynamicPrice] = useState(false)
    const [modalDynamicPrices, setModalDynamicPrices] = useState<Record<string, number>>({})
    const [petSearchTerm, setPetSearchTerm] = useState('')
    const [showPetResults, setShowPetResults] = useState(false)
    const [isSearchingPets, setIsSearchingPets] = useState(false)

    // Actions
    const [createState, createAction, isCreatePending] = useActionState(createAppointment, initialState)
    const [blockState, blockAction, isBlockPending] = useActionState(createScheduleBlock, initialState)

    // Debug state change
    useEffect(() => {
        if (blockState.message) {
            console.log('[Agenda] blockState updated:', blockState)
        }
    }, [blockState])

    const fetchData = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
            if (!profile?.org_id) return

            // Load Metadata (Limited to 30 most recent initially)
            if (pets.length === 0) {
                const { data: p } = await supabase
                    .from('pets')
                    .select('id, name, species, breed, customers(name), perfume_allowed, accessories_allowed, special_care, is_adapted')
                    .order('created_at', { ascending: false })
                    .limit(30)
                if (p) setPets(p as any)

                const { data: s } = await supabase
                    .from('services')
                    .select('id, name, duration_minutes, base_price, category_id, target_species, scheduling_rules, service_categories (id, name, color, icon)')
                    .eq('org_id', profile.org_id)
                    .order('name')

                if (s) setServices(s as unknown as Service[])
            }

            // Calculate Date Range based on viewMode
            // Create local date objects to avoid UTC shifting issues
            const [y, m, d] = selectedDate.split('-').map(Number)
            let start = new Date(y, m - 1, d) // 00:00:00 Local Time
            let end = new Date(y, m - 1, d)   // 00:00:00 Local Time

            if (viewMode === 'day') {
                end.setHours(23, 59, 59)
            } else if (viewMode === 'week') {
                const day = start.getDay() // Local day
                const diff = start.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
                start.setDate(diff) // Set local date to Monday
                // Set end to Sunday
                end = new Date(start) // Copy Monday
                end.setDate(start.getDate() + 6)
                end.setHours(23, 59, 59)
            } else {
                start.setDate(1)
                end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
                end.setHours(23, 59, 59)
            }

            const startDateStr = start.toISOString()
            const endDateStr = end.toISOString()

            // Fetch Blocks
            const { data: blks } = await supabase
                .from('schedule_blocks')
                .select('*')
                .eq('org_id', profile.org_id)
                .lt('start_at', endDateStr)
                .gt('end_at', startDateStr)

            if (blks) setBlocks(blks)

            // Fetch Appointments - Updated for multiday support
            const startDayStr = startDateStr.split('T')[0]
            const endDayStr = endDateStr.split('T')[0]

            const { data: appts, error } = await supabase
                .from('appointments')
                .select(`
                    id, pet_id, service_id, scheduled_at, status, checklist, notes,
                    calculated_price,
                    final_price, discount_percent, payment_status, payment_method,
                    actual_check_in, actual_check_out,
                    check_in_date, check_out_date,
                    package_credit_id, package_slot_id,
                    pets ( 
                        name, species, breed, 
                        perfume_allowed, accessories_allowed, special_care, is_adapted,
                        customers ( name )
                    ),
                    services ( 
                        name, duration_minutes, base_price, category_id,
                        service_categories ( name, color, icon )
                    )
                `)
                .eq('org_id', profile.org_id)
                .or(`and(scheduled_at.gte.${startDateStr},scheduled_at.lte.${endDateStr}),and(check_in_date.lte.${endDayStr},check_out_date.gte.${startDayStr})`)
                .neq('status', 'cancelled')

            if (error) console.error(error)
            if (appts) setAppointments(appts as unknown as Appointment[])

        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }, [selectedDate, viewMode, supabase]) // Simplified deps

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        if (createState.success) {
            setShowNewModal(false)
            fetchData()
            // Reset selection
            setSelectedServiceId('')
            setPreSelectedPetId(null)
            setBookingError(null)
        } else if (createState.message) {
            alert(createState.message)
        }
    }, [createState, fetchData])

    useEffect(() => {
        if (blockState.success) {
            setShowBlockModal(false)
            fetchData()
        } else if (blockState.message) {
            alert(blockState.message)
        }
    }, [blockState, fetchData])

    const validateScheduling = (dateStr: string, svcId: string, pId: string) => {
        if (!dateStr || !svcId || !pId) {
            setBookingError(null)
            return true
        }

        const svc = services.find(s => s.id === svcId)
        const pet = pets.find(p => p.id === pId)

        if (!svc || !pet) {
            setBookingError(null)
            return true
        }

        const petSpecies = pet.species.toLowerCase() === 'cão' || pet.species.toLowerCase() === 'dog' ? 'dog' : 'cat'

        // 1. Check Service Target Species
        if (svc.target_species && svc.target_species !== 'both' && svc.target_species !== petSpecies) {
            setBookingError(`Este serviço é exclusivo para ${svc.target_species === 'dog' ? 'Cães' : 'Gatos'}.`)
            return false
        }

        // 2. Check Schedule Rules (Day of week)
        if (svc.scheduling_rules && svc.scheduling_rules.length > 0) {
            const [y, m, d] = dateStr.split('-').map(Number)
            const dayOfWeek = new Date(y, m - 1, d).getDay()
            const rule = svc.scheduling_rules.find(r => r.day === dayOfWeek)

            if (rule && !rule.species.includes(petSpecies)) {
                const allowed = rule.species.map(s => s === 'dog' ? 'Cães' : 'Gatos').join(' ou ')
                const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
                setBookingError(`Este serviço só é permitido para ${allowed} às ${days[dayOfWeek]}s.`)
                return false
            }
        }

        // 3. Check Schedule Blocks (The new Logic)
        // Exempt categories
        const categoryName = (svc.service_categories?.name || svc.category || '').toLowerCase()
        const isExempt = categoryName.includes('creche') || categoryName.includes('hospedagem') || categoryName.includes('hotel')

        if (!isExempt) {
            // Find blocks for this day
            // We need to check if the selected time (or the whole day) is blocked.
            // Since we only have dateStr here, we can check if there are blocks that cover the *start* time.
            // But wait, validateScheduling is called when DATE changes. We might not have TIME yet.
            // However, usually blocks are for specific times or full days.
            // If we have selectedHourSlot, we should check it.

            if (selectedHourSlot) {
                const startDateTime = `${dateStr}T${selectedHourSlot}:00`
                const endDateTimeNumber = parseInt(selectedHourSlot) + (svc.duration_minutes || 60) / 60
                // Simple check: is the START time inside a block?
                // A block is: start_at <= my_start < end_at

                // We need the blocks state. We have 'scheduleBlocks'.
                // Blocks are in ISO or similar. We need to compare properly.

                const myStart = new Date(startDateTime).getTime()

                const conflictingBlock = blocks.find((b: any) => {
                    const blockStart = new Date(b.start_at).getTime()
                    const blockEnd = new Date(b.end_at).getTime()
                    return myStart >= blockStart && myStart < blockEnd
                })

                if (conflictingBlock) {
                    const blockTags: string[] = conflictingBlock.allowed_species || []
                    const allowedSpecies = blockTags.filter(t => !t.startsWith('blocked_cat_'))
                    const blockedCategories = blockTags.filter(t => t.startsWith('blocked_cat_')).map(t => t.replace('blocked_cat_', ''))

                    let blockApplies = false

                    if (blockedCategories.length > 0) {
                        // Block only applies if the service's category is in the blocked list
                        if (blockedCategories.includes(categoryName)) {
                            blockApplies = true
                        }
                    } else {
                        // General block applies to all non-exempt services
                        blockApplies = true
                    }

                    if (blockApplies) {
                        if (allowedSpecies.length > 0) {
                            if (!allowedSpecies.includes(petSpecies)) {
                                const allowed = allowedSpecies.map(s => s === 'dog' ? 'Cães' : 'Gatos').join(' e ')
                                setBookingError(`Horário reservado exclusivamente para ${allowed}.`)
                                return false
                            }
                        } else {
                            // General block (no species allowance)
                            setBookingError(`Horário bloqueado: ${conflictingBlock.reason}`)
                            return false
                        }
                    }
                }
            }
        }

        setBookingError(null)
        return true
    }

    // Recalculate dynamic prices for all visible services in the modal
    useEffect(() => {
        const fetchModalPrices = async () => {
            if (showNewModal && preSelectedPetId && selectedDate) {
                // Filter services first to avoid unnecessary RPC calls
                const pet = pets.find(p => p.id === preSelectedPetId);
                if (!pet) return;
                const petSpecies = pet.species.toLowerCase() === 'cão' || pet.species.toLowerCase() === 'dog' ? 'dog' : 'cat';
                const eligibleServices = services.filter(s => !s.target_species || s.target_species === 'both' || s.target_species === petSpecies);

                setLoadingDynamicPrice(true)
                try {
                    const { calculateManyDynamicPrices } = await import('@/app/actions/pricing')
                    const serviceIds = eligibleServices.map(s => s.id)
                    const results = await calculateManyDynamicPrices(preSelectedPetId, serviceIds, selectedDate)

                    const newPrices: Record<string, number> = {}
                    eligibleServices.forEach(s => {
                        newPrices[s.id] = results[s.id] ?? s.base_price
                    })
                    setModalDynamicPrices(newPrices)
                } catch (err) {
                    console.error('Error fetching modal prices:', err)
                } finally {
                    setLoadingDynamicPrice(false)
                }
            } else {
                setModalDynamicPrices({})
            }
        }
        fetchModalPrices()
    }, [showNewModal, preSelectedPetId, selectedDate, services, pets])

    const handleNewAppointment = (date?: string, hour?: number, petId?: string, serviceId?: string) => {
        let finalDate = date || selectedDate
        let finalSvcId = serviceId || ''
        let finalPetId = petId || ''

        // Check for blocks only for Banho e Tosa or if we want stricter blocking
        // For now, let's allow opening the modal to pick service

        setSelectedDate(finalDate)
        if (hour) setSelectedHourSlot(hour.toString().padStart(2, '0'))
        if (petId) setPreSelectedPetId(petId)
        if (serviceId) setSelectedServiceId(serviceId)
        else setSelectedServiceId('')

        // Trigger validation
        validateScheduling(finalDate, finalSvcId, finalPetId)

        setPetSearchTerm('') // Reset search when opening
        setShowPetResults(false) // Hide results initially
        setShowNewModal(true)
    }

    const handleOpenDetail = (appt: Appointment) => {
        setSelectedAppointment(appt)
        setIsEditing(false)
        setCurrentChecklist(normalizeChecklist(appt.checklist as any[]))
        setShowDetailModal(true)
    }

    const handleDelete = async (id?: string) => {
        const appointmentId = id || selectedAppointment?.id
        if (!appointmentId) return
        
        if (confirm('Tem certeza que deseja cancelar este agendamento?')) {
            const res = await deleteAppointment(appointmentId)
            if (res.success) {
                setShowDetailModal(false)
                fetchData()
            } else {
                alert(res.message)
            }
        }
    }

    const handleSmartAction = async (appt: Appointment, action: 'checkin' | 'checkout' | 'start') => {
        let res
        if (action === 'checkin') res = await checkInAppointment(appt.id)
        else if (action === 'checkout') res = await checkOutAppointment(appt.id)
        else if (action === 'start') res = await updateAppointmentStatus(appt.id, 'in_progress')

        if (res?.success) fetchData()
        else alert(res?.message || 'Erro ao atualizar status')
    }

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return '⏳ Pendente'
            case 'confirmed': return '✅ Confirmado'
            case 'in_progress': return '🔥 Em Andamento'
            case 'done': return '🏁 Finalizado'
            case 'cancelled': return '❌ Cancelado'
            default: return status
        }
    }

    const handleBlockDelete = async (id: string) => {
        if (confirm('Remover bloqueio?')) {
            await deleteScheduleBlock(id)
            fetchData()
        }
    }

    const handleCreateBlock = async (formData: FormData) => {
        console.log('[Agenda] Creating block...')
        try {
            const res = await createScheduleBlock(null, formData)
            console.log('[Agenda] Block result:', res)
            if (res.success) {
                setShowBlockModal(false)
                fetchData()
            } else {
                alert(res.message)
            }
        } catch (err) {
            console.error('[Agenda] Block error:', err)
            alert('Erro inesperado ao criar bloqueio.')
        }
    }

    const formatTime = (isoString: string) => {
        const date = new Date(isoString)
        // Adjust for timezone offset manually if needed, or rely on browser
        // Simple formatter:
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }

    const renderAppointmentCard = (appt: Appointment) => {
        // Safe access for nested category properties
        const serviceCategory = (appt.services as any)?.service_categories
        const categoryColor = serviceCategory?.color || (Array.isArray(serviceCategory) ? serviceCategory[0]?.color : '#3B82F6')
        const categoryIcon = serviceCategory?.icon || (Array.isArray(serviceCategory) ? serviceCategory[0]?.icon : '📋')

        const serviceNameLower = appt.services?.name?.toLowerCase() || ''
        const isCrecheOrHotel = serviceNameLower.includes('creche') || serviceNameLower.includes('hospedagem') || serviceNameLower.includes('hotel') || serviceNameLower.includes('day care')
        const needsAdaptation = isCrecheOrHotel && appt.pets && !appt.pets.is_adapted

        const petName = appt.pets?.name || 'Pet Desconhecido'
        const ownerName = appt.pets?.customers?.name || 'Cliente'

        return (
            <div
                key={appt.id}
                className={styles.appointmentCard}
                onClick={(e) => { e.stopPropagation(); handleOpenDetail(appt) }}
                style={{
                    minWidth: '300px',
                    borderLeft: `4px solid ${needsAdaptation ? '#f1c40f' : categoryColor} `,
                    backgroundColor: appt.status === 'done' ? 'var(--bg-tertiary)' : (needsAdaptation ? 'rgba(241, 196, 15, 0.05)' : 'var(--bg-secondary)'),
                    opacity: appt.status === 'done' ? 0.7 : 1
                }}
            >
                <div className={styles.timeDisplay}>{formatTime(appt.scheduled_at)}</div>
                <div className={styles.cardTop}>
                    <div className={styles.petInfoMain}>
                        <div className={styles.petAvatar}>{appt.pets?.species === 'cat' ? '🐱' : '🐶'}</div>
                        <div className={styles.petDetails}>
                            <div className={styles.petName}>
                                {petName}
                                {needsAdaptation && (
                                    <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#f1c40f', color: '#000', borderRadius: '4px', marginLeft: '0.5rem', fontWeight: 'bold' }}>
                                        ⚠️ Adaptação Pendente
                                    </span>
                                )}
                                <span className={styles.statusBadge}>
                                    {appt.actual_check_in && !appt.actual_check_out ? '🟢 Em Andamento' :
                                        appt.actual_check_out ? '🏁 Finalizado' :
                                            getStatusLabel(appt.status)}
                                </span>
                            </div>
                            <span className={styles.petBreed}>{appt.pets?.breed}</span>
                            <span className={styles.tutorName}>👤 {ownerName}</span>
                        </div>
                    </div>
                </div>

                <div className={styles.serviceLine}>
                    <span style={{ marginRight: '0.25rem' }}>{categoryIcon}</span>
                    {appt.services?.name}
                    {(appt.package_credit_id || appt.package_slot_id) && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'rgba(139,92,246,0.2)', color: '#a78bfa', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            📦 Pacote
                        </span>
                    )}
                </div>
                <PaymentControls
                    appointmentId={appt.id}
                    calculatedPrice={appt.calculated_price ?? (appt.services as any)?.base_price ?? null}
                    finalPrice={appt.final_price ?? null}
                    discountPercent={appt.discount_percent ?? null}
                    paymentStatus={appt.payment_status ?? null}
                    paymentMethod={appt.payment_method ?? null}
                    onUpdate={() => fetchData()}
                    compact
                />

                <div className={styles.quickActions}>
                    {!appt.actual_check_in && (
                        <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); handleSmartAction(appt, 'checkin') }}>Entrada ➡️</button>
                    )}
                    {appt.actual_check_in && !appt.actual_check_out && (
                        <button className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); handleSmartAction(appt, 'checkout') }}>Saída ⬅️</button>
                    )}
                    <div className={styles.cardTopActions}>
                        <button className={styles.quickEditBtn} onClick={(e) => { e.stopPropagation(); setEditingAppointment(appt); }} title="Editar">✏️</button>
                        <button className={styles.quickDeleteBtn} onClick={(e) => { e.stopPropagation(); handleDelete(appt.id); }} title="Excluir">🗑️</button>
                    </div>
                    <button className={styles.detailBtn} onClick={(e) => { e.stopPropagation(); handleOpenDetail(appt) }}>Detalhes</button>
                </div>
            </div>
        )
    }

    const renderDayView = () => {
        const hours = Array.from({ length: 11 }, (_, i) => i + 8) // 08h to 18h
        return (
            <div className={styles.dayGrid}>
                {hours.map(h => {
                    const timeStr = `${h.toString().padStart(2, '0')}:00`
                    const slotAppts = appointments.filter(a => {
                        const isMultiday = !!(a.check_in_date && a.check_out_date)
                        const apptDateStr = new Date(a.scheduled_at).toLocaleDateString('en-CA')
                        const matchesDay = isMultiday
                            ? (selectedDate >= a.check_in_date! && selectedDate <= a.check_out_date!)
                            : apptDateStr === selectedDate

                        // For multiday, we show them at a "check-in" hour (e.g., 14h) or spread them?
                        // User mentioned indicating them across all relevant days.
                        // If it's the start day, show at scheduled_at hour.
                        // If it's a middle day, maybe show at a default hour or at the top.
                        // Let's stick to showing them if they match the day.
                        // For day view, if it matches the day, we need to decide WHICH hour to show it in.
                        // If it's just a regular service, it has an hour.
                        // If it's hospedagem, it spans days.

                        const d = new Date(a.scheduled_at)
                        const localH = d.getHours()

                        // If it's the start day of a multiday or a single day appointment, 
                        // decide which hour it matches.
                        let hourMatches = localH === h

                        // If scheduled before the first visible hour, show in the first hour
                        if (localH < 8 && h === 8) hourMatches = true
                        // If scheduled after the last visible hour, show in the last hour
                        if (localH > 18 && h === 18) hourMatches = true

                        if (isMultiday) {
                            // If it's a middle day, show at 8 AM
                            if (selectedDate > a.check_in_date! && selectedDate <= a.check_out_date!) {
                                hourMatches = h === 8
                            }
                        }

                        const serviceCategory = (a.services as any)?.service_categories
                        const categoryName = Array.isArray(serviceCategory)
                            ? serviceCategory[0]?.name
                            : serviceCategory?.name

                        const matchesCategory = !categoryFilter || categoryName === categoryFilter
                        const matchesSearch = !searchTerm ||
                            a.pets?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            a.pets?.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase())

                        return matchesDay && hourMatches && matchesCategory && matchesSearch
                    })

                    const slotBlocks = blocks.filter(b => {
                        const bStart = new Date(b.start_at)
                        const bEnd = new Date(b.end_at)
                        const [y, m, d] = selectedDate.split('-').map(Number)
                        const slotTime = new Date(y, m - 1, d, h)
                        return slotTime >= bStart && slotTime < bEnd
                    })
                    const isBlocked = slotBlocks.length > 0

                    return (
                        <div key={h} className={`${styles.hourRow} ${isBlocked ? styles.blockedRow : ''}`}>
                            <div className={styles.hourLabel}>{timeStr}</div>
                            <div className={styles.hourContent}>
                                {slotBlocks.map(b => (
                                    <div key={b.id} className={styles.blockedCard}>
                                        🔒 {b.reason}
                                        <button onClick={() => handleBlockDelete(b.id)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
                                    </div>
                                ))}
                                {slotAppts.map(renderAppointmentCard)}
                                <button className={styles.addSlotBtn} onClick={() => handleNewAppointment(selectedDate, h)}>
                                    +
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    const renderWeekView = () => {
        const weekDays = Array.from({ length: 7 }, (_, i) => {
            const [y, m, d] = selectedDate.split('-').map(Number)
            const date = new Date(y, m - 1, d)
            const day = date.getDay()
            const diff = date.getDate() - day + (day === 0 ? -6 : 1) + i
            date.setDate(diff)
            return date
        })
        const hours = Array.from({ length: 11 }, (_, i) => i + 8)

        return (
            <div className={styles.weekGrid}>
                <div className={styles.weekHeaderCell}>Hora</div>
                {weekDays.map(d => {
                    const dateStr = d.toISOString().split('T')[0]
                    const isToday = dateStr === todayStr
                    return (
                        <div key={d.toISOString()} className={`${styles.weekHeaderCell} ${isToday ? styles.today : ''}`} style={{ fontWeight: dateStr === selectedDate ? 'bold' : 'normal', color: dateStr === selectedDate ? 'var(--primary)' : 'inherit' }}>
                            <div>{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                            <div>{d.getDate()}</div>
                        </div>
                    )
                })}

                {hours.map(h => (
                    <div key={h} style={{ display: 'contents' }}>
                        <div className={styles.weekTimeCell}>{h}:00</div>
                        {weekDays.map(d => {
                            const dateStr = d.toISOString().split('T')[0]
                            const slotAppts = appointments.filter(a => {
                                const isMultiday = !!(a.check_in_date && a.check_out_date)
                                const apptDateStr = new Date(a.scheduled_at).toLocaleDateString('en-CA')
                                const matchesDay = isMultiday
                                    ? (dateStr >= a.check_in_date! && dateStr <= a.check_out_date!)
                                    : apptDateStr === dateStr

                                const ad = new Date(a.scheduled_at)
                                const localH = ad.getHours()
                                let hourMatches = localH === h

                                // Boundary check for week view
                                if (localH < 8 && h === 8) hourMatches = true
                                if (localH > 18 && h === 18) hourMatches = true

                                if (isMultiday && a.check_in_date && a.check_out_date && dateStr > a.check_in_date && dateStr <= a.check_out_date) {
                                    hourMatches = h === 8 // Middle days at 8 AM
                                }

                                const serviceCategory = (a.services as any)?.service_categories
                                const categoryName = Array.isArray(serviceCategory)
                                    ? serviceCategory[0]?.name
                                    : serviceCategory?.name

                                const matchesCategory = !categoryFilter || categoryName === categoryFilter
                                const matchesSearch = !searchTerm ||
                                    a.pets?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    a.pets?.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase())

                                return matchesDay && hourMatches && matchesCategory && matchesSearch
                            })
                            const [y, m, dayNum] = dateStr.split('-').map(Number)
                            const slotTime = new Date(y, m - 1, dayNum, h)
                            const slotBlocks = blocks.filter(b => {
                                const bStart = new Date(b.start_at)
                                const bEnd = new Date(b.end_at)
                                return slotTime >= bStart && slotTime < bEnd
                            })
                            const isBlocked = slotBlocks.length > 0

                            const isToday = dateStr === todayStr
                            return (
                                <div
                                    key={`${dateStr}-${h}`}
                                    className={`${styles.weekCell} ${isBlocked ? styles.blockedCell : ''} ${isToday ? styles.today : ''}`}
                                    onClick={() => { setSelectedDate(dateStr); setViewMode('day') }}
                                >
                                    {isBlocked && <div className={styles.weekBlockIndicator}>🔒</div>}
                                    {slotAppts.map(appt => {
                                        const serviceCategory = (appt.services as any)?.service_categories
                                        const categoryColor = serviceCategory?.color || (Array.isArray(serviceCategory) ? serviceCategory[0]?.color : '#3B82F6')
                                        const petName = appt.pets?.name || 'Pet'
                                        return (
                                            <div
                                                key={appt.id}
                                                className={styles.weekEventPill}
                                                style={{ backgroundColor: categoryColor }}
                                                title={`${petName} - ${appt.services?.name}`}
                                            >
                                                {petName}
                                                <div className={styles.pillActions}>
                                                    <button className={styles.quickPillBtn} onClick={(e) => { e.stopPropagation(); setEditingAppointment(appt); }}>✏️</button>
                                                    <button className={styles.quickPillBtn} onClick={(e) => { e.stopPropagation(); handleDelete(appt.id); }}>🗑️</button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        )
    }

    const renderMonthView = () => {
        // Simple month view implementation
        const year = new Date(selectedDate).getFullYear()
        const month = new Date(selectedDate).getMonth()
        const firstDay = new Date(year, month, 1)
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

        return (
            <div className={styles.monthGrid}>
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className={styles.monthHeader}>{d}</div>)}
                {Array.from({ length: firstDay.getDay() }).map((_, i) => <div key={`empty-${i}`} />)}
                {days.map(day => {
                    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
                    const dayAppts = appointments.filter(a => {
                        const isMultiday = !!(a.check_in_date && a.check_out_date)
                        const apptDateStr = new Date(a.scheduled_at).toLocaleDateString('en-CA')
                        const matchesDay = isMultiday
                            ? (dateStr >= a.check_in_date! && dateStr <= a.check_out_date!)
                            : apptDateStr === dateStr

                        const serviceCategory = (a.services as any)?.service_categories
                        const categoryName = Array.isArray(serviceCategory)
                            ? serviceCategory[0]?.name
                            : serviceCategory?.name

                        const matchesCategory = !categoryFilter || categoryName === categoryFilter
                        const matchesSearch = !searchTerm ||
                            a.pets?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            a.pets?.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase())

                        return matchesDay && matchesCategory && matchesSearch
                    })
                    const isToday = dateStr === todayStr
                    return (
                        <div key={day} className={`${styles.monthCell} ${isToday ? styles.today : ''}`} onClick={() => { setSelectedDate(dateStr); setViewMode('day') }}>
                            <div className={styles.monthDate}>{day}</div>
                            {dayAppts.map((appt, idx) => {
                                const serviceCategory = (appt.services as any)?.service_categories
                                const categoryColor = serviceCategory?.color || (Array.isArray(serviceCategory) ? serviceCategory[0]?.color : '#3B82F6')
                                const petName = appt.pets?.name || 'Pet'
                                return (
                                    <div
                                        key={appt.id}
                                        className={styles.monthEventDot}
                                        style={{ borderLeftColor: categoryColor }}
                                        title={`${petName} - ${appt.services?.name}`}
                                    >
                                        {petName}
                                        <div className={styles.pillActions}>
                                            <button className={styles.quickPillBtn} onClick={(e) => { e.stopPropagation(); setEditingAppointment(appt); }}>✏️</button>
                                            <button className={styles.quickPillBtn} onClick={(e) => { e.stopPropagation(); handleDelete(appt.id); }}>🗑️</button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Agenda</h1>
                <div className={styles.actionGroup}>
                    <select className={styles.select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                        <option value="">Filtro...</option>
                        {Array.from(new Set(services.flatMap(s => {
                            const sc = (s as any).service_categories
                            const name = Array.isArray(sc) ? sc[0]?.name : sc?.name
                            return name ? [name] : []
                        }))).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                        <button className={styles.actionButton} style={{ flex: 1 }} onClick={() => handleNewAppointment()}>+ Agendar</button>
                        <button className={styles.secondaryButton} style={{ flex: 1 }} onClick={() => setShowBlockModal(true)}>Bloquear</button>
                    </div>
                </div>
            </div>

            <div className={styles.toolbar}>
                <div className={styles.viewToggle}>
                    <button className={viewMode === 'day' ? `${styles.viewBtn} ${styles.viewBtnActive}` : styles.viewBtn} onClick={() => setViewMode('day')}>Dia</button>
                    <button className={viewMode === 'week' ? `${styles.viewBtn} ${styles.viewBtnActive}` : styles.viewBtn} onClick={() => setViewMode('week')}>Semana</button>
                    <button className={viewMode === 'month' ? `${styles.viewBtn} ${styles.viewBtnActive}` : styles.viewBtn} onClick={() => setViewMode('month')}>Mês</button>
                </div>

                <div className={styles.legend}>
                    <div className={styles.legendItem}>
                        <div className={styles.legendColor} style={{ backgroundColor: '#3B82F6' }} />
                        <span>Banho e Tosa</span>
                    </div>
                    <div className={styles.legendItem}>
                        <div className={styles.legendColor} style={{ backgroundColor: '#F59E0B' }} />
                        <span>Hospedagem</span>
                    </div>
                    <div className={styles.legendItem}>
                        <div className={styles.legendColor} style={{ backgroundColor: '#10B981' }} />
                        <span>Creche</span>
                    </div>
                </div>

                <div className={styles.dateNav}>
                    <button className={styles.navBtn} onClick={() => {
                        const d = new Date(selectedDate)
                        d.setDate(d.getDate() - 1)
                        setSelectedDate(d.toISOString().split('T')[0])
                    }}>◀</button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={styles.dateInput} style={{ color: selectedDate === todayStr ? 'var(--primary)' : 'inherit' }} />
                        {selectedDate === todayStr && (
                            <span style={{ fontSize: '0.75rem', background: 'var(--primary)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '12px', fontWeight: 'bold' }}>Hoje</span>
                        )}
                    </div>
                    <button className={styles.navBtn} onClick={() => {
                        const d = new Date(selectedDate)
                        d.setDate(d.getDate() + 1)
                        setSelectedDate(d.toISOString().split('T')[0])
                    }}>▶</button>
                </div>
            </div>

            {loading ? <div className={styles.loading}>Carregando agenda...</div> : (
                <>
                    {viewMode === 'day' && renderDayView()}
                    {viewMode === 'week' && renderWeekView()}
                    {viewMode === 'month' && renderMonthView()}
                </>
            )}

            {/* New Appointment Modal */}
            {showNewModal && (
                <div className={styles.modalOverlay} onClick={() => setShowNewModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>Novo Agendamento</h2>
                        <form action={createAction}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Pet *</label>
                                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <input
                                        type="text"
                                        placeholder="🔍 Pesquisar pet ou tutor..."
                                        className={styles.input}
                                        value={petSearchTerm}
                                        onChange={(e) => {
                                            setPetSearchTerm(e.target.value)
                                            setShowPetResults(true)
                                        }}
                                        onFocus={() => setShowPetResults(true)}
                                        style={{ fontSize: '0.85rem', padding: '0.75rem' }}
                                    />

                                    {showPetResults && petSearchTerm.length > 0 && (
                                        <div className={styles.searchResultsContainer}>
                                            {pets
                                                .filter(p => {
                                                    const search = petSearchTerm.toLowerCase()
                                                    return p.name.toLowerCase().includes(search) ||
                                                        p.customers?.name?.toLowerCase().includes(search) ||
                                                        p.breed?.toLowerCase().includes(search)
                                                })
                                                .slice(0, 8)
                                                .map(p => (
                                                    <div
                                                        key={p.id}
                                                        className={styles.searchResultItem}
                                                        onClick={() => {
                                                            setPreSelectedPetId(p.id)
                                                            setPetSearchTerm(p.name)
                                                            setShowPetResults(false)
                                                            validateScheduling(selectedDate, selectedServiceId, p.id)
                                                        }}
                                                    >
                                                        <span className={styles.resultPetName}>{p.name}</span>
                                                        <span className={styles.resultTutorName}>
                                                            👤 {p.customers?.name || 'Sem tutor'} • {p.breed || 'SRD'}
                                                        </span>
                                                    </div>
                                                ))
                                            }
                                            {pets.filter(p => {
                                                const search = petSearchTerm.toLowerCase()
                                                return p.name.toLowerCase().includes(search) ||
                                                    p.customers?.name?.toLowerCase().includes(search) ||
                                                    p.breed?.toLowerCase().includes(search)
                                            }).length === 0 && (
                                                    <div className={styles.searchResultItem} style={{ cursor: 'default', color: '#ef4444' }}>
                                                        Nenhum pet encontrado.
                                                    </div>
                                                )}
                                        </div>
                                    )}

                                    {/* Select oculto para manter compatibilidade com o form action */}
                                    <select
                                        name="petId"
                                        required
                                        value={preSelectedPetId || ""}
                                        onChange={(e) => setPreSelectedPetId(e.target.value)}
                                        style={{ display: 'none' }}
                                    >
                                        <option value="">Selecione...</option>
                                        {pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>

                                    {preSelectedPetId && !showPetResults && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: '600', marginTop: '2px' }}>
                                            ✓ Selecionado: {pets.find(p => p.id === preSelectedPetId)?.name} ({pets.find(p => p.id === preSelectedPetId)?.customers?.name})
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Serviço *</label>
                                <select
                                    name="serviceId"
                                    className={styles.select}
                                    required
                                    value={selectedServiceId}
                                    onChange={(e) => {
                                        setSelectedServiceId(e.target.value)
                                        validateScheduling(selectedDate, e.target.value, preSelectedPetId || "")
                                    }}
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {Object.entries(services
                                        .filter(s => {
                                            if (!preSelectedPetId) return true;
                                            const pet = pets.find(p => p.id === preSelectedPetId);
                                            if (!pet) return true;
                                            const petSpecies = pet.species.toLowerCase() === 'cão' || pet.species.toLowerCase() === 'dog' ? 'dog' : 'cat';
                                            return !s.target_species || s.target_species === 'both' || s.target_species === petSpecies;
                                        })
                                        .reduce((acc, s) => {
                                            const cat = s.service_categories?.name || 'Outros'
                                            if (!acc[cat]) acc[cat] = []
                                            acc[cat].push(s)
                                            return acc
                                        }, {} as Record<string, typeof services>)).map(([category, catServices]) => (
                                            <optgroup key={category} label={category}>
                                                {catServices.map(s => (
                                                    <option key={s.id} value={s.id}>
                                                        {s.name} (R$ {(modalDynamicPrices[s.id] ?? s.base_price).toFixed(2)})
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                </select>
                                {selectedServiceId && (
                                    <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--primary)', fontWeight: '600' }}>
                                        {loadingDynamicPrice ? (
                                            <span>Atualizando preços...</span>
                                        ) : modalDynamicPrices[selectedServiceId] !== undefined ? (
                                            <span>Preço para este pet: R$ {modalDynamicPrices[selectedServiceId].toFixed(2)}</span>
                                        ) : (
                                            <span>Preço base: R$ {services.find(s => s.id === selectedServiceId)?.base_price.toFixed(2)}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                            {/* Conditional Rendering for Hospedagem */}
                            {(() => {
                                const selectedService = services.find(s => s.id === selectedServiceId)
                                const categoryName = selectedService?.service_categories?.name || ''
                                const isHospedagem = categoryName.toLowerCase().includes('hospedagem') || categoryName.toLowerCase().includes('hotel')

                                if (isHospedagem) {
                                    return (
                                        <div className={styles.row}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>Data Check-in *</label>
                                                <input
                                                    name="checkInDate"
                                                    type="date"
                                                    className={styles.input}
                                                    required
                                                    defaultValue={selectedDate}
                                                    onChange={(e) => {
                                                        setSelectedDate(e.target.value)
                                                        validateScheduling(e.target.value, selectedServiceId, preSelectedPetId || "")
                                                    }}
                                                />
                                                <input type="hidden" name="date" value={selectedDate} />
                                                <input type="hidden" name="time" value="14:00" />
                                            </div>
                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>Data Check-out *</label>
                                                <input
                                                    name="checkOutDate"
                                                    type="date"
                                                    className={styles.input}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    )
                                }

                                return (
                                    <div className={styles.row}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.label}>Data *</label>
                                            <input
                                                name="date"
                                                type="date"
                                                className={styles.input}
                                                required
                                                defaultValue={selectedDate}
                                                onChange={(e) => {
                                                    setSelectedDate(e.target.value)
                                                    validateScheduling(e.target.value, selectedServiceId, preSelectedPetId || "")
                                                }}
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.label}>Hora *</label>
                                            <input name="time" type="time" className={styles.input} required defaultValue={selectedHourSlot ? `${selectedHourSlot}:00` : ''} />
                                        </div>
                                    </div>
                                )
                            })()}
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Observações</label>
                                <textarea name="notes" className={styles.textarea} rows={3} />
                            </div>

                            {bookingError && (
                                <div style={{ color: '#ef4444', padding: '0.5rem', background: '#fee2e2', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                    ⚠️ {bookingError}
                                </div>
                            )}

                            <div className={styles.modalActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowNewModal(false)}>Cancelar</button>
                                <button type="submit" className={styles.submitBtn} disabled={isCreatePending || !!bookingError}>Agendar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Detail/Edit Modal */}
            {showDetailModal && selectedAppointment && (
                <div className={styles.modalOverlay} onClick={() => setShowDetailModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Detalhes do Agendamento</h2>
                            <div className={styles.modalTools}>
                                    <button className={styles.editBtnSmall} onClick={() => {
                                        setEditingAppointment(selectedAppointment)
                                        setShowDetailModal(false)
                                    }}>✏️ Editar</button>
                                    <button className={styles.deleteBtnSmall} onClick={() => handleDelete()}>🗑️ Cancelar</button>
                                </div>
                            </div>

                        {selectedAppointment && (
                            <div className={styles.detailContent}>
                                <div className={styles.detailRow}>
                                    <strong>Pet:</strong> {selectedAppointment.pets?.name} ({selectedAppointment.pets?.species === 'cat' ? 'Gato' : 'Cão'})
                                </div>
                                <div className={styles.detailRow}>
                                    <strong>Serviço:</strong> {selectedAppointment.services?.name}
                                </div>
                                <div className={styles.detailRow}>
                                    <strong>Valor:</strong> R$ {(selectedAppointment.calculated_price ?? (selectedAppointment.services as any)?.base_price ?? 0).toFixed(2)}
                                </div>
                                <div className={styles.detailRow}>
                                    <strong>Data:</strong> {new Date(selectedAppointment.scheduled_at).toLocaleString('pt-BR')}
                                </div>
                                <div className={styles.detailRow}>
                                    <strong>Status:</strong> {getStatusLabel(selectedAppointment.status)}
                                </div>
                                {selectedAppointment.notes && (
                                    <div className={styles.detailRow}>
                                        <strong>Notas:</strong> {selectedAppointment.notes}
                                    </div>
                                )}

                                {/* Checklist Section */}
                                <div className={styles.checklistSection}>
                                    <h3>Checklist de Atendimento</h3>
                                    {currentChecklist.map((item, idx) => (
                                        <div key={idx} className={styles.checklistItem}>
                                            <input
                                                type="checkbox"
                                                checked={item.completed}
                                                onChange={async (e) => {
                                                    const newList = [...currentChecklist]
                                                    newList[idx].completed = e.target.checked
                                                    newList[idx].completed_at = e.target.checked ? new Date().toISOString() : null
                                                    setCurrentChecklist(newList)
                                                    await updateChecklist(selectedAppointment.id, newList)
                                                    fetchData()
                                                }}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? '#94a3b8' : 'inherit' }}>
                                                    {item.text}
                                                </span>
                                                {item.completed && item.completed_at && (
                                                    <span style={{ fontSize: '0.75rem', color: '#10b981' }}>
                                                        Concluído às {new Date(item.completed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Preferences Section */}
                                <div className={styles.preferencesParams}>
                                    <h3>Preferências do Pet</h3>
                                    <div className={styles.prefToggle}>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={selectedAppointment.pets?.perfume_allowed}
                                                onChange={async () => {
                                                    const val = !selectedAppointment.pets?.perfume_allowed
                                                    await updatePetPreferences(selectedAppointment.pets!.id, { perfume_allowed: val })
                                                    fetchData()
                                                }}
                                            /> Perfume
                                        </label>
                                    </div>
                                    <div className={styles.prefToggle}>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={selectedAppointment.pets?.accessories_allowed}
                                                onChange={async () => {
                                                    const val = !selectedAppointment.pets?.accessories_allowed
                                                    await updatePetPreferences(selectedAppointment.pets!.id, { accessories_allowed: val })
                                                    fetchData()
                                                }}
                                            /> Acessórios/Laços
                                        </label>
                                    </div>
                                </div>

                                <div className={styles.detailActions}>
                                    {selectedAppointment.status === 'pending' && (
                                        <button className={styles.confirmBtn} onClick={async () => {
                                            setSelectedAppointment({ ...selectedAppointment, status: 'confirmed' })
                                            await updateAppointmentStatus(selectedAppointment.id, 'confirmed')
                                            fetchData()
                                        }}>Confirmar Agendamento</button>
                                    )}
                                    <button className={styles.closeBtn} onClick={() => setShowDetailModal(false)}>Fechar</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Block Modal */}
            {showBlockModal && (
                <div className={styles.modalOverlay} onClick={() => setShowBlockModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>Novo Bloqueio</h2>
                        <form action={blockAction}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Motivo</label>
                                <input name="reason" className={styles.input} required placeholder="Ex: Almoço, Feriado..." />
                            </div>
                            <div className={styles.row}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Início</label>
                                    <input name="start_at" type="datetime-local" className={styles.input} required defaultValue={`${selectedDate}T08:00`} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Fim</label>
                                    <input name="end_at" type="datetime-local" className={styles.input} required defaultValue={`${selectedDate}T18:00`} />
                                </div>
                            </div>

                            <div className={styles.formGroup} style={{ marginTop: '1rem', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
                                <label className={styles.label} style={{ marginBottom: '0.8rem', display: 'block', color: '#e2e8f0' }}>Restrição de Espécie (Opcional)</label>
                                <div style={{ display: 'flex', gap: '1.5rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', color: '#f1f5f9', cursor: 'pointer' }}>
                                        <input type="checkbox" name="allowed_species[]" value="dog" style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }} /> 🐶 Permitir Cães
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', color: '#f1f5f9', cursor: 'pointer' }}>
                                        <input type="checkbox" name="allowed_species[]" value="cat" style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }} /> 🐱 Permitir Gatos
                                    </label>
                                </div>
                                <small style={{ display: 'block', marginTop: '0.8rem', color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                    ℹ️ Se ambos estiverem desmarcados, bloqueia TUDO. Se marcar um, APENAS esse será permitido.
                                </small>
                            </div>

                            <div className={styles.formGroup} style={{ marginTop: '1rem', padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
                                <label className={styles.label} style={{ marginBottom: '0.8rem', display: 'block', color: '#e2e8f0' }}>Serviços a Bloquear (Opcional)</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.8rem' }}>
                                    {Array.from(new Set(services.flatMap(s => {
                                        const sc = (s as any).service_categories
                                        const name = Array.isArray(sc) ? sc[0]?.name : sc?.name
                                        return name ? [name] : []
                                    }))).map(catName => (
                                        <label key={catName} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#f1f5f9', cursor: 'pointer' }}>
                                            <input type="checkbox" name="blocked_categories[]" value={catName} style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }} />
                                            {catName}
                                        </label>
                                    ))}
                                </div>
                                <small style={{ display: 'block', marginTop: '0.8rem', color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                    ℹ️ Deixe desmarcado para bloquear TODOS os serviços. Marque categorias específicas para bloquear APENAS elas.
                                </small>
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" className={styles.cancelBtn} onClick={() => setShowBlockModal(false)}>Cancelar</button>
                                <button type="submit" className={styles.submitBtn} disabled={isBlockPending}>
                                    {isBlockPending ? 'Bloqueando...' : 'Bloquear'}
                                </button>
                            </div>
                        </form>
                    </div >
                </div >
            )
            }
            {editingAppointment && (
                <EditAppointmentModal
                    appointment={editingAppointment as any}
                    onClose={() => setEditingAppointment(null)}
                    onSave={() => {
                        fetchData()
                        setEditingAppointment(null)
                    }}
                />
            )}
        </div >
    )
}
