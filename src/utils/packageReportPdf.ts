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
    calculated_price?: number | null
    services?: PackageReportServiceInfo[]
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
    doc.text('Relatório de Sessões e Utilização de Pacote', 14, 19)

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

    // 4. Bloco de Resumo do Pacote
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2])
    doc.roundedRect(14, currentY, 182, 34, 3, 3, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    const refText = packageData.referenceMonth ? ` (${packageData.referenceMonth})` : ''
    doc.text(`PACOTE: ${packageData.name.toUpperCase()}${refText}`, 18, currentY + 7)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])

    const expiresFormatted = packageData.expires_at 
        ? new Date(packageData.expires_at).toLocaleDateString('pt-BR') 
        : 'Indeterminada'

    const paymentFormatted = packageData.payment_status === 'paid' 
        ? 'Pago' 
        : packageData.payment_status === 'pending' 
        ? 'Pendente' 
        : packageData.payment_status || 'Outro'

    doc.setFont('helvetica', 'bold')
    doc.text('Validade:', 18, currentY + 16)
    doc.setFont('helvetica', 'normal')
    doc.text(expiresFormatted, 35, currentY + 16)

    doc.setFont('helvetica', 'bold')
    doc.text('Pagamento:', 110, currentY + 16)
    doc.setFont('helvetica', 'normal')
    doc.text(paymentFormatted, 132, currentY + 16)

    // Resumo de créditos por serviço
    if (packageData.services && packageData.services.length > 0) {
        const servicesSummary = packageData.services.map(s => {
            const rem = (s.total_qty || 0) - (s.used_qty || 0)
            return `${s.service_name}: ${s.used_qty || 0} utilizadas / ${rem} restantes (Total: ${s.total_qty || 0})`
        }).join('  |  ')

        doc.setFont('helvetica', 'bold')
        doc.text('Sessões:', 18, currentY + 25)
        doc.setFont('helvetica', 'normal')
        doc.text(servicesSummary, 35, currentY + 25)
    }

    currentY += 40

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
        head: [['Data / Dia', 'Horário', 'Serviço / Extras', 'Status']],
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
