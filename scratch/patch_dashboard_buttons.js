const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/page.tsx');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add imports
code = code.replace(
    "import { processRecurringExpenses, deleteFinancialTransaction } from '@/app/actions/finance'",
    "import { processRecurringExpenses, deleteFinancialTransaction } from '@/app/actions/finance'\nimport { payPetshopSale } from '@/app/actions/petshop'\nimport { updatePackagePaymentStatus } from '@/app/actions/package'"
);

// 2. Add handlers
const handlers = `
    const handleConfirmPetshopPayment = async (saleId: string, productName: string, price: number) => {
        if (confirm(\`Confirmar pagamento de R$ \${price.toFixed(2).replace('.', ',')} para \${productName}?\`)) {
            const paymentMethod = prompt('Qual a forma de pagamento? (pix, cash, credit, debit)', 'pix')
            if (paymentMethod) {
                const res = await payPetshopSale(saleId, paymentMethod)
                if (res.success) {
                    alert(res.message)
                    window.location.reload()
                } else {
                    alert(res.message)
                }
            }
        }
    }

    const handleConfirmPackagePayment = async (packageId: string, packageName: string, price: number) => {
        if (confirm(\`Confirmar pagamento de R$ \${price.toFixed(2).replace('.', ',')} para o pacote \${packageName}?\`)) {
            const paymentMethod = prompt('Qual a forma de pagamento? (pix, cash, credit, debit)', 'pix')
            if (paymentMethod) {
                const res = await updatePackagePaymentStatus(packageId, 'paid', paymentMethod)
                if (res.success) {
                    alert(res.message)
                    window.location.reload()
                } else {
                    alert(res.message)
                }
            }
        }
    }
`;

code = code.replace(
    "    const handleConfirmPayment = async (appointmentId: string) => {",
    handlers + "\n    const handleConfirmPayment = async (appointmentId: string) => {"
);

// 3. Add buttons to JSX
code = code.replace(
    "<span className={styles.extractAmount}>\n                            {formatCurrency(sale.total_price)}\n                        </span>\n                    </div>",
    "<span className={styles.extractAmount}>\n                            {formatCurrency(sale.total_price)}\n                        </span>\n                        <button\n                            className={styles.confirmPayBtn}\n                            onClick={() => handleConfirmPetshopPayment(sale.id, sale.description || 'Venda', sale.total_price)}\n                        >\n                            Confirmar Pago\n                        </button>\n                    </div>"
);

code = code.replace(
    "<span className={styles.extractAmount}>\n                            {formatCurrency(pkg.total_paid || pkg.calculated_price || 0)}\n                        </span>\n                    </div>",
    "<span className={styles.extractAmount}>\n                            {formatCurrency(pkg.total_paid || pkg.calculated_price || 0)}\n                        </span>\n                        <button\n                            className={styles.confirmPayBtn}\n                            onClick={() => handleConfirmPackagePayment(pkg.id, pkg.service_packages?.name || 'Pacote', pkg.total_paid || pkg.calculated_price || 0)}\n                        >\n                            Confirmar Pago\n                        </button>\n                    </div>"
);

fs.writeFileSync(filePath, code);
console.log('Patched dashboard buttons');
