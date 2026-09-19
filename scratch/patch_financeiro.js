const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/financeiro/page.tsx');
let code = fs.readFileSync(filePath, 'utf8');

const partialPaymentCode = `
    const handlePartialPayment = async (type: 'appointment' | 'sale' | 'package', id: string, currentAmount: number, description: string) => {
        const amountStr = prompt(\`Valor pendente atual: R$ \${currentAmount.toFixed(2).replace('.', ',')}\\n\\nQuanto o cliente deseja pagar agora?\`);
        if (!amountStr) return;
        const amountPaid = parseFloat(amountStr.replace(',', '.'));
        if (isNaN(amountPaid) || amountPaid <= 0) {
            alert('Valor inválido.');
            return;
        }

        if (amountPaid >= currentAmount) {
            if (type === 'appointment') return handleConfirmPayment(id);
            if (type === 'sale') return handleConfirmPetshopPayment(id, description, currentAmount);
            if (type === 'package') return handleConfirmPackagePayment(id, description, currentAmount);
        }

        const paymentMethod = prompt('Qual a forma de pagamento? (pix, cash, credit, debit)', 'pix');
        if (!paymentMethod) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user?.id).single();
            if (!profile?.org_id) return;

            const res = await supabase.from('financial_transactions').insert({
                org_id: profile.org_id,
                type: 'income',
                category: 'Pagamento Parcial',
                amount: amountPaid,
                description: \`Pagamento parcial: \${description}\`,
                payment_method: paymentMethod,
                date: new Date().toISOString()
            });

            if (res.error) throw res.error;

            const remaining = currentAmount - amountPaid;

            if (type === 'appointment') {
                await supabase.from('appointments').update({ final_price: remaining }).eq('id', id);
            } else if (type === 'sale') {
                await supabase.from('petshop_sales').update({ total_price: remaining }).eq('id', id);
            } else if (type === 'package') {
                await supabase.from('customer_packages').update({ total_paid: remaining, calculated_price: remaining }).eq('id', id);
            }

            alert('Pagamento parcial registrado. O valor pendente foi atualizado!');
            fetchFinancials();
        } catch (error) {
            console.error('Erro no pagamento parcial:', error);
            alert('Erro ao processar pagamento parcial.');
        }
    };
`;

code = code.replace("const [selectedCategory, setSelectedCategory] = useState<string>('all')", partialPaymentCode + "\n\n    const [selectedCategory, setSelectedCategory] = useState<string>('all')");

// Add button to appointments
code = code.replace(
    \`<button
                                className={styles.confirmPayBtn}
                                onClick={() => handleConfirmPayment(appt.id)}
                            >
                                Confirmar Pago
                            </button>\`,
    \`<button
                                className={styles.confirmPayBtn}
                                onClick={() => handleConfirmPayment(appt.id)}
                            >
                                Confirmar Pago
                            </button>
                            <button
                                className={styles.confirmPayBtn}
                                style={{ backgroundColor: '#f39c12', marginLeft: '0.5rem' }}
                                onClick={() => handlePartialPayment('appointment', appt.id, appt.final_price || appt.calculated_price || 0, \`\${appt.pets?.name || 'Pet'} • \${appt.services?.name || 'Serviço'}\`)}
                            >
                                Pagar Parcial
                            </button>\`
);

// Add button to sales
code = code.replace(
    \`<button
                            className={styles.confirmPayBtn}
                            onClick={() => handleConfirmPetshopPayment(sale.id, sale.product_name, sale.total_price)}
                        >
                            Confirmar Pago
                        </button>\`,
    \`<button
                            className={styles.confirmPayBtn}
                            onClick={() => handleConfirmPetshopPayment(sale.id, sale.product_name, sale.total_price)}
                        >
                            Confirmar Pago
                        </button>
                        <button
                            className={styles.confirmPayBtn}
                            style={{ backgroundColor: '#f39c12', marginLeft: '0.5rem' }}
                            onClick={() => handlePartialPayment('sale', sale.id, sale.total_price, \`Venda: \${sale.product_name}\`)}
                        >
                            Pagar Parcial
                        </button>\`
);

// Add button to packages
code = code.replace(
    \`<button
                            className={styles.confirmPayBtn}
                            onClick={() => handleConfirmPackagePayment(pkg.id, pkg.service_packages?.name || 'Pacote', pkg.total_paid || pkg.calculated_price || 0)}
                        >
                            Confirmar Pago
                        </button>\`,
    \`<button
                            className={styles.confirmPayBtn}
                            onClick={() => handleConfirmPackagePayment(pkg.id, pkg.service_packages?.name || 'Pacote', pkg.total_paid || pkg.calculated_price || 0)}
                        >
                            Confirmar Pago
                        </button>
                        <button
                            className={styles.confirmPayBtn}
                            style={{ backgroundColor: '#f39c12', marginLeft: '0.5rem' }}
                            onClick={() => handlePartialPayment('package', pkg.id, pkg.total_paid || pkg.calculated_price || 0, \`Pacote: \${pkg.service_packages?.name || 'Pacote'}\`)}
                        >
                            Pagar Parcial
                        </button>\`
);

fs.writeFileSync(filePath, code);
console.log('Patched financeiro/page.tsx');
