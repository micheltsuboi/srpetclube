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

    // Checklist
    let checklistItems: string[] = []
    if (appt.checklist && Array.isArray(appt.checklist)) {
        checklistItems = appt.checklist.map((item: any) => item?.text || item?.label || item?.item || 'Item')
    }

    const printTimestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Comanda - ${petName}</title>
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
            font-family: 'Courier New', Courier, monospace, monospace;
            font-size: 11px;
            line-height: 1.25;
            font-weight: 500;
        }
        .ticket {
            width: 48mm;
            max-width: 48mm;
            margin: 0 auto;
            padding: 2mm 0.5mm 10mm 0.5mm;
        }
        .center {
            text-align: center;
        }
        .bold {
            font-weight: 900;
        }
        .title {
            font-size: 14px;
            font-weight: 900;
            letter-spacing: 0.5px;
            margin: 0;
        }
        .subtitle {
            font-size: 11px;
            font-weight: 700;
            margin-top: 2px;
        }
        .divider {
            border-top: 1px dashed #000000;
            margin: 4px 0;
        }
        .divider-double {
            border-top: 2px solid #000000;
            margin: 5px 0;
        }
        .row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin: 2px 0;
        }
        .label {
            font-weight: 700;
            text-transform: uppercase;
            font-size: 10px;
        }
        .value {
            font-weight: 600;
            font-size: 11px;
            text-align: right;
        }
        .pet-hero {
            border: 1.5px solid #000000;
            padding: 4px 2px;
            margin: 4px 0;
            text-align: center;
            border-radius: 2px;
        }
        .pet-name {
            font-size: 16px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            line-height: 1.1;
        }
        .pet-meta {
            font-size: 10px;
            font-weight: 600;
            margin-top: 2px;
        }
        .section-header {
            font-size: 10.5px;
            font-weight: 900;
            text-transform: uppercase;
            background: #000000;
            color: #ffffff;
            padding: 1px 3px;
            margin: 4px 0 3px 0;
            text-align: center;
            letter-spacing: 0.5px;
        }
        .box-warning {
            border: 1.5px solid #000000;
            padding: 3px;
            margin: 3px 0;
            font-size: 10.5px;
            background: #ffffff;
        }
        .checkbox-line {
            display: flex;
            align-items: center;
            margin: 2px 0;
            font-size: 11px;
        }
        .box-square {
            display: inline-block;
            width: 11px;
            height: 11px;
            border: 1.5px solid #000000;
            margin-right: 4px;
            vertical-align: middle;
            text-align: center;
            line-height: 9px;
            font-weight: 900;
            font-size: 10px;
        }
        .signature-line {
            border-top: 1px solid #000000;
            margin-top: 18px;
            margin-bottom: 2px;
        }
        .footer-text {
            font-size: 9px;
            text-align: center;
            margin-top: 4px;
            line-height: 1.2;
        }
    </style>
</head>
<body>
    <div class="ticket">
        <!-- CABEÇALHO -->
        <div class="center">
            <div class="title">SR PET CLUBE</div>
            <div class="subtitle">${subtitleHeader}</div>
            <div style="font-size: 9.5px; margin-top: 2px;">
                ${scheduledDate} às ${scheduledHour} • #${ticketId}
            </div>
        </div>

        <div class="divider-double"></div>

        <!-- PET HERO -->
        <div class="pet-hero">
            <div class="pet-name">🐾 ${petName}</div>
            <div class="pet-meta">
                ${speciesLabel.toUpperCase()} • ${breedLabel}
            </div>
            ${pet?.size || pet?.weight_kg ? `
                <div class="pet-meta">
                    ${pet?.size ? `Porte: ${pet.size.toUpperCase()}` : ''} 
                    ${pet?.weight_kg ? `• ${pet.weight_kg} kg` : ''}
                </div>
            ` : ''}
            ${ageText || pet?.color ? `
                <div class="pet-meta">
                    ${ageText ? `Idade: ${ageText}` : ''} 
                    ${pet?.color ? `• Cor: ${pet.color}` : ''}
                </div>
            ` : ''}
        </div>

        <!-- DADOS DO TUTOR -->
        <div style="margin: 3px 0;">
            <div class="row">
                <span class="label">Tutor:</span>
                <span class="value bold" style="text-align: left; max-width: 65%;">${customerName}</span>
            </div>
            ${phone1 ? `
                <div class="row">
                    <span class="label">Tel 1:</span>
                    <span class="value bold">${phone1}</span>
                </div>
            ` : ''}
            ${phone2 ? `
                <div class="row">
                    <span class="label">Tel 2:</span>
                    <span class="value">${phone2}</span>
                </div>
            ` : ''}
            ${appt.has_taxi && (address || neighborhood) ? `
                <div class="row">
                    <span class="label">Endereço:</span>
                    <span class="value" style="text-align: left; max-width: 65%; font-size: 9.5px;">
                        ${address || ''}${neighborhood ? ` - ${neighborhood}` : ''}
                    </span>
                </div>
            ` : ''}
        </div>

        <div class="divider"></div>

        <!-- SERVIÇO CONTRATADO -->
        <div class="section-header">SERVIÇO</div>
        <div style="margin: 3px 0;">
            <div style="font-size: 12px; font-weight: 900; text-transform: uppercase;">
                ${serviceName}
            </div>
            ${isPackage ? `
                <div style="font-size: 10.5px; font-weight: 800; margin-top: 1px;">
                    ⭐ ${packageBadge}
                </div>
            ` : ''}
            <div class="row" style="margin-top: 3px;">
                <span class="label">Pagamento:</span>
                <span class="value bold" style="border: 1px solid #000; padding: 0 3px;">
                    ${payStatusText} (${payMethodText})
                </span>
            </div>
            <div class="row">
                <span class="label">Valor:</span>
                <span class="value bold">${priceText}</span>
            </div>
            ${(appt.check_in_date || appt.check_out_date) ? `
                <div class="row" style="margin-top: 2px;">
                    <span class="label">Check-in:</span>
                    <span class="value bold">${formatDate(appt.check_in_date || appt.scheduled_at)}</span>
                </div>
                <div class="row">
                    <span class="label">Check-out:</span>
                    <span class="value bold">${formatDate(appt.check_out_date || '')}</span>
                </div>
            ` : ''}
            ${appt.has_taxi ? `
                <div class="row">
                    <span class="label">Táxi Dog:</span>
                    <span class="value bold">SIM ${appt.taxi_fee ? `(R$ ${Number(appt.taxi_fee).toFixed(2)})` : ''}</span>
                </div>
            ` : ''}
        </div>

        <!-- EXTRAS / ADICIONAIS -->
        ${extrasList.length > 0 || appt.has_extras ? `
            <div class="divider"></div>
            <div class="section-header">SERVIÇOS EXTRAS</div>
            <div style="margin: 2px 0;">
                ${extrasList.map(e => `
                    <div style="font-size: 10.5px; font-weight: 700;">+ ${e}</div>
                `).join('')}
                ${appt.extras_fee ? `
                    <div class="row" style="margin-top: 2px;">
                        <span class="label">Total Extras:</span>
                        <span class="value bold">R$ ${Number(appt.extras_fee).toFixed(2)}</span>
                    </div>
                ` : ''}
            </div>
        ` : ''}

        <!-- PREFERÊNCIAS ESTÉTICAS (EXCLUSIVO PARA BANHO E TOSA) -->
        ${isBanhoTosa ? `
            <div class="divider"></div>
            <div class="section-header">PREFERÊNCIAS & CUIDADOS</div>

            <!-- DESTAQUE CORTE DE UNHA -->
            <div class="box-warning" style="text-align: center;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase;">CORTE DE UNHAS</div>
                <div style="font-size: 12px; font-weight: 900; margin-top: 2px;">
                    ${nailInfo.requested ? `
                        <span style="background: #000; color: #fff; padding: 1px 4px; border-radius: 2px;">[X] SIM - CORTAR UNHAS</span>
                    ` : `
                        <span>[ ] NÃO SOLICITADO</span>
                    `}
                </div>
                ${nailInfo.reason ? `
                    <div style="font-size: 9px; margin-top: 2px;">Origem: ${nailInfo.reason}</div>
                ` : `
                    <div style="font-size: 8.5px; margin-top: 2px;">(Confirmar com tutor na entrada)</div>
                `}
            </div>

            <!-- PREFERÊNCIAS GERAIS (PERFUME E ADEREÇOS) -->
            <div style="margin: 3px 0;">
                <div class="checkbox-line">
                    <span class="box-square">${perfumeAllowed ? 'X' : '&nbsp;'}</span>
                    <span class="bold">Perfume:</span>&nbsp;${perfumeAllowed ? 'SIM (Autorizado)' : '🚫 NÃO USAR'}
                </div>
                <div class="checkbox-line">
                    <span class="box-square">${accessoriesAllowed ? 'X' : '&nbsp;'}</span>
                    <span class="bold">Laço / Adereço:</span>&nbsp;${accessoriesAllowed ? 'SIM (Autorizado)' : '🚫 NÃO COLOCAR'}
                </div>
            </div>
        ` : ''}

        <!-- ALERTAS DE SAÚDE / COMPORTAMENTO / CUIDADOS -->
        ${(pet?.allergies || pet?.medical_notes || pet?.special_care || pet?.temperament) ? `
            <div class="divider"></div>
            <div class="box-warning" style="background: #ffffff;">
                <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #000;">
                    ⚠️ CUIDADOS & COMPORTAMENTO:
                </div>
                ${pet?.temperament ? `
                    <div style="font-size: 10px; margin-top: 2px;">
                        <strong>Temperamento:</strong> ${pet.temperament}
                    </div>
                ` : ''}
                ${pet?.allergies ? `
                    <div style="font-size: 10px; margin-top: 2px;">
                        <strong>ALERGIA:</strong> ${pet.allergies}
                    </div>
                ` : ''}
                ${pet?.special_care ? `
                    <div style="font-size: 10px; margin-top: 2px;">
                        <strong>Cuidados:</strong> ${pet.special_care}
                    </div>
                ` : ''}
                ${pet?.medical_notes ? `
                    <div style="font-size: 10px; margin-top: 2px;">
                        <strong>Saúde / Medicação:</strong> ${pet.medical_notes}
                    </div>
                ` : ''}
            </div>
        ` : ''}

        <!-- OBSERVAÇÕES DO AGENDAMENTO (SOMENTE SE HOUVER OBSERVAÇÃO SALVA) -->
        ${appt.notes && appt.notes.trim() ? `
            <div class="divider"></div>
            <div style="margin: 3px 0;">
                <span class="label">Observações:</span>
                <div style="font-size: 10.5px; font-weight: 700; border: 1px dashed #000; padding: 3px; margin-top: 2px; word-break: break-word;">
                    ${appt.notes}
                </div>
            </div>
        ` : ''}

        <!-- CHECKLIST OPERACIONAL (SOMENTE SE HOUVER ITENS CADASTRADOS) -->
        ${checklistItems.length > 0 ? `
            <div class="divider"></div>
            <div class="section-header">CHECKLIST DE EXECUÇÃO</div>
            <div style="margin: 3px 0;">
                ${checklistItems.map(item => `
                    <div class="checkbox-line">
                        <span class="box-square">&nbsp;</span>
                        <span style="font-size: 10px;">${item}</span>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        <div class="divider"></div>

        <!-- CONTROLE OPERACIONAL -->
        <div style="margin: 4px 0;">
            <div class="row">
                <span class="label">Profissional:</span>
                <span class="value">________________</span>
            </div>
            <div class="row" style="margin-top: 4px;">
                <span class="label">Início: __:__</span>
                <span class="label">Término: __:__</span>
            </div>
        </div>

        <div class="signature-line"></div>
        <div class="center" style="font-size: 9px; font-weight: 600;">
            Assinatura do Tutor (Retirada)
        </div>

        <div class="divider-double" style="margin-top: 6px;"></div>

        <!-- RODAPÉ -->
        <div class="footer-text">
            <div>SR PET CLUBE • Cuidando com amor!</div>
            <div>Impresso em: ${printTimestamp}</div>
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
