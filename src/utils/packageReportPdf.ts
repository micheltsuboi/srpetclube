import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface PackageReportPetInfo {
    name: string
    breed?: string | null
    species?: string | null
    customers?: {
        name?: string | null
        phone_1?: string | null
    } | null
}

export interface PackageReportServiceInfo {
    service_name: string
    total_qty: number
    used_qty: number
}

export interface PackageReportData {
    name: string
    referenceMonth?: string | null
    purchased_at?: string | null
    expires_at?: string | null
    payment_status?: string | null
    payment_method?: string | null
    paid_at?: string | null
    calculated_price?: number | null
    total_paid?: number | null
    discount_percent?: number | null
    has_taxi?: boolean | null
    taxi_fee?: number | null
    services?: PackageReportServiceInfo[]
    package_extras?: Array<{ name: string, price: number, sessionDate?: string | null }>
    total_extras_fee?: number | null
    has_pending_extras?: boolean
}

export interface PackageReportSlot {
    slot_date: string
    slot_time?: string | null
    status: string
    services?: {
        name?: string
    } | null
    has_extras?: boolean
    extras_fee?: number | null
    extras?: Array<{ name: string, price: number }>
    has_taxi?: boolean
    taxi_fee?: number | null
}

export function exportPackageSessionsPDF({
    pet,
    packageData,
    slots
}: {
    pet: PackageReportPetInfo
    packageData: PackageReportData
    slots: PackageReportSlot[]
}) {
    const doc = new jsPDF()

    // 1. Cores da identidade
    const primaryColor = [43, 75, 111] // #2B4B6F
    const textColor = [50, 50, 50]
    const lightGray = [245, 247, 250]
    const borderGray = [220, 224, 230]

    // 2. Cabeçalho Principal
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.rect(0, 0, 210, 24, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(255, 255, 255)
    doc.text('SR PET CLUBE', 14, 12)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(230, 235, 245)
    doc.text('Relatório e Extrato de Utilização do Pacote', 14, 19)

    // Data de emissão no canto direito do cabeçalho
    const emissionDate = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
    doc.setFontSize(8)
    doc.text(`Emissão: ${emissionDate}`, 196, 16, { align: 'right' })

    // 3. Bloco de Dados do Pet e Tutor
    let currentY = 32
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2])
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2])
    doc.roundedRect(14, currentY, 182, 28, 3, 3, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('DADOS DO PET & TUTOR', 18, currentY + 7)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])
    
    // Linha 1
    doc.setFont('helvetica', 'bold')
    doc.text('Pet:', 18, currentY + 15)
    doc.setFont('helvetica', 'normal')
    doc.text(`${pet.name} (${pet.breed || 'Sem raça'})`, 28, currentY + 15)

    doc.setFont('helvetica', 'bold')
    doc.text('Tutor:', 110, currentY + 15)
    doc.setFont('helvetica', 'normal')
    doc.text(`${pet.customers?.name || 'Não informado'}`, 122, currentY + 15)

    // Linha 2
    if (pet.customers?.phone_1) {
        doc.setFont('helvetica', 'bold')
        doc.text('Contato:', 110, currentY + 22)
        doc.setFont('helvetica', 'normal')
        doc.text(`${pet.customers.phone_1}`, 126, currentY + 22)
    }

    currentY += 34

    // 4. Bloco de Resumo do Pacote e Extrato Financeiro
    const hasTaxi = !!packageData.has_taxi
    const taxiFee = Number(packageData.taxi_fee || 0)

    const totalPaidNum = packageData.total_paid != null ? Number(packageData.total_paid) : null
    const calcPriceNum = packageData.calculated_price != null ? Number(packageData.calculated_price) : 0
    let packageTotal = totalPaidNum ?? calcPriceNum

    let packageBasePrice = packageTotal
    if (hasTaxi && taxiFee > 0) {
        if (packageTotal >= taxiFee) {
            packageBasePrice = packageTotal - taxiFee
        }
    }
    const packageSubtotal = packageBasePrice + (hasTaxi ? taxiFee : 0)

    // Extras das sessões
    let extrasFee = Number(packageData.total_extras_fee || 0)
    if (extrasFee === 0 && slots && slots.length > 0) {
        extrasFee = slots.reduce((acc, s) => acc + Number(s.extras_fee || 0), 0)
    }

    // Táxi avulso lançado nas sessões que não era parte do pacote
    const slotsTaxiFee = slots && slots.length > 0 && !hasTaxi
        ? slots.reduce((acc, s) => acc + (s.has_taxi ? Number(s.taxi_fee || 0) : 0), 0)
        : 0

    const grandTotal = packageSubtotal + extrasFee + slotsTaxiFee

    const blockHeight = (hasTaxi || extrasFee > 0) ? 52 : 46
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2])
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2])
    doc.roundedRect(14, currentY, 182, blockHeight, 3, 3, 'FD')

    // Título do Pacote
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    const refText = packageData.referenceMonth ? ` (${packageData.referenceMonth})` : ''
    doc.text(`PACOTE: ${packageData.name.toUpperCase()}${refText}`, 18, currentY + 7)

    // Datas (Contratação e Validade)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])

    const purchasedFormatted = packageData.purchased_at
        ? new Date(packageData.purchased_at).toLocaleDateString('pt-BR')
        : '-'
    const expiresFormatted = packageData.expires_at 
        ? new Date(packageData.expires_at).toLocaleDateString('pt-BR') 
        : 'Indeterminada'

    doc.setFont('helvetica', 'bold')
    doc.text('Contratado:', 18, currentY + 15)
    doc.setFont('helvetica', 'normal')
    doc.text(purchasedFormatted, 37, currentY + 15)

    doc.setFont('helvetica', 'bold')
    doc.text('Validade:', 65, currentY + 15)
    doc.setFont('helvetica', 'normal')
    doc.text(expiresFormatted, 80, currentY + 15)

    // Pagamento do Pacote
    const paymentMethodLabels: Record<string, string> = {
        pix: 'PIX',
        credit: 'Cartão de Crédito',
        debit: 'Cartão de Débito',
        cash: 'Dinheiro',
        other: 'Outro'
    }
    const isPaid = packageData.payment_status === 'paid'
    let paymentText = isPaid ? 'Pago' : (packageData.payment_status === 'pending' ? 'Pendente' : packageData.payment_status || 'Outro')
    if (isPaid && packageData.paid_at) {
        paymentText += ` em ${new Date(packageData.paid_at).toLocaleDateString('pt-BR')}`
    }
    if (isPaid && packageData.payment_method) {
        paymentText += ` (${paymentMethodLabels[packageData.payment_method] || packageData.payment_method})`
    }

    doc.setFont('helvetica', 'bold')
    doc.text('Pagamento Pacote:', 18, currentY + 23)
    doc.setFont('helvetica', 'normal')
    if (isPaid) {
        doc.setTextColor(16, 185, 129) // Verde
    } else {
        doc.setTextColor(239, 68, 68) // Vermelho
    }
    doc.text(paymentText, 49, currentY + 23)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])

    // Resumo de créditos por serviço
    if (packageData.services && packageData.services.length > 0) {
        const servicesSummary = packageData.services.map(s => {
            const rem = (s.total_qty || 0) - (s.used_qty || 0)
            return `${s.service_name}: ${s.used_qty || 0} utilizadas / ${rem} restantes (Total: ${s.total_qty || 0})`
        }).join('  |  ')

        doc.setFont('helvetica', 'bold')
        doc.text('Sessões:', 18, currentY + 31)
        doc.setFont('helvetica', 'normal')
        doc.text(servicesSummary, 33, currentY + 31)
    }

    // Box de Extrato Financeiro Consolidado (lado direito do bloco)
    const boxX = 114
    const boxY = currentY + 4
    const boxWidth = 78
    const boxHeight = blockHeight - 8
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2])
    doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'FD')

    // Título do Box
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('EXTRATO DE VALORES', boxX + 4, boxY + 6)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])

    let lineY = boxY + 12
    // Linha 1: Valor Base do Pacote
    doc.text('Valor do Pacote:', boxX + 4, lineY)
    doc.text(`R$ ${packageBasePrice.toFixed(2)}`, boxX + boxWidth - 4, lineY, { align: 'right' })

    // Linha 2: Táxi Dog Incluso (se houver)
    if (hasTaxi && taxiFee > 0) {
        lineY += 5
        doc.text('Táxi Dog Incluso:', boxX + 4, lineY)
        doc.text(`R$ ${taxiFee.toFixed(2)}`, boxX + boxWidth - 4, lineY, { align: 'right' })
    }

    // Linha 3: Extras das Sessões (se houver)
    if (extrasFee > 0) {
        lineY += 5
        doc.text('Extras (Sessões):', boxX + 4, lineY)
        doc.text(`R$ ${extrasFee.toFixed(2)}`, boxX + boxWidth - 4, lineY, { align: 'right' })
    }

    // Linha 4: Táxi Avulso de Sessões (se houver)
    if (slotsTaxiFee > 0) {
        lineY += 5
        doc.text('Táxi Avulso (Sessões):', boxX + 4, lineY)
        doc.text(`R$ ${slotsTaxiFee.toFixed(2)}`, boxX + boxWidth - 4, lineY, { align: 'right' })
    }

    // Linha separadora do Total
    lineY += 3
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2])
    doc.line(boxX + 4, lineY, boxX + boxWidth - 4, lineY)

    // Total Geral
    lineY += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('TOTAL:', boxX + 4, lineY)
    doc.text(`R$ ${grandTotal.toFixed(2)}`, boxX + boxWidth - 4, lineY, { align: 'right' })

    currentY += blockHeight + 6

    // 5. Tabela de Histórico de Sessões (Slots)
    const translateStatus = (st: string) => {
        if (!st) return 'Registrada'
        const lower = st.trim().toLowerCase()
        switch (lower) {
            case 'done':
            case 'completed':
            case 'realizado':
            case 'utilizado':
                return 'Utilizado'
            case 'scheduled':
            case 'agendado':
                return 'Agendado'
            case 'pending':
                return 'Pendente'
            case 'in_progress':
                return 'Em Andamento'
            case 'missed':
            case 'no_show':
            case 'falta':
                return 'Falta'
            case 'rescheduled':
                return 'Reagendado'
            case 'cancelled':
            case 'canceled':
                return 'Cancelado'
            default:
                return st
        }
    }

    // Ordenar slots do mais recente para o mais antigo (ou cronológico)
    const sortedSlots = [...slots].sort((a, b) => {
        return new Date(b.slot_date + 'T12:00:00').getTime() - new Date(a.slot_date + 'T12:00:00').getTime()
    })

    const tableRows = sortedSlots.map(slot => {
        const dateObj = new Date(slot.slot_date + 'T12:00:00')
        const formattedDate = dateObj.toLocaleDateString('pt-BR')
        const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()

        let serviceDesc = slot.services?.name || 'Sessão do Pacote'
        if (slot.has_taxi && slot.taxi_fee && slot.taxi_fee > 0) {
            serviceDesc += `\n+ Táxi Dog (R$ ${Number(slot.taxi_fee).toFixed(2)})`
        }
        if (slot.extras && Array.isArray(slot.extras) && slot.extras.length > 0) {
            const extrasText = slot.extras.map((e: any) => `+ Extra: ${e.name} (R$ ${Number(e.price || 0).toFixed(2)})`).join('\n')
            serviceDesc += `\n${extrasText}`
        } else if (slot.has_extras && slot.extras_fee) {
            serviceDesc += `\n+ Extra (R$ ${Number(slot.extras_fee).toFixed(2)})`
        }

        return [
            `${formattedDate} (${weekday})`,
            slot.slot_time || '08:30',
            serviceDesc,
            translateStatus(slot.status)
        ]
    })

    if (tableRows.length === 0) {
        tableRows.push(['-', '-', 'Nenhuma sessão registrada para este pacote', '-'])
    }

    autoTable(doc, {
        startY: currentY,
        head: [['Data / Dia', 'Horário', 'Serviço / Extras / Táxi', 'Status']],
        body: tableRows,
        theme: 'striped',
        headStyles: {
            fillColor: [primaryColor[0], primaryColor[1], primaryColor[2]],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9
        },
        bodyStyles: {
            fontSize: 8.5,
            textColor: [40, 40, 40]
        },
        alternateRowStyles: {
            fillColor: [250, 252, 255]
        },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 3) {
                const cellText = String(data.cell.raw)
                if (cellText === 'Utilizado') {
                    data.cell.styles.textColor = [16, 185, 129] // Verde
                    data.cell.styles.fontStyle = 'bold'
                } else if (cellText === 'Falta') {
                    data.cell.styles.textColor = [239, 68, 68] // Vermelho
                    data.cell.styles.fontStyle = 'bold'
                } else if (cellText === 'Agendado' || cellText === 'Pendente') {
                    data.cell.styles.textColor = [37, 99, 235] // Azul
                }
            }
        }
    })

    // 6. Rodapé em todas as páginas
    const totalPages = (doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(
            'SR Pet Clube • Documento para acompanhamento e controle de sessões',
            14,
            290
        )
        doc.text(
            `Página ${i} de ${totalPages}`,
            196,
            290,
            { align: 'right' }
        )
    }

    // 7. Salvar / Download do arquivo
    const sanitizedPetName = pet.name.replace(/[^a-zA-Z0-9]/g, '_')
    const sanitizedPkgName = packageData.name.replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `Relatorio_Sessoes_${sanitizedPetName}_${sanitizedPkgName}.pdf`
    doc.save(fileName)
}
