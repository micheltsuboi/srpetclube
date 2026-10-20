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

// Helper para formatar data DD/MM/AAAA
function formatDate(dateStr: string): string {
    if (!dateStr) return '-'
    try {
        const d = new Date(dateStr)
        return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    } catch {
        return dateStr
    }
}

// Helper para formatar hora HH:MM
function formatTime(dateStr: string): string {
    if (!dateStr) return '-'
    try {
        const d = new Date(dateStr)
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    } catch {
        return '-'
    }
}

// Helper para calcular idade aproximada
function calculateAge(birthDateStr?: string | null): string | null {
    if (!birthDateStr) return null
    try {
        const birth = new Date(birthDateStr)
        const now = new Date()
        let years = now.getFullYear() - birth.getFullYear()
        let months = now.getMonth() - birth.getMonth()
        if (months < 0) {
            years--
            months += 12
        }
        if (years > 0) {
            return `${years} ano${years > 1 ? 's' : ''}${months > 0 ? ` e ${months}m` : ''}`
        }
        if (months > 0) {
            return `${months} mês${months > 1 ? 'es' : ''}`
        }
        return 'Filhote'
    } catch {
        return null
    }
}

// Helper para verificar se corte de unha foi requisitado
function checkNailCutRequested(appt: ThermalAppointment, pet?: ThermalPet | null): { requested: boolean; reason?: string } {
    // 1. Verificar em extras
    if (appt.extras) {
        const extrasStr = typeof appt.extras === 'string' ? appt.extras : JSON.stringify(appt.extras)
        if (/unha/i.test(extrasStr)) {
            return { requested: true, reason: 'Serviço Extra Solicitado' }
        }
    }
    // 2. Verificar no checklist
    if (appt.checklist && Array.isArray(appt.checklist)) {
        const found = appt.checklist.some((item: any) => {
            const label = item?.text || item?.label || item?.item || ''
            return /unha/i.test(label)
        })
        if (found) {
            return { requested: true, reason: 'Incluso no Checklist' }
        }
    }
    // 3. Verificar em observações do agendamento
    if (appt.notes && /cortar\s*unha|corte\s*de\s*unha|fazer\s*unha|aparar\s*unha/i.test(appt.notes)) {
        return { requested: true, reason: 'Observação do Agendamento' }
    }
    // 4. Verificar em cuidados especiais do pet
    if (pet?.special_care && /cortar\s*unha|corte\s*de\s*unha/i.test(pet.special_care)) {
        return { requested: true, reason: 'Cuidados Especiais do Pet' }
    }
    return { requested: false }
}

// Constrói o HTML formatado para bobina térmica de 58mm (Knup KP-IM607 / POS58)
function buildTicketHtml(appt: ThermalAppointment, pet: ThermalPet | null, customer: ThermalCustomer | null): string {
    const petName = pet?.name || 'Pet'
    const speciesLabel = pet?.species === 'cat' ? 'Felino' : pet?.species === 'dog' ? 'Canino' : pet?.species || 'Pet'
    const breedLabel = pet?.breed || 'Sem raça definida'
    const customerName = customer?.name || pet?.customers?.name || 'Cliente'
    const phone1 = customer?.phone_1 || pet?.customers?.phone_1 || null
    const phone2 = customer?.phone_2 || pet?.customers?.phone_2 || null
    const address = customer?.address || pet?.customers?.address || null
    const neighborhood = customer?.neighborhood || pet?.customers?.neighborhood || null

    const serviceName = appt.services?.name || 'Serviço'
    const catRaw = (appt.services as any)?.service_categories || (appt as any).category
    const catName = typeof catRaw === 'string' ? catRaw : ((Array.isArray(catRaw) ? catRaw[0]?.name : catRaw?.name) || '')
    const combinedService = `${serviceName} ${catName}`.toLowerCase()

    const isCreche = combinedService.includes('creche') || combinedService.includes('day care')
    const isHospedagem = combinedService.includes('hospedagem') || combinedService.includes('hotel')
    const isBanhoTosa = !isCreche && !isHospedagem

    let subtitleHeader = 'FICHA DE ATENDIMENTO'
    if (isCreche) subtitleHeader = 'FICHA DE CRECHE'
    else if (isHospedagem) subtitleHeader = 'FICHA DE HOSPEDAGEM'
    else if (isBanhoTosa) subtitleHeader = 'FICHA DE BANHO E TOSA'

    const scheduledDate = formatDate(appt.scheduled_at)
    const scheduledHour = formatTime(appt.scheduled_at)
    const ticketId = (appt.id || '').slice(0, 8).toUpperCase()

    // Identificação de pacote
    const isPackage = !!(appt.package_credit_id || appt.package_slot_id)
    const pgRaw = appt.package_credits || appt.package_schedule_slots
    const pg = Array.isArray(pgRaw) ? pgRaw[0] : pgRaw
    const totalSessions = pg?.total_quantity || null
    const usageIndex = appt.package_usage_index || null
    let packageBadge = ''
    if (isPackage) {
        if (usageIndex && totalSessions) {
            packageBadge = `PACOTE (Sessão ${Math.min(usageIndex, totalSessions)} de ${totalSessions})`
        } else if (usageIndex) {
            packageBadge = `PACOTE (Sessão ${usageIndex})`
        } else if (totalSessions) {
            packageBadge = `PACOTE (${totalSessions} sessões)`
        } else {
            packageBadge = 'PACOTE MENSAL'
        }
    }

    // Pagamento
    const cp = pg?.customer_packages ? (Array.isArray(pg.customer_packages) ? pg.customer_packages[0] : pg.customer_packages) : null
    const isPaid = (isPackage ? cp?.payment_status : appt.payment_status) === 'paid'
    const payStatusText = isPaid ? 'PAGO' : 'PENDENTE'
    const payMethodText = (isPackage ? cp?.payment_method : appt.payment_method) || (isPaid ? 'Confirmado' : 'A Cobrar')

    let priceText = ''
    if (!isPackage) {
        const finalPrice = appt.final_price ?? appt.calculated_price ?? appt.services?.base_price ?? 0
        priceText = `R$ ${Number(finalPrice).toFixed(2)}`
    } else {
        priceText = 'Incluso no Pacote'
    }

    // Extras
    let extrasList: string[] = []
    if (appt.extras) {
        if (Array.isArray(appt.extras)) {
            extrasList = appt.extras.map((e: any) => typeof e === 'string' ? e : (e.name ? `${e.name}${e.price ? ` (R$ ${Number(e.price).toFixed(2)})` : ''}` : JSON.stringify(e)))
        } else if (typeof appt.extras === 'object') {
            extrasList = Object.entries(appt.extras).map(([k, v]) => `${k}: ${v}`)
        } else if (typeof appt.extras === 'string') {
            extrasList = [appt.extras]
        }
    }

    // Corte de unha
    const nailInfo = checkNailCutRequested(appt, pet)

    // Preferências
    const perfumeAllowed = pet?.perfume_allowed !== false
    const accessoriesAllowed = pet?.accessories_allowed !== false

    // Idade
    const ageText = calculateAge(pet?.birth_date)

    // Status do agendamento
    const getStatusText = (st?: string | null) => {
        switch (st) {
            case 'pending': return '⏳ Pendente'
            case 'confirmed': return '✅ Confirmado'
            case 'in_progress': return '🔥 Em Andamento'
            case 'done': return '🏁 Finalizado'
            case 'completed': return '✔️ Concluído'
            case 'cancelled': return '❌ Cancelado'
            case 'no_show': return '❌ Falta'
            default: return st || 'Pendente'
        }
    }
    const statusLabel = getStatusText(appt.status)

    // Checklist
    let checklistItems: string[] = []
    if (appt.checklist && Array.isArray(appt.checklist)) {
        checklistItems = appt.checklist.map((item: any) => item?.text || item?.label || item?.item || 'Item')
    }

    // Se não houver itens cadastrados no agendamento, gera checklist padrão operacional do serviço
    if (checklistItems.length === 0) {
        if (isBanhoTosa) {
            checklistItems = [
                'Recepção e Avaliação da pele/pelagem',
                'Escovação prévia e Desembolo',
                'Banho e Aplicação de Shampoo',
                'Secagem e Soprador',
                'Tosa / Higiênica / Acabamento',
                'Limpeza de Ouvidos e Olhos',
                'Finalização e Conferência geral'
            ]
        } else if (isCreche) {
            checklistItems = [
                'Triagem de entrada e pertences',
                'Alimentação / Hidratação monitorada',
                'Atividades e Socialização',
                'Descanso e Relaxamento',
                'Higienização para saída'
            ]
        } else if (isHospedagem) {
            checklistItems = [
                'Check-in e Conferência de pertences',
                'Medicação / Dieta conforme tutor',
                'Rotina de passeios e brincadeiras',
                'Higienização do canil/gatil',
                'Check-out e Devolução de itens'
            ]
        }
    }

    const printTimestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Detalhes do Agendamento - ${petName}</title>
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
            padding: 2mm 0.5mm 6mm 0.5mm;
        }
        .center {
            text-align: center;
        }
        .bold {
            font-weight: 800;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #000000;
            padding-bottom: 3px;
            margin-bottom: 4px;
        }
        .header-brand {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .header-title {
            font-size: 13px;
            font-weight: 900;
            margin-top: 1px;
            text-transform: uppercase;
            line-height: 1.15;
        }
        .header-badge {
            font-size: 9px;
            font-weight: 800;
            background: #000000;
            color: #ffffff;
            padding: 1px 4px;
            border-radius: 2px;
            display: inline-block;
            margin-top: 2px;
        }
        .header-meta {
            font-size: 9px;
            font-weight: 600;
            margin-top: 2px;
        }
        /* Cartão de campo estilo modal */
        .field-card {
            border: 1px solid #000000;
            border-radius: 3px;
            padding: 3px 4px;
            margin: 2.5px 0;
            background: #ffffff;
            font-size: 10.5px;
            line-height: 1.25;
            word-break: break-word;
        }
        .field-label {
            font-weight: 900;
            margin-right: 3px;
        }
        .field-value {
            font-weight: 600;
        }
        /* Seções de checklist e preferências */
        .box-section {
            border: 1.5px solid #000000;
            border-radius: 3px;
            padding: 3px 4px;
            margin: 4px 0;
            background: #ffffff;
        }
        .box-title {
            font-size: 10.5px;
            font-weight: 900;
            text-transform: uppercase;
            border-bottom: 1px solid #000000;
            padding-bottom: 2px;
            margin-bottom: 3px;
            letter-spacing: 0.3px;
        }
        .check-row {
            display: flex;
            align-items: flex-start;
            margin: 2.5px 0;
            font-size: 10px;
            line-height: 1.2;
        }
        .check-square {
            display: inline-block;
            width: 11px;
            height: 11px;
            border: 1.5px solid #000000;
            border-radius: 2px;
            margin-right: 4px;
            margin-top: 0.5px;
            text-align: center;
            line-height: 9px;
            font-weight: 900;
            font-size: 9px;
            flex-shrink: 0;
        }
        .alert-highlight {
            border: 1.5px solid #000000;
            background: #f1f1f1;
            padding: 3px 4px;
            margin: 3px 0;
            font-size: 10px;
        }
        .footer {
            font-size: 8.5px;
            text-align: center;
            margin-top: 6px;
            line-height: 1.2;
            border-top: 1px dashed #000000;
            padding-top: 4px;
        }
    </style>
</head>
<body>
    <div class="ticket">
        <!-- CABEÇALHO -->
        <div class="header">
            <div class="header-brand">SR PET CLUBE</div>
            <div class="header-title">Detalhes do Agendamento</div>
            <div class="header-badge">CONTROLE INTERNO</div>
            <div class="header-meta">
                #${ticketId} • Impresso em: ${printTimestamp}
            </div>
        </div>

        <!-- CAMPOS PRINCIPAIS ESTILO MODAL -->
        <div class="field-card">
            <span class="field-label">Pet:</span>
            <span class="field-value">${petName} (${speciesLabel}${pet?.breed ? ` • ${breedLabel}` : ''}${pet?.size ? ` • Porte ${pet.size.toUpperCase()}` : ''}${pet?.weight_kg ? ` • ${pet.weight_kg}kg` : ''})</span>
        </div>

        <div class="field-card">
            <span class="field-label">Tutor:</span>
            <span class="field-value">${customerName}${phone1 ? ` • Tel: ${phone1}` : ''}</span>
        </div>

        <div class="field-card">
            <span class="field-label">Serviço:</span>
            <span class="field-value bold">${serviceName}</span>
            ${isPackage ? `<div style="font-size: 9.5px; font-weight: 800; margin-top: 1px;">⭐ ${packageBadge}</div>` : ''}
        </div>

        <div class="field-card">
            <span class="field-label">Valor:</span>
            <span class="field-value bold">${priceText}</span>
            <span style="font-size: 9px; margin-left: 4px;">(${payStatusText} - ${payMethodText})</span>
        </div>

        <div class="field-card">
            <span class="field-label">Data:</span>
            <span class="field-value">${scheduledDate}, ${scheduledHour}</span>
        </div>

        <div class="field-card">
            <span class="field-label">Status:</span>
            <span class="field-value bold">${statusLabel}</span>
        </div>

        ${appt.notes && appt.notes.trim() ? `
        <div class="field-card" style="border: 1.5px dashed #000;">
            <span class="field-label">Notas:</span>
            <span class="field-value">${appt.notes}</span>
        </div>
        ` : ''}

        ${extrasList.length > 0 ? `
        <div class="field-card">
            <span class="field-label">Extras:</span>
            <span class="field-value">${extrasList.join(', ')}</span>
        </div>
        ` : ''}

        <!-- CHECKLIST DE ATENDIMENTO -->
        <div class="box-section">
            <div class="box-title">Checklist de Atendimento</div>
            ${checklistItems.map(item => `
                <div class="check-row">
                    <span class="check-square">&nbsp;</span>
                    <span>${item}</span>
                </div>
            `).join('')}
        </div>

        <!-- PREFERÊNCIAS DO PET & CUIDADOS (COM OS CHECKS SOLICITADOS) -->
        <div class="box-section">
            <div class="box-title">Preferências do Pet</div>
            
            <div class="check-row">
                <span class="check-square">${perfumeAllowed ? 'X' : '&nbsp;'}</span>
                <span><strong>Perfume:</strong> ${perfumeAllowed ? 'SIM (Autorizado)' : '🚫 NÃO USAR'}</span>
            </div>

            <div class="check-row">
                <span class="check-square">${accessoriesAllowed ? 'X' : '&nbsp;'}</span>
                <span><strong>Acessórios/Laços:</strong> ${accessoriesAllowed ? 'SIM (Autorizado)' : '🚫 NÃO COLOCAR'}</span>
            </div>

            ${isBanhoTosa ? `
            <div class="check-row">
                <span class="check-square">${nailInfo.requested ? 'X' : '&nbsp;'}</span>
                <span><strong>Corte de Unha:</strong> ${nailInfo.requested ? 'SIM (Solicitado)' : 'NÃO SOLICITADO'}</span>
            </div>
            ` : ''}

            <!-- ALERGIAS -->
            <div class="check-row" style="margin-top: 3px;">
                <span class="check-square">${pet?.allergies ? 'X' : '&nbsp;'}</span>
                <span>
                    <strong>Alergias?</strong> 
                    ${pet?.allergies ? `<span style="background: #000; color: #fff; padding: 0 3px; font-weight: 800;">${pet.allergies.toUpperCase()}</span>` : 'Nenhuma relatada / Outras: _______'}
                </span>
            </div>

            <!-- OUTROS -->
            <div class="check-row" style="margin-top: 3px;">
                <span class="check-square">${pet?.special_care ? 'X' : '&nbsp;'}</span>
                <span>
                    <strong>Outros:</strong> 
                    ${pet?.special_care ? `<span>${pet.special_care}</span>` : '___________________________'}
                </span>
            </div>
        </div>

        <!-- ALERTAS EXTRAS DE SAÚDE OU COMPORTAMENTO -->
        ${(pet?.temperament || pet?.medical_notes) ? `
        <div class="alert-highlight">
            <div style="font-weight: 900; text-transform: uppercase;">⚠️ CUIDADOS ADICIONAIS:</div>
            ${pet?.temperament ? `<div><strong>Temperamento:</strong> ${pet.temperament}</div>` : ''}
            ${pet?.medical_notes ? `<div><strong>Saúde/Medicamento:</strong> ${pet.medical_notes}</div>` : ''}
        </div>
        ` : ''}

        <!-- CONTROLE OPERACIONAL DA EQUIPE -->
        <div class="box-section">
            <div class="box-title">Controle Operacional</div>
            <div style="font-size: 10px; margin: 2px 0;">
                <strong>Profissional:</strong> _______________________
            </div>
            <div style="font-size: 10px; margin: 3px 0; display: flex; justify-content: space-between;">
                <span><strong>Início:</strong> __:__</span>
                <span><strong>Término:</strong> __:__</span>
            </div>
            <div style="font-size: 9.5px; margin-top: 3px;">
                <strong>Obs. Interna:</strong> ______________________
            </div>
        </div>

        <!-- RODAPÉ -->
        <div class="footer">
            <div>SR PET CLUBE • FICHA DE CONTROLE INTERNO</div>
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
        let petData = appointment.pets || null
        let customerData = petData?.customers || null

        // Se faltar informações vitais do pet (como telefone, alergias ou peso), busca no banco
        const petId = appointment.pet_id || (petData as any)?.id
        if (petId && (!customerData?.phone_1 || petData?.special_care === undefined || petData?.allergies === undefined)) {
            try {
                const sb = supabaseInstance || createClient()
                const { data: fullPet } = await sb
                    .from('pets')
                    .select(`
                        id, name, species, breed, color, size, weight_kg, birth_date,
                        perfume_allowed, accessories_allowed, special_care, medical_notes, allergies, temperament, is_adapted,
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

        const html = buildTicketHtml(appointment, petData, customerData)

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
