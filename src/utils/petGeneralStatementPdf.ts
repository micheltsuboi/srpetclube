import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface GeneralStatementPetInfo {
    name: string
    breed?: string | null
    species?: string | null
    customers?: {
        name?: string | null
        phone_1?: string | null
    } | null
}

export interface GeneralStatementItem {
    id: string
    date: string // ISO ou YYYY-MM-DD
    type: 'Banho e Tosa' | 'Creche' | 'Hospedagem' | 'Pet Shop' | 'Pacote' | 'Outro'
    description: string
    status: string
    amount: number
    paymentStatus?: 'paid' | 'pending' | string | null
    details?: string[]
}

export interface ExportGeneralStatementOptions {
    pet: GeneralStatementPetInfo
    startDate: string // YYYY-MM-DD
    endDate: string   // YYYY-MM-DD
    includedCategories: string[]
    items: GeneralStatementItem[]
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
        case 'paid':
        case 'pago':
            return 'Pago'
        default:
            return status || '-'
    }
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value)
}

export function exportGeneralStatementPDF({
    pet,
    startDate,
    endDate,
    includedCategories = [],
    items = []
}: ExportGeneralStatementOptions) {
    const doc = new jsPDF()

    // Cores oficiais do Sr Pet Clube
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
    doc.text('Extrato Geral Unificado do Pet', 14, 19)

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
    const petLabel = `${pet.name} (${pet.breed || 'Sem raça definida'})`
    doc.text(petLabel, 28, currentY + 15, { maxWidth: 78 })

    doc.setFont('helvetica', 'bold')
    doc.text('Tutor:', 110, currentY + 15)
    doc.setFont('helvetica', 'normal')
    const tutorLabel = `${pet.customers?.name || 'Não informado'}`
    doc.text(tutorLabel, 122, currentY + 15, { maxWidth: 70 })

    // Linha 2: Contato
    if (pet.customers?.phone_1) {
        doc.setFont('helvetica', 'bold')
        doc.text('Contato:', 110, currentY + 21)
        doc.setFont('helvetica', 'normal')
        doc.text(`${pet.customers.phone_1}`, 126, currentY + 21)
    }

    currentY += 32

    // 3. Bloco de Resumo do Período, Filtros e Totais Financeiros
    const startFormatted = startDate
        ? new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')
        : 'Início'
    const endFormatted = endDate
        ? new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')
        : 'Atual'

    const totalCount = items.length
    const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const paidAmount = items
        .filter(item => ['paid', 'pago'].includes((item.paymentStatus || '').toLowerCase()))
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const pendingAmount = Math.max(0, totalAmount - paidAmount)

    const catsText = includedCategories.length > 0 ? includedCategories.join(', ') : 'Todos os módulos'
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const splitCats = doc.splitTextToSize(catsText, 150)
    const extraCatsHeight = (splitCats.length - 1) * 4.5
    const cardHeight = 35 + extraCatsHeight

    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2])
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2])
    doc.roundedRect(14, currentY, 182, cardHeight, 3, 3, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('RESUMO DO EXTRATO & TOTAIS', 18, currentY + 7)

    doc.setFontSize(9)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])

    // Linha 1: Período (esquerda) e VALOR TOTAL (direita)
    doc.setFont('helvetica', 'bold')
    doc.text('Período:', 18, currentY + 15)
    doc.setFont('helvetica', 'normal')
    doc.text(`${startFormatted} a ${endFormatted}`, 34, currentY + 15)

    doc.setFont('helvetica', 'bold')
    doc.text('VALOR TOTAL:', 115, currentY + 15)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text(formatCurrency(totalAmount), 143, currentY + 15)

    // Linha 2: Quantidade de lançamentos (esquerda) e Status de pagamento (direita)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(textColor[0], textColor[1], textColor[2])
    doc.text('Lançamentos:', 18, currentY + 21)
    doc.setFont('helvetica', 'normal')
    doc.text(`${totalCount} item(s)`, 44, currentY + 21)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(16, 185, 129) // Verde
    doc.text(`Pago: ${formatCurrency(paidAmount)}`, 115, currentY + 21)

    if (pendingAmount > 0) {
        doc.setTextColor(220, 38, 38) // Vermelho
        doc.text(`A Pagar: ${formatCurrency(pendingAmount)}`, 155, currentY + 21)
    }

    // Linha 3: Módulos Incluídos (linha dedicada com largura total)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text('Módulos:', 18, currentY + 28)
    doc.setFont('helvetica', 'normal')
    doc.text(splitCats, 35, currentY + 28)

    currentY += cardHeight + 7

    // 4. Tabela de Lançamentos Detalhada
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('LANÇAMENTOS DO EXTRATO', 14, currentY)
    currentY += 4

    // Ordenar cronologicamente decrescente (mais recente primeiro)
    const sortedItems = [...items].sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

    const tableRows = sortedItems.map(item => {
        let dateCol = '-'
        try {
            const dateObj = new Date(item.date.includes('T') ? item.date : item.date + 'T12:00:00')
            const formattedDate = dateObj.toLocaleDateString('pt-BR')
            const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()
            dateCol = `${formattedDate}\n(${weekday})`
        } catch {
            dateCol = item.date
        }

        let descCol = item.description
        if (item.details && item.details.length > 0) {
            descCol += '\n' + item.details.join('\n')
        }

        const statusLabel = translateStatus(item.status)
        const paymentTag = item.paymentStatus === 'paid' ? ' [Pago]' : item.paymentStatus === 'pending' ? ' [A Receber]' : ''
        const fullStatus = `${statusLabel}${paymentTag}`

        const amountFormatted = formatCurrency(item.amount)

        return [
            dateCol,
            item.type,
            descCol,
            fullStatus,
            amountFormatted
        ]
    })

    if (tableRows.length === 0) {
        tableRows.push(['-', '-', 'Nenhum lançamento encontrado para os filtros selecionados', '-', formatCurrency(0)])
    }

    autoTable(doc, {
        startY: currentY,
        head: [['Data', 'Tipo', 'Descrição / Detalhes', 'Status', 'Valor (R$)']],
        body: tableRows,
        foot: [
            ['TOTAL', '', `${totalCount} item(s) selecionado(s)`, '', formatCurrency(totalAmount)]
        ],
        theme: 'striped',
        headStyles: {
            fillColor: [43, 75, 111],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'left'
        },
        footStyles: {
            fillColor: [230, 235, 245],
            textColor: [43, 75, 111],
            fontStyle: 'bold',
            fontSize: 10,
            halign: 'left'
        },
        bodyStyles: {
            fontSize: 8.5,
            textColor: [40, 40, 40],
            cellPadding: 3.5
        },
        columnStyles: {
            0: { cellWidth: 26, fontStyle: 'bold' },
            1: { cellWidth: 28 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 32 },
            4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        didDrawPage: (data) => {
            // Rodapé com número da página
            const pageCount = (doc as any).internal.getNumberOfPages()
            doc.setFontSize(8)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(130, 140, 150)
            doc.text(
                `Sr Pet Clube — Extrato Geral • Página ${data.pageNumber} de ${pageCount}`,
                105,
                290,
                { align: 'center' }
            )
        }
    })

    // Salvar e fazer download
    const cleanPetName = pet.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const fileName = `extrato_geral_${cleanPetName}_${startDate || 'inicio'}_${endDate || 'fim'}.pdf`
    doc.save(fileName)
}
