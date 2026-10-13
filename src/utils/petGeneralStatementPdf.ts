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
    status: string // 'done', 'scheduled', etc.
    hasExtras: boolean
    extrasDescription?: string // ex: "Hidratação de Pelos + Táxi Dog"
    extrasAmount: number // valor cobrado pelo extra (R$)
    extrasPaymentStatus?: string // 'paid', 'pending'
    notes?: string
}

export interface GeneralStatementPackageItem {
    id: string
    name: string
    date: string // purchased_at ou payment_due_date
    amount: number // valor total do pacote
    paymentStatus: string // 'paid', 'pending'
    periodLabel?: string
    discountPercent?: number
    sessions: GeneralStatementSessionItem[]
}

export interface GeneralStatementStandaloneItem {
    id: string
    date: string // ISO ou YYYY-MM-DD
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

    // Cálculos consolidados
    const totalPackagesAmount = packages.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    const totalPackagesExtrasAmount = packages.reduce((sum, p) => {
        return sum + p.sessions.reduce((sSum, sess) => sSum + (Number(sess.extrasAmount) || 0), 0)
    }, 0)
    const totalStandaloneAmount = standaloneItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

    const grandTotalAmount = totalPackagesAmount + totalPackagesExtrasAmount + totalStandaloneAmount

    // Cálculo do total pago
    const paidPackagesAmount = packages
        .filter(p => ['paid', 'pago'].includes((p.paymentStatus || '').toLowerCase()))
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

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

    const catsText = includedCategories.length > 0 ? includedCategories.join(', ') : 'Todos os módulos'
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const splitCats = doc.splitTextToSize(catsText, 150)
    const extraCatsHeight = (splitCats.length - 1) * 4.5
    const cardHeight = 36 + extraCatsHeight

    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2])
    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2])
    doc.roundedRect(14, currentY, 182, cardHeight, 3, 3, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text('RESUMO DO EXTRATO & TOTAIS', 18, currentY + 7)

    doc.setFontSize(9)
    doc.setTextColor(textColor[0], textColor[1], textColor[2])

    // Linha 1: Período (esquerda) e VALOR TOTAL GERAL (direita)
    doc.setFont('helvetica', 'bold')
    doc.text('Período:', 18, currentY + 15)
    doc.setFont('helvetica', 'normal')
    doc.text(`${startFormatted} a ${endFormatted}`, 34, currentY + 15)

    doc.setFont('helvetica', 'bold')
    doc.text('VALOR TOTAL:', 115, currentY + 15)
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.text(formatCurrency(grandTotalAmount), 143, currentY + 15)

    // Linha 2: Resumo quantitativo (esquerda) e Situação de pagamento (direita)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(textColor[0], textColor[1], textColor[2])
    let countSummary = ''
    if (packages.length > 0 && standaloneItems.length > 0) {
        countSummary = `${packages.length} pacote(s) • ${standaloneItems.length} avulso(s)`
    } else if (packages.length > 0) {
        countSummary = `${packages.length} pacote(s)`
    } else {
        countSummary = `${standaloneItems.length} avulso(s)`
    }
    doc.text('Lançamentos:', 18, currentY + 21)
    doc.setFont('helvetica', 'normal')
    doc.text(countSummary, 44, currentY + 21)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(16, 185, 129) // Verde
    doc.text(`Pago: ${formatCurrency(grandPaidAmount)}`, 115, currentY + 21)

    if (grandPendingAmount > 0) {
        doc.setTextColor(220, 38, 38) // Vermelho
        doc.text(`A Pagar: ${formatCurrency(grandPendingAmount)}`, 155, currentY + 21)
    }

    // Linha 3: Módulos Incluídos
    doc.setTextColor(textColor[0], textColor[1], textColor[2])
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text('Módulos:', 18, currentY + 28)
    doc.setFont('helvetica', 'normal')
    doc.text(splitCats, 35, currentY + 28)

    currentY += cardHeight + 8

    // 4. SEÇÃO SUPERIOR: PACOTES DE SERVIÇOS & SESSÕES UTILIZADAS
    if (packages.length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
        doc.text('📦 PACOTES DE SERVIÇOS & SESSÕES UTILIZADAS', 14, currentY)
        currentY += 6

        packages.forEach((pkg, index) => {
            // Verificar espaço para o cabeçalho do pacote e a tabela
            if (currentY > 240) {
                doc.addPage()
                currentY = 20
            }

            // Bloco de cabeçalho do Pacote Individual
            const pkgDateFormatted = pkg.date
                ? new Date(pkg.date.includes('T') ? pkg.date : pkg.date + 'T12:00:00').toLocaleDateString('pt-BR')
                : '-'
            const isPkgPaid = ['paid', 'pago'].includes((pkg.paymentStatus || '').toLowerCase())

            doc.setFillColor(235, 242, 250)
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.roundedRect(14, currentY, 182, 16, 2, 2, 'FD')

            doc.setFont('helvetica', 'bold')
            doc.setFontSize(9.5)
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.text(`PACOTE ${index + 1}: ${pkg.name.toUpperCase()}`, 18, currentY + 6)

            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8.5)
            doc.setTextColor(textColor[0], textColor[1], textColor[2])
            let pkgSub = `Data / Vencimento: ${pkgDateFormatted}`
            if (pkg.periodLabel) pkgSub += ` • Ref: ${pkg.periodLabel}`
            doc.text(pkgSub, 18, currentY + 12)

            // Valor do pacote e status no lado direito
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(9)
            doc.text(`Valor do Pacote: ${formatCurrency(pkg.amount)}`, 128, currentY + 6)

            if (isPkgPaid) {
                doc.setTextColor(16, 185, 129)
                doc.text(`[PAGO]`, 185, currentY + 6, { align: 'right' })
            } else {
                doc.setTextColor(220, 38, 38)
                doc.text(`[PENDENTE]`, 185, currentY + 6, { align: 'right' })
            }

            currentY += 19

            // Tabela de Sessões Utilizadas do Pacote
            const sessionRows: any[][] = []

            if (pkg.sessions && pkg.sessions.length > 0) {
                pkg.sessions.forEach(sess => {
                    const dateCol = formatDateCol(sess.date)
                    const sessionIdxLabel = sess.sessionIndex ? ` (Sessão ${sess.sessionIndex})` : ''
                    const servLabel = `${sess.serviceName}${sessionIdxLabel}`
                    const statusLabel = translateStatus(sess.status)

                    let extraCol = '-'
                    let extraAmountCol = '-'

                    if (sess.hasExtras && sess.extrasAmount > 0) {
                        const extraPayTag = sess.extrasPaymentStatus === 'paid' ? ' [Pago]' : ' [A Receber]'
                        extraCol = `${sess.extrasDescription || 'Serviço Extra'}${extraPayTag}`
                        extraAmountCol = formatCurrency(sess.extrasAmount)
                    }

                    sessionRows.push([
                        dateCol,
                        servLabel,
                        statusLabel,
                        'Incluso no Pacote', // NÃO mostra 0,00!
                        extraCol,
                        extraAmountCol
                    ])
                })
            } else {
                sessionRows.push([
                    '-',
                    'Nenhuma sessão utilizada neste período selecionado',
                    '-',
                    'Incluso no Pacote',
                    '-',
                    '-'
                ])
            }

            const pkgTotalExtras = pkg.sessions.reduce((sum, s) => sum + (Number(s.extrasAmount) || 0), 0)
            const pkgTotalCombined = pkg.amount + pkgTotalExtras

            const footCols: any[] = [
                'TOTAL DO PACOTE',
                `Pacote: ${formatCurrency(pkg.amount)}`,
                '',
                '',
                `Extras: ${formatCurrency(pkgTotalExtras)}`,
                formatCurrency(pkgTotalCombined)
            ]

            autoTable(doc, {
                startY: currentY,
                head: [['Data', 'Serviço do Pacote', 'Status', 'Valor do Serviço', 'Serviço Extra / Táxi no Dia', 'Valor Extra (R$)']],
                body: sessionRows,
                foot: [footCols],
                theme: 'striped',
                headStyles: {
                    fillColor: [55, 95, 140],
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
                    0: { cellWidth: 24, fontStyle: 'bold' },
                    1: { cellWidth: 42 },
                    2: { cellWidth: 22 },
                    3: { cellWidth: 26, fontStyle: 'italic', textColor: [100, 110, 120] },
                    4: { cellWidth: 44 },
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
        doc.setFontSize(11)
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
        const sectionTitle = packages.length > 0
            ? '🛒 ATENDIMENTOS E LANÇAMENTOS AVULSOS (SEM PACOTE)'
            : '🛒 ATENDIMENTOS E LANÇAMENTOS AVULSOS'
        doc.text(sectionTitle, 14, currentY)
        currentY += 4

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
            const paymentTag = item.paymentStatus === 'paid' ? ' [Pago]' : item.paymentStatus === 'pending' ? ' [A Receber]' : ''
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
