const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/page.tsx');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add handlePartialPayment
const partialHandler = `
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

        setLoading(true);
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
            window.location.reload();
        } catch (error) {
            console.error('Erro no pagamento parcial:', error);
            alert('Ocorreu um erro ao registrar o pagamento parcial.');
            setLoading(false);
        }
    }
`;

code = code.replace(
    "const handleConfirmPetshopPayment = async (saleId: string, productName: string, price: number) => {",
    partialHandler + "\n    const handleConfirmPetshopPayment = async (saleId: string, productName: string, price: number) => {"
);

// 2. Add buttons for partial payments to appts, sales, pkgs
code = code.replace(
    "Confirmar Pago\n                        </button>\n                    </div>\n                </div>\n            ))}",
    "Confirmar Pago\n                        </button>\n                        <button\n                            className={styles.confirmPayBtn}\n                            style={{ backgroundColor: '#f39c12', marginLeft: '0.5rem' }}\n                            onClick={() => handlePartialPayment('appointment', appt.id, appt.final_price || appt.calculated_price || 0, \`\${appt.pets?.name || 'Pet'} • \${appt.services?.name || 'Serviço'}\`)}\n                        >\n                            Pagar Parcial\n                        </button>\n                    </div>\n                </div>\n            ))}"
);

code = code.replace(
    "Confirmar Pago\n                        </button>\n                    </div>\n                </div>\n            ))}\n            {extractRecords.type === 'pending' && filteredPackages.map",
    "Confirmar Pago\n                        </button>\n                        <button\n                            className={styles.confirmPayBtn}\n                            style={{ backgroundColor: '#f39c12', marginLeft: '0.5rem' }}\n                            onClick={() => handlePartialPayment('sale', sale.id, sale.total_price || 0, sale.description || 'Venda')}\n                        >\n                            Pagar Parcial\n                        </button>\n                    </div>\n                </div>\n            ))}\n            {extractRecords.type === 'pending' && filteredPackages.map"
);

// Need to match exactly for packages...
// Let's use a regex or specific replace
