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

export interface GeneralStatementSessionItem {
    id: string
    date: string // ISO ou YYYY-MM-DD
    serviceName: string
    sessionIndex?: number | null // ex: 1, 2...
    totalSessions?: number | null // total de sessões do pacote
    servicePrice?: number | null // valor unitário da sessão (já com desconto se houver)
    status: string // 'done', 'scheduled', etc.
    hasExtras: boolean
    extrasDescription?: string // ex: "Tosa + Táxi Dog"
    extrasAmount: number // valor cobrado pelo extra (R$)
    extrasPaymentStatus?: string // 'paid', 'pending'
    notes?: string
}

export interface GeneralStatementPackageItem {
    id: string
    name: string
    date: string // purchased_at ou payment_due_date
    amount: number // valor total contratado do pacote
    unitPrice?: number // valor unitário calculado de cada sessão
    totalSessions?: number // total de sessões contratadas
    realizedAmount?: number // valor proporcional das sessões realizadas
    paymentStatus: string // 'paid', 'pending'
    periodLabel?: string
    discountPercent?: number
    sessions: GeneralStatementSessionItem[]
}

export interface GeneralStatementStandaloneItem {
    id: string
    date: string // ISO ou YYYY-MM-DD
    paidAt?: string | null // Data em que o pagamento foi liquidado
    type: 'Banho e Tosa' | 'Creche' | 'Hospedagem' | 'Pet Shop' | 'Outro'
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
    packages?: GeneralStatementPackageItem[]
    standaloneItems?: GeneralStatementStandaloneItem[]
}

function translateStatus(status: string): string {
    const st = (status || '').toLowerCase().trim()
    switch (st) {
        case 'done':
        case 'concluido':
        case 'concluído':
        case 'realizado':
        case 'realizada':
            return 'REALIZADA'
        case 'scheduled':
        case 'agendado':
        case 'agendada':
            return 'AGENDADA'
        case 'confirmed':
        case 'confirmado':
        case 'confirmada':
            return 'CONFIRMADA'
        case 'pending':
        case 'pendente':
            return 'PENDENTE'
        case 'in_progress':
        case 'em_andamento':
            return 'EM ANDAMENTO'
        case 'no_show':
        case 'falta':
            return 'FALTA'
        case 'canceled':
        case 'cancelled':
        case 'cancelado':
        case 'cancelada':
            return 'CANCELADA'
        case 'paid':
        case 'pago':
            return 'PAGO'
        default:
            return (status || '-').toUpperCase()
    }
}

function formatNumber(value: number): string {
    return (Number(value) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Number(value) || 0)
}

function formatDateShort(dateStr: string): string {
    try {
        const clean = (dateStr || '').includes('T') ? dateStr.split('T')[0] : (dateStr || '')
        const parts = clean.split('-')
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}`
        }
        const d = new Date(dateStr)
        const day = String(d.getDate()).padStart(2, '0')
        const month = String(d.getMonth() + 1).padStart(2, '0')
        return `${day}/${month}`
    } catch {
        return dateStr || '-'
    }
}

function formatDateCol(dateStr: string): string {
    try {
        const dateObj = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00')
        const formattedDate = dateObj.toLocaleDateString('pt-BR')
        const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()
        return `${formattedDate}\n(${weekday})`
    } catch {
        return dateStr
    }
}

export function exportGeneralStatementPDF({
    pet,
    startDate,
    endDate,
    includedCategories = [],
    packages = [],
    standaloneItems = []
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
    doc.text('Extrato Geral Consolidado do Pet', 14, 19)

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

    // 3. Bloco de Resumo Financeiro & Totais
    const startFormatted = startDate
        ? new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')
        : 'Início'
    const endFormatted = endDate
        ? new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')
        : 'Atual'

    const isRealizedStatus = (st: string) => ['done', 'concluido', 'concluído', 'realizado', 'realizada'].includes((st || '').toLowerCase().trim())

    // Cálculos consolidados:
    // 1. Pacotes: O valor do pacote no extrato é o valor integral contratado (pkg.amount)
    const totalPackagesAmount = packages.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

    const totalPackagesExtrasAmount = packages.reduce((sum, p) => {
        return sum + p.sessions.reduce((sSum, sess) => sSum + (Number(sess.extrasAmount) || 0), 0)
    }, 0)
    const totalStandaloneAmount = standaloneItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

    const grandTotalAmount = totalPackagesAmount + totalPackagesExtrasAmount + totalStandaloneAmount

    // 2. Cálculo do total pago: Se o pacote foi pago, considera o valor contratado integral pago
    const paidPackagesAmount = packages.reduce((sum, p) => {
        const isPkgPaid = ['paid', 'pago'].includes((p.paymentStatus || '').toLowerCase())
        return sum + (isPkgPaid ? (Number(p.amount) || 0) : 0)
    }, 0)

    const paidPackagesExtrasAmount = packages.reduce((sum, p) => {
        return sum + p.sessions
            .filter(sess => ['paid', 'pago'].includes((sess.extrasPaymentStatus || '').toLowerCase()))
            .reduce((sSum, sess) => sSum + (Number(sess.extrasAmount) || 0), 0)
    }, 0)

    const paidStandaloneAmount = standaloneItems
        .filter(item => ['paid', 'pago'].includes((item.paymentStatus || '').toLowerCase()))
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

    const grandPaidAmount = paidPackagesAmount + paidPackagesExtrasAmount + paidStandaloneAmount
    const grandPendingAmount = Math.max(0, grandTotalAmount - grandPaidAmount)

    const cardHeight = 28

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
    doc.setFontSize(9.5)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('VALOR TOTAL:', 110, currentY + 15)
    doc.setFontSize(16)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text(formatNumber(grandTotalAmount), 142, currentY + 16)

    // Linha 2: Resumo quantitativo (esquerda) e Situação de pagamento (direita)
    doc.setFontSize(9)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])
    doc.setFont('helvetica', 'bold')
    let countSummary = ''
    if (packages.length > 0 && standaloneItems.length > 0) {
        countSummary = `${packages.length} pacote(s) • ${standaloneItems.length} avulso(s)`
    } else if (packages.length > 0) {
        countSummary = `${packages.length} pacote(s)`
    } else {
        countSummary = `${standaloneItems.length} avulso(s)`
    }
    doc.text('Lançamentos:', 18, currentY + 22)
    doc.setFont('helvetica', 'normal')
    doc.text(countSummary, 44, currentY + 22)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(16, 185, 129) // Verde
    doc.text(`Pago: ${formatCurrency(grandPaidAmount)}`, 110, currentY + 23)

    doc.setTextColor(220, 38, 38) // Vermelho
    doc.text(`A Pagar: ${formatNumber(grandPendingAmount)}`, 150, currentY + 23)

    currentY += cardHeight + 10

    // 4. SEÇÃO SUPERIOR: PACOTES DE SERVIÇOS & SESSÕES UTILIZADAS
    if (packages.length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
        doc.text('P A C O T E S   D E   S E R V I Ç O S   &   S E S S Õ E S   U T I L I Z A D A S', 105, currentY, { align: 'center' })
        currentY += 6

        packages.forEach((pkg, index) => {
            // Verificar espaço para o cabeçalho do pacote e a tabela
            if (currentY > 235) {
                doc.addPage()
                currentY = 20
            }

            // Bloco de cabeçalho do Pacote Individual
            const pkgDateFormatted = pkg.date
                ? new Date(pkg.date.includes('T') ? pkg.date : pkg.date + 'T12:00:00').toLocaleDateString('pt-BR')
                : '-'

            doc.setFillColor(235, 242, 250)
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.roundedRect(14, currentY, 182, 14, 2, 2, 'FD')

            doc.setFont('helvetica', 'bold')
            doc.setFontSize(9.5)
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.text(`PACOTE ${index + 1}: ${pkg.name.toUpperCase()}`, 18, currentY + 5.5)

            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            doc.setTextColor(textColor[0], textColor[1], textColor[2])
            let pkgSub = `Data / Vencimento: ${pkgDateFormatted}`
            if (pkg.periodLabel) pkgSub += ` • Ref: ${pkg.periodLabel}`
            doc.text(pkgSub, 18, currentY + 11)

            // Valor do pacote no lado direito
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(9)
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.text('Valor do Pacote:', 150, currentY + 5.5)
            doc.setFontSize(10.5)
            doc.setTextColor(textColor[0], textColor[1], textColor[2])
            doc.text(formatNumber(pkg.amount), 192, currentY + 5.5, { align: 'right' })

            currentY += 16

            // Tabela de Sessões Utilizadas do Pacote
            const sessionRows: any[][] = []

            const unitPrice = pkg.unitPrice != null
                ? pkg.unitPrice
                : (pkg.totalSessions && pkg.totalSessions > 0
                    ? pkg.amount / pkg.totalSessions
                    : (pkg.sessions.length > 0 ? pkg.amount / pkg.sessions.length : pkg.amount))

            if (pkg.sessions && pkg.sessions.length > 0) {
                pkg.sessions.forEach(sess => {
                    const dateCol = formatDateShort(sess.date)
                    const servLabel = sess.serviceName
                    const statusLabel = translateStatus(sess.status)
                    const servPrice = sess.servicePrice != null ? sess.servicePrice : unitPrice
                    const priceCol = formatNumber(servPrice)

                    let extraCol = ''
                    let extraAmountCol = ''

                    if (sess.hasExtras && sess.extrasAmount > 0) {
                        extraCol = (sess.extrasDescription || 'EXTRA').toUpperCase()
                        extraAmountCol = formatNumber(sess.extrasAmount)
                    }

                    sessionRows.push([
                        dateCol,
                        servLabel,
                        statusLabel,
                        priceCol,
                        extraCol,
                        extraAmountCol
                    ])
                })
            } else {
                sessionRows.push([
                    '-',
                    'Nenhuma sessão registrada para este pacote',
                    '-',
                    formatNumber(unitPrice),
                    '',
                    ''
                ])
            }

            const isPkgPaid = ['paid', 'pago'].includes((pkg.paymentStatus || '').toLowerCase())
            const pkgRealizedAmount = pkg.sessions.filter(s => isRealizedStatus(s.status)).reduce((sum, s) => sum + (s.servicePrice ?? unitPrice), 0)
            const pkgTotalExtras = pkg.sessions.reduce((sum, s) => sum + (Number(s.extrasAmount) || 0), 0)

            const footCols: any[] = [
                'TOTAL DO PACOTE',
                `Pacote: R$ ${formatNumber(pkg.amount)} ${isPkgPaid ? '[PAGO]' : '[A PAGAR]'}`,
                `Utilizado: R$ ${formatNumber(pkgRealizedAmount)}`,
                '',
                `Extras: R$ ${formatNumber(pkgTotalExtras)}`,
                ''
            ]

            autoTable(doc, {
                startY: currentY,
                head: [['Data', 'Serviço do Pacote', 'Status', 'Valor do Serviço', 'Serviço Extra / Táxi no Dia', 'Valor Extra (R$)']],
                body: sessionRows,
                foot: [footCols],
                theme: 'striped',
                headStyles: {
                    fillColor: [43, 75, 111],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8,
                    halign: 'left'
                },
                footStyles: {
                    fillColor: [230, 238, 248],
                    textColor: [43, 75, 111],
                    fontStyle: 'bold',
                    fontSize: 8.5,
                    halign: 'left'
                },
                bodyStyles: {
                    fontSize: 8,
                    textColor: [40, 40, 40],
                    cellPadding: 3
                },
                columnStyles: {
                    0: { cellWidth: 20, fontStyle: 'bold' },
                    1: { cellWidth: 42, fontStyle: 'bold' },
                    2: { cellWidth: 26, fontStyle: 'bold' },
                    3: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
                    4: { cellWidth: 44, fontStyle: 'bold' },
                    5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                didDrawPage: (data) => {
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

            currentY = (doc as any).lastAutoTable.finalY + 8
        })
    }

    // 5. SEÇÃO DE ATENDIMENTOS E LANÇAMENTOS AVULSOS (SEM PACOTE)
    if (standaloneItems.length > 0) {
        if (currentY > 230) {
            doc.addPage()
            currentY = 20
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10.5)
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
        const sectionTitle = packages.length > 0
            ? 'A T E N D I M E N T O S   &   L A N Ç A M E N T O S   A V U L S O S'
            : 'A T E N D I M E N T O S   &   L A N Ç A M E N T O S   A V U L S O S'
        doc.text(sectionTitle, 105, currentY, { align: 'center' })
        currentY += 5

        const sortedStandalone = [...standaloneItems].sort((a, b) => {
            return new Date(b.date).getTime() - new Date(a.date).getTime()
        })

        const standaloneRows = sortedStandalone.map(item => {
            const dateCol = formatDateCol(item.date)

            let descCol = item.description
            if (item.details && item.details.length > 0) {
                descCol += '\n' + item.details.join('\n')
            }

            const statusLabel = translateStatus(item.status)
            let paymentTag = ''
            if (item.paymentStatus === 'paid') {
                if (item.paidAt) {
                    const pDate = formatDateShort(item.paidAt)
                    paymentTag = ` [Pago em ${pDate}]`
                } else {
                    paymentTag = ' [Pago]'
                }
            } else if (item.paymentStatus === 'pending') {
                paymentTag = ' [A Receber]'
            }
            const fullStatus = `${statusLabel}${paymentTag}`

            return [
                dateCol,
                item.type,
                descCol,
                fullStatus,
                formatCurrency(item.amount)
            ]
        })

        autoTable(doc, {
            startY: currentY,
            head: [['Data', 'Tipo', 'Descrição / Detalhes', 'Status', 'Valor (R$)']],
            body: standaloneRows,
            foot: [
                ['TOTAL AVULSOS', '', `${standaloneItems.length} item(s)`, '', formatCurrency(totalStandaloneAmount)]
            ],
            theme: 'striped',
            headStyles: {
                fillColor: [43, 75, 111],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8.5,
                halign: 'left'
            },
            footStyles: {
                fillColor: [230, 235, 245],
                textColor: [43, 75, 111],
                fontStyle: 'bold',
                fontSize: 9,
                halign: 'left'
            },
            bodyStyles: {
                fontSize: 8,
                textColor: [40, 40, 40],
                cellPadding: 3
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

        currentY = (doc as any).lastAutoTable.finalY + 8
    }

    // Se não tiver nem pacotes nem avulsos
    if (packages.length === 0 && standaloneItems.length === 0) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(120, 130, 140)
        doc.text('Nenhum lançamento ou pacote encontrado para os filtros selecionados.', 14, currentY + 10)
    }

    // Salvar e fazer download
    const cleanPetName = pet.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const fileName = `extrato_geral_${cleanPetName}_${startDate || 'inicio'}_${endDate || 'fim'}.pdf`
    doc.save(fileName)
}
