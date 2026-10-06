import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface ServiceReportPetInfo {
    name: string
    breed?: string | null
    species?: string | null
    customers?: {
        name?: string | null
        phone_1?: string | null
    } | null
}

export interface ServiceReportAppointment {
    id: string
    scheduled_at: string
    status: string
    check_in_date?: string | null
    check_out_date?: string | null
    notes?: string | null
    has_taxi?: boolean | null
    taxi_fee?: number | null
    package_credit_id?: string | null
    package_usage_index?: number | null
    package_credits?: any
    services?: {
        name: string
        base_price?: number | null
    } | null
    staff?: {
        full_name?: string | null
    } | null
    appointment_extras?: Array<{
        name: string
        price: number
    }> | null
}

export interface ExportServiceReportOptions {
    pet: ServiceReportPetInfo
    category: 'Banho e Tosa' | 'Creche' | 'Hospedagem'
    startDate: string // YYYY-MM-DD
    endDate: string   // YYYY-MM-DD
    appointments: ServiceReportAppointment[]
}

function translateStatus(status: string): string {
    const st = (status || '').toLowerCase()
    switch (st) {
        case 'done':
        case 'concluido':
        case 'concluído':
        case 'realizado':
            return 'Realizado'
        case 'confirmed':
        case 'confirmado':
            return 'Confirmado'
        case 'pending':
        case 'pendente':
            return 'Pendente'
        case 'in_progress':
        case 'em_andamento':
            return 'Em Andamento'
        case 'no_show':
        case 'falta':
            return 'Falta'
        case 'canceled':
        case 'cancelled':
        case 'cancelado':
            return 'Cancelado'
        default:
            return status || '-'
    }
}

export function exportServiceReportPDF({
    pet,
    category,
    startDate,
    endDate,
    appointments = []
}: ExportServiceReportOptions) {
    const doc = new jsPDF()

    // Cores da identidade visual do Sr Pet Clube
    const primaryColor = [43, 75, 111] // #2B4B6F
    const textColor = [50, 50, 50]
    const lightGray = [245, 247, 250]
    const borderGray = [220, 224, 230]

    // 1. Cabeçalho Principal com faixa azul marinho
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.rect(0, 0, 210, 24, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(255, 255, 255)
    doc.text('SR PET CLUBE', 14, 12)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(230, 235, 245)
    doc.text(`Relatório de Atendimentos — ${category}`, 14, 19)

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

    // 2. Bloco de Dados do Pet & Tutor
    let currentY = 32
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2])
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2])
    doc.roundedRect(14, currentY, 182, 26, 3, 3, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('DADOS DO PET & TUTOR', 18, currentY + 7)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])

    // Linha 1: Pet e Tutor
    doc.setFont('helvetica', 'bold')
    doc.text('Pet:', 18, currentY + 15)
    doc.setFont('helvetica', 'normal')
    doc.text(`${pet.name} (${pet.breed || 'Sem raça definida'})`, 28, currentY + 15)

    doc.setFont('helvetica', 'bold')
    doc.text('Tutor:', 110, currentY + 15)
    doc.setFont('helvetica', 'normal')
    doc.text(`${pet.customers?.name || 'Não informado'}`, 122, currentY + 15)

    // Linha 2: Contato
    if (pet.customers?.phone_1) {
        doc.setFont('helvetica', 'bold')
        doc.text('Contato:', 110, currentY + 21)
        doc.setFont('helvetica', 'normal')
        doc.text(`${pet.customers.phone_1}`, 126, currentY + 21)
    }

    currentY += 32

    // 3. Bloco de Resumo do Período e Métricas
    const startFormatted = startDate
        ? new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')
        : 'Início'
    const endFormatted = endDate
        ? new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')
        : 'Atual'

    const totalCount = appointments.length
    const doneCount = appointments.filter(a => ['done', 'concluido', 'concluído', 'realizado'].includes((a.status || '').toLowerCase())).length
    const noShowCount = appointments.filter(a => ['no_show', 'falta'].includes((a.status || '').toLowerCase())).length
    const pendingCount = totalCount - doneCount - noShowCount

    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2])
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2])
    doc.roundedRect(14, currentY, 182, 26, 3, 3, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('RESUMO DO PERÍODO', 18, currentY + 7)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])

    // Período
    doc.setFont('helvetica', 'bold')
    doc.text('Período Selecionado:', 18, currentY + 15)
    doc.setFont('helvetica', 'normal')
    doc.text(`${startFormatted} a ${endFormatted}`, 55, currentY + 15)

    // Indicadores numéricos
    doc.setFont('helvetica', 'bold')
    doc.text('Total:', 18, currentY + 21)
    doc.setFont('helvetica', 'normal')
    doc.text(`${totalCount} atendimento(s)`, 30, currentY + 21)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(16, 185, 129) // Verde
    doc.text('Realizados:', 80, currentY + 21)
    doc.setFont('helvetica', 'normal')
    doc.text(`${doneCount}`, 102, currentY + 21)

    if (noShowCount > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(239, 68, 68) // Vermelho
        doc.text('Faltas:', 120, currentY + 21)
        doc.setFont('helvetica', 'normal')
        doc.text(`${noShowCount}`, 134, currentY + 21)
    }

    if (pendingCount > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(59, 130, 246) // Azul
        doc.text('Pendentes:', 150, currentY + 21)
        doc.setFont('helvetica', 'normal')
        doc.text(`${pendingCount}`, 170, currentY + 21)
    }

    doc.setTextColor(textColor[0], textColor[1], textColor[2])
    currentY += 32

    // 4. Tabela de Atendimentos Detalhada
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('DETALHAMENTO DOS ATENDIMENTOS', 14, currentY)
    currentY += 4

    // Ordenar cronologicamente (mais recente primeiro ou ordem crescente)
    const sortedAppts = [...appointments].sort((a, b) => {
        return new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
    })

    const tableRows = sortedAppts.map(appt => {
        const dateObj = new Date(appt.scheduled_at)
        const formattedDate = dateObj.toLocaleDateString('pt-BR')
        const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()
        const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

        // Data / Período
        let dateCol = `${formattedDate}\n(${weekday} às ${formattedTime})`
        if (category === 'Hospedagem' && appt.check_in_date && appt.check_out_date && appt.check_in_date !== appt.check_out_date) {
            const inDate = new Date(appt.check_in_date + 'T00:00:00').toLocaleDateString('pt-BR')
            const outDate = new Date(appt.check_out_date + 'T00:00:00').toLocaleDateString('pt-BR')
            dateCol = `Entrada: ${inDate}\nSaída: ${outDate}`
        }

        // Descrição do Serviço e Detalhes
        let serviceDesc = appt.services?.name || category

        // Indicador de sessão de pacote
        if (appt.package_usage_index) {
            serviceDesc += `\n(Sessão ${appt.package_usage_index} do pacote)`
        }

        // Táxi Dog
        if (appt.has_taxi) {
            const feeText = appt.taxi_fee ? ` (R$ ${Number(appt.taxi_fee).toFixed(2)})` : ''
            serviceDesc += `\n+ Táxi Dog${feeText}`
        }

        // Extras
        if (appt.appointment_extras && Array.isArray(appt.appointment_extras) && appt.appointment_extras.length > 0) {
            const extrasList = appt.appointment_extras.map(e => `+ Extra: ${e.name} (R$ ${Number(e.price || 0).toFixed(2)})`).join('\n')
            serviceDesc += `\n${extrasList}`
        }

        // Observações (se houver e não for muito longa)
        if (appt.notes && appt.notes.trim()) {
            const cleanNotes = appt.notes.trim()
            if (cleanNotes.length > 60) {
                serviceDesc += `\nObs: ${cleanNotes.substring(0, 57)}...`
            } else {
                serviceDesc += `\nObs: ${cleanNotes}`
            }
        }

        const staffName = appt.staff?.full_name || 'Equipe Sr Pet'
        const statusLabel = translateStatus(appt.status)

        return [
            dateCol,
            serviceDesc,
            staffName,
            statusLabel
        ]
    })

    if (tableRows.length === 0) {
        tableRows.push(['-', 'Nenhum atendimento registrado no período selecionado', '-', '-'])
    }

    autoTable(doc, {
        startY: currentY,
        head: [['Data / Horário', 'Serviço / Detalhes / Extras', 'Profissional', 'Status']],
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
        columnStyles: {
            0: { cellWidth: 38 },
            1: { cellWidth: 80 },
            2: { cellWidth: 36 },
            3: { cellWidth: 28, halign: 'center' }
        },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 3) {
                const cellText = String(data.cell.raw)
                if (cellText === 'Realizado') {
                    data.cell.styles.textColor = [16, 185, 129] // Verde
                    data.cell.styles.fontStyle = 'bold'
                } else if (cellText === 'Falta') {
                    data.cell.styles.textColor = [239, 68, 68] // Vermelho
                    data.cell.styles.fontStyle = 'bold'
                } else if (cellText === 'Cancelado') {
                    data.cell.styles.textColor = [156, 163, 175] // Cinza
                } else if (cellText === 'Pendente' || cellText === 'Confirmado' || cellText === 'Agendado') {
                    data.cell.styles.textColor = [59, 130, 246] // Azul
                    data.cell.styles.fontStyle = 'bold'
                }
            }
        }
    })

    // 5. Rodapé numerado em todas as páginas
    const pageCount = (doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2])
        doc.line(14, 283, 196, 283)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(140, 140, 140)
        doc.text('Sr Pet Clube — Sistema Integrado de Gestão', 14, 288)
        doc.text(`Página ${i} de ${pageCount}`, 196, 288, { align: 'right' })
    }

    // 6. Download do arquivo
    const cleanCategory = category.toLowerCase().replace(/\s+/g, '_')
    const cleanPetName = pet.name.toLowerCase().replace(/[^a-z0-9]/gi, '_')
    const filename = `relatorio_${cleanCategory}_${cleanPetName}_${startDate}_a_${endDate}.pdf`
    doc.save(filename)
}
