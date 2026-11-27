import { createClient } from '@/lib/supabase/client'

export interface ThermalCustomer {
    id?: string
    name?: string | null
    phone_1?: string | null
    phone_2?: string | null
    address?: string | null
    neighborhood?: string | null
    city?: string | null
}

export interface ThermalPet {
    id?: string
    name: string
    species?: string | null
    breed?: string | null
    color?: string | null
    size?: string | null
    weight_kg?: number | null
    birth_date?: string | null
    gender?: string | null
    perfume_allowed?: boolean | null
    accessories_allowed?: boolean | null
    special_care?: string | null
    medical_notes?: string | null
    allergies?: string | null
    temperament?: string | null
    existing_conditions?: string | null
    is_adapted?: boolean | null
    customers?: ThermalCustomer | null
}

export interface ThermalService {
    id?: string
    name: string
    base_price?: number | null
    duration_minutes?: number | null
    service_categories?: {
        name?: string
        color?: string
        icon?: string
    } | null
}

export interface ThermalAppointment {
    id: string
    pet_id?: string
    service_id?: string
    scheduled_at: string
    status?: string | null
    notes?: string | null
    checklist?: any
    actual_check_in?: string | null
    actual_check_out?: string | null
    check_in_date?: string | null
    check_out_date?: string | null
    calculated_price?: number | null
    final_price?: number | null
    discount_percent?: number | null
    payment_status?: string | null
    payment_method?: string | null
    paid_at?: string | null
    has_taxi?: boolean | null
    taxi_fee?: number | null
    has_extras?: boolean | null
    extras_fee?: number | null
    extras?: any
    package_credit_id?: string | null
    package_slot_id?: string | null
    package_usage_index?: number | null
    package_credits?: any
    package_schedule_slots?: any
    pets?: ThermalPet | null
    services?: ThermalService | null
}

function escapeHtml(value: unknown): string {
    if (value === null || value === undefined) return ''
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// Helper para formatar data DD/MM/AAAA
function formatDate(dateStr?: string | null): string {
    if (!dateStr) return '___/___/___'
    try {
        const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T12:00:00` : dateStr
        const d = new Date(normalized)
        if (isNaN(d.getTime())) return '___/___/___'
        return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    } catch {
        return '___/___/___'
    }
}

// Helper para formatar hora HH:MM
function formatTime(dateStr?: string | null): string {
    if (!dateStr) return '_____'
    try {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return '_____'
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    } catch {
        return '_____'
    }
}

// Constrói o HTML formatado para bobina térmica de 58mm (Knup KP-IM607 / POS58)
function buildTicketHtml(appt: ThermalAppointment, pet: ThermalPet | null, customer: ThermalCustomer | null): string {
    const rawPetName = pet?.name?.trim() || ''
    const rawBreed = pet?.breed?.trim() || ''
    const petDisplay = rawPetName
        ? `${escapeHtml(rawPetName)}${rawBreed ? ` (${escapeHtml(rawBreed)})` : ''}`
        : '<span class="blank-fill">&nbsp;</span>'

    const rawCustomerName = (customer?.name || pet?.customers?.name || '').trim()
    const tutorDisplay = rawCustomerName
        ? escapeHtml(rawCustomerName)
        : '<span class="blank-fill">&nbsp;</span>'

    const serviceName = escapeHtml(appt.services?.name || '')
    const catRaw = (appt.services as any)?.service_categories || (appt as any).category
    const catName = typeof catRaw === 'string' ? catRaw : ((Array.isArray(catRaw) ? catRaw[0]?.name : catRaw?.name) || '')
    const combinedService = `${appt.services?.name || ''} ${catName}`.toLowerCase()
    const isHospedagem = combinedService.includes('hospedagem') || combinedService.includes('hotel')

    // Identificação de pacote e sessão X de Y
    const isPackage = !!(appt.package_credit_id || appt.package_slot_id)
    const pgRaw = appt.package_credits || appt.package_schedule_slots
    const pg = Array.isArray(pgRaw) ? pgRaw[0] : pgRaw
    const cp = pg?.customer_packages ? (Array.isArray(pg.customer_packages) ? pg.customer_packages[0] : pg.customer_packages) : null
    const allCredits = cp?.package_credits
    const globalTotal = Array.isArray(allCredits)
        ? allCredits.reduce((sum: number, c: any) => sum + (Number(c.total_quantity) || 0), 0)
        : 0
    const totalSessions = globalTotal || pg?.total_quantity || null
    const usageIndex = appt.package_usage_index || null

    let serviceDisplay = serviceName || '<span class="blank-fill">&nbsp;</span>'
    if (isPackage) {
        const sessionCurrent = usageIndex
            ? String(totalSessions ? Math.min(usageIndex, totalSessions) : usageIndex)
            : '___'
        const sessionTotal = totalSessions ? String(totalSessions) : '___'
        serviceDisplay = `${serviceName ? `${serviceName} • ` : ''}PACOTE – Sessão ${sessionCurrent} de ${sessionTotal}`
    }

    // Extras (se houver)
    let extrasList: string[] = []
    if (appt.extras) {
        if (Array.isArray(appt.extras)) {
            extrasList = appt.extras
                .map((e: any) => (typeof e === 'string' ? e : (e?.name || '')))
                .filter(Boolean)
                .map(escapeHtml)
        } else if (typeof appt.extras === 'string') {
            try {
                const parsed = JSON.parse(appt.extras)
                if (Array.isArray(parsed)) {
                    extrasList = parsed.map((e: any) => escapeHtml(typeof e === 'string' ? e : e?.name || '')).filter(Boolean)
                } else if (appt.extras.trim()) {
                    extrasList = [escapeHtml(appt.extras.trim())]
                }
            } catch {
                if (appt.extras.trim()) extrasList = [escapeHtml(appt.extras.trim())]
            }
        }
    }

    // Data e hora (ou check-in/check-out para hospedagem)
    const scheduledDate = formatDate(appt.scheduled_at)
    const scheduledHour = formatTime(appt.scheduled_at)
    const hasCheckInOutDates = isHospedagem && appt.check_in_date && appt.check_out_date
    const dateLineHtml = hasCheckInOutDates
        ? `<div class="date-row"><span><span class="field-label">Check-in:</span> <span class="field-value">${formatDate(appt.check_in_date)}</span></span><span><span class="field-label">Check-out:</span> <span class="field-value">${formatDate(appt.check_out_date)}</span></span></div>`
        : `<div class="date-row"><span><span class="field-label">Data:</span> <span class="field-value">${scheduledDate}</span></span><span><span class="field-label">Hora:</span> <span class="field-value">${scheduledHour}</span></span></div>`

    // Preferências do pet (boolean estrito: true => Sim marcado, false => Não marcado, null/undefined => nenhum marcado)
    const perfumeSim = pet?.perfume_allowed === true ? 'X' : '&nbsp;'
    const perfumeNao = pet?.perfume_allowed === false ? 'X' : '&nbsp;'
    const acessSim = pet?.accessories_allowed === true ? 'X' : '&nbsp;'
    const acessNao = pet?.accessories_allowed === false ? 'X' : '&nbsp;'

    const allergiesText = pet?.allergies?.trim() ? escapeHtml(pet.allergies.trim()) : ''
    const otherParts = [
        pet?.special_care?.trim(),
        pet?.medical_notes?.trim(),
        pet?.existing_conditions?.trim(),
        pet?.temperament?.trim()
    ].filter((v): v is string => !!v)
    const othersText = otherParts.length > 0 ? escapeHtml(otherParts.join(' • ')) : ''

    // Checklist de atendimento: se houver itens customizados no agendamento usa eles, senão os 4 itens exatos do modelo
    let checklistItems: string[] = []
    if (appt.checklist && Array.isArray(appt.checklist) && appt.checklist.length > 0) {
        checklistItems = appt.checklist
            .map((item: any) => escapeHtml(item?.text || item?.label || item?.item || ''))
            .filter(Boolean)
    }
    if (checklistItems.length === 0) {
        checklistItems = [
            'Corte de unha',
            'Tosa higiênica',
            'Limpeza de ouvido',
            'Escovar dentes'
        ]
    }

    const notesText = appt.notes?.trim() ? escapeHtml(appt.notes.trim()) : ''

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Comanda de Atendimento - ${escapeHtml(rawPetName || 'Pet')}</title>
    <style>
        @page {
            size: 58mm auto;
            margin: 0mm;
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #000000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 11px;
            line-height: 1.25;
        }
        .ticket {
            width: 48mm;
            max-width: 48mm;
            margin: 0 auto;
            padding: 2.5mm 0.5mm 6mm 0.5mm;
        }
        .header {
            text-align: center;
            padding-bottom: 4px;
        }
        .header-brand {
            font-size: 14px;
            font-weight: 900;
            letter-spacing: 0.4px;
            text-transform: uppercase;
            line-height: 1.15;
        }
        .header-title {
            font-size: 13px;
            font-weight: 900;
            text-transform: uppercase;
            line-height: 1.15;
            margin-top: 1px;
        }
        .header-badge {
            font-size: 9.5px;
            font-weight: 800;
            background: #000000;
            color: #ffffff;
            padding: 2px 10px;
            border-radius: 999px;
            display: inline-block;
            margin-top: 4px;
            letter-spacing: 0.4px;
            text-transform: uppercase;
        }
        .double-divider {
            border-top: 1.5px solid #000000;
            border-bottom: 1.5px solid #000000;
            height: 4px;
            margin: 5px 0;
        }
        .field-card {
            border: 1.5px solid #000000;
            border-radius: 6px;
            padding: 4px 6px;
            margin: 3.5px 0;
            background: #ffffff;
            font-size: 10.5px;
            line-height: 1.3;
            word-break: break-word;
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            gap: 3px;
        }
        .field-label {
            font-weight: 900;
            white-space: nowrap;
        }
        .field-value {
            font-weight: 600;
        }
        .blank-fill {
            flex: 1;
            min-width: 60px;
            border-bottom: 1px solid #000000;
            display: inline-block;
            height: 11px;
        }
        .service-extras {
            width: 100%;
            font-size: 9.5px;
            font-weight: 600;
            margin-top: 2px;
            padding-top: 2px;
            border-top: 1px dashed #000000;
        }
        .date-row {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 4px;
            flex-wrap: wrap;
        }
        .section-title {
            text-align: center;
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            margin: 3px 0 4px 0;
        }
        .box-section {
            border: 1.5px solid #000000;
            border-radius: 6px;
            padding: 5px 6px;
            margin: 3px 0;
            background: #ffffff;
        }
        .pref-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 4px;
            margin: 3px 0;
            font-size: 10.5px;
        }
        .pref-options {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .pref-opt {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            font-weight: 600;
        }
        .pref-line-row {
            display: flex;
            align-items: baseline;
            gap: 4px;
            margin: 4px 0 2px 0;
            font-size: 10.5px;
            word-break: break-word;
        }
        .check-row {
            display: flex;
            align-items: center;
            margin: 4px 0;
            font-size: 10.5px;
            line-height: 1.25;
            font-weight: 600;
        }
        .check-square {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 12px;
            height: 12px;
            border: 1.5px solid #000000;
            border-radius: 2px;
            margin-right: 6px;
            font-weight: 900;
            font-size: 9.5px;
            line-height: 1;
            flex-shrink: 0;
        }
        .obs-title {
            font-size: 10.5px;
            font-weight: 900;
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        .obs-text {
            font-size: 10px;
            font-weight: 600;
            margin-bottom: 4px;
            word-break: break-word;
            line-height: 1.3;
        }
        .ruled-line {
            border-bottom: 1px solid #000000;
            height: 14px;
            width: 100%;
        }
        .footer {
            font-size: 8.5px;
            text-align: center;
            margin-top: 4px;
            line-height: 1.3;
        }
        .footer-title {
            font-weight: 900;
        }
    </style>
</head>
<body>
    <div class="ticket">
        <!-- CABEÇALHO -->
        <div class="header">
            <div class="header-brand">SR PET CLUBE</div>
            <div class="header-title">COMANDA DE<br>ATENDIMENTO</div>
            <div class="header-badge">CONTROLE INTERNO</div>
        </div>

        <div class="double-divider"></div>

        <!-- IDENTIFICAÇÃO -->
        <div class="field-card">
            <span class="field-label">Pet:</span>
            <span class="field-value">${petDisplay}</span>
        </div>

        <div class="field-card">
            <span class="field-label">Tutor:</span>
            <span class="field-value">${tutorDisplay}</span>
        </div>

        <div class="field-card">
            <span class="field-label">Serviço:</span>
            <span class="field-value">${serviceDisplay}</span>
            ${extrasList.length > 0 ? `<div class="service-extras"><strong>Extras:</strong> ${extrasList.join(', ')}</div>` : ''}
        </div>

        <div class="field-card">
            ${dateLineHtml}
        </div>

        <div class="double-divider"></div>

        <!-- PREFERÊNCIAS DO PET -->
        <div class="section-title">PREFERÊNCIAS DO PET</div>
        <div class="box-section">
            <div class="pref-row">
                <span class="field-label">Perfume:</span>
                <span class="pref-options">
                    <span class="pref-opt"><span class="check-square" style="margin-right:3px;">${perfumeSim}</span> Sim</span>
                    <span class="pref-opt"><span class="check-square" style="margin-right:3px;">${perfumeNao}</span> Não</span>
                </span>
            </div>

            <div class="pref-row">
                <span class="field-label">Acessórios:</span>
                <span class="pref-options">
                    <span class="pref-opt"><span class="check-square" style="margin-right:3px;">${acessSim}</span> Sim</span>
                    <span class="pref-opt"><span class="check-square" style="margin-right:3px;">${acessNao}</span> Não</span>
                </span>
            </div>

            <div class="pref-line-row">
                <span class="field-label">Alergias:</span>
                ${allergiesText ? `<span class="field-value">${allergiesText}</span>` : '<span class="blank-fill">&nbsp;</span>'}
            </div>

            <div class="pref-line-row">
                <span class="field-label">Outros:</span>
                ${othersText ? `<span class="field-value">${othersText}</span>` : '<span class="blank-fill">&nbsp;</span>'}
            </div>
        </div>

        <div class="double-divider"></div>

        <!-- CHECKLIST DE ATENDIMENTO -->
        <div class="section-title">CHECKLIST DE ATENDIMENTO</div>
        <div class="box-section">
            ${checklistItems.map(item => `
                <div class="check-row">
                    <span class="check-square">&nbsp;</span>
                    <span>${item}</span>
                </div>
            `).join('')}
        </div>

        <div class="double-divider"></div>

        <!-- OBSERVAÇÕES -->
        <div class="box-section">
            <div class="obs-title">OBSERVAÇÕES:</div>
            ${notesText
                ? `<div class="obs-text">${notesText}</div><div class="ruled-line"></div><div class="ruled-line"></div>`
                : `<div class="ruled-line"></div><div class="ruled-line"></div><div class="ruled-line"></div><div class="ruled-line"></div>`
            }
        </div>

        <div class="double-divider"></div>

        <!-- RODAPÉ -->
        <div class="footer">
            <div class="footer-title">SR PET CLUBE • FICHA DE CONTROLE INTERNO</div>
            <div>Uso exclusivo da equipe operacional</div>
        </div>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.focus();
                window.print();
            }, 250);
        };
    </script>
</body>
</html>
    `
}

/**
 * Função principal chamada nos botões da interface:
 * Dispara a impressão da comanda térmica em 58mm.
 */
export async function printThermalTicket(appointment: ThermalAppointment, supabaseInstance?: any): Promise<void> {
    try {
        let apptData: ThermalAppointment = { ...appointment }
        let petData = appointment.pets || null
        let customerData = petData?.customers || null

        const sb = supabaseInstance || createClient()

        // Se faltar informações vitais do pet ou preferências (perfume, acessórios, alergias, cuidados), busca no banco
        const petId = appointment.pet_id || (petData as any)?.id
        const needsPetComplement =
            petData?.perfume_allowed === undefined ||
            petData?.accessories_allowed === undefined ||
            petData?.allergies === undefined ||
            petData?.special_care === undefined ||
            petData?.medical_notes === undefined ||
            petData?.existing_conditions === undefined ||
            !customerData?.name

        if (petId && needsPetComplement) {
            try {
                const { data: fullPet } = await sb
                    .from('pets')
                    .select(`
                        id, name, species, breed, color, size, weight_kg, birth_date,
                        perfume_allowed, accessories_allowed, special_care, medical_notes, allergies, temperament, existing_conditions, is_adapted,
                        customers ( id, name, phone_1, phone_2, address, neighborhood, city )
                    `)
                    .eq('id', petId)
                    .single()

                if (fullPet) {
                    petData = {
                        ...petData,
                        ...fullPet,
                        customers: Array.isArray(fullPet.customers) ? fullPet.customers[0] : fullPet.customers
                    }
                    customerData = petData?.customers || customerData
                }
            } catch (err) {
                console.warn('[printThermalTicket] Não foi possível complementar dados do pet via Supabase:', err)
            }
        }

        // Se for pacote e não tiver sessão/total completo carregado, busca os vínculos do agendamento
        const isPkg = !!(apptData.package_credit_id || apptData.package_slot_id)
        const existingPg = Array.isArray(apptData.package_credits) ? apptData.package_credits[0] : apptData.package_credits
        if (isPkg && apptData.id && (!apptData.package_usage_index || !existingPg?.total_quantity)) {
            try {
                const { data: fullAppt } = await sb
                    .from('appointments')
                    .select(`
                        package_usage_index,
                        package_credit_id,
                        package_credits (
                            total_quantity,
                            customer_packages (
                                package_credits ( total_quantity )
                            )
                        )
                    `)
                    .eq('id', apptData.id)
                    .single()

                if (fullAppt) {
                    apptData = {
                        ...apptData,
                        package_usage_index: apptData.package_usage_index ?? fullAppt.package_usage_index,
                        package_credits: apptData.package_credits ?? fullAppt.package_credits
                    }
                }
            } catch (err) {
                console.warn('[printThermalTicket] Não foi possível complementar dados do pacote via Supabase:', err)
            }
        }

        const html = buildTicketHtml(apptData, petData, customerData)

        // Criar iframe oculto para impressão limpa
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = '0'
        iframe.setAttribute('title', 'Impressão Comanda Térmica')

        document.body.appendChild(iframe)

        const doc = iframe.contentWindow?.document || iframe.contentDocument
        if (!doc) {
            // Fallback caso iframe falhe: abrir popup window
            const win = window.open('', '_blank', 'width=380,height=600')
            if (win) {
                win.document.open()
                win.document.write(html)
                win.document.close()
            }
            return
        }

        doc.open()
        doc.write(html)
        doc.close()

        // Remove iframe após alguns segundos
        setTimeout(() => {
            try {
                if (iframe.parentNode) {
                    iframe.parentNode.removeChild(iframe)
                }
            } catch {
                // ignore
            }
        }, 10000)

    } catch (error) {
        console.error('Erro ao imprimir comanda térmica:', error)
        alert('Não foi possível gerar a comanda para impressão. Detalhes no console.')
    }
}
