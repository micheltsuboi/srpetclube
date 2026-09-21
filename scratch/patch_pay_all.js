const fs = require('fs');
const path = require('path');

function patchFinanceiro() {
    const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/financeiro/page.tsx');
    let code = fs.readFileSync(filePath, 'utf8');

    // 1. Add handlePayAllFiltered inside the component
    const functionCode = `
    const handlePayAllFiltered = async (appts: any[], sales: any[], pkgs: any[], total: number) => {
        if (!confirm(\`Deseja quitar todos os \${appts.length + sales.length + pkgs.length} itens filtrados no valor total de \${formatCurrency(total)}?\`)) return;

        const paymentMethod = prompt('Qual a forma de pagamento para TODOS os itens? (pix, cash, credit, debit)', 'pix');
        if (!paymentMethod) return;

        setLoading(true);
        try {
            for (const appt of appts) {
                await supabase.from('appointments').update({
                    payment_status: 'paid',
                    paid_at: new Date().toISOString()
                }).eq('id', appt.id);
            }
            for (const sale of sales) {
                await payPetshopSale(sale.id, paymentMethod);
            }
            for (const pkg of pkgs) {
                await updatePackagePaymentStatus(pkg.id, 'paid', paymentMethod);
            }
            alert('Todos os itens filtrados foram pagos com sucesso!');
            fetchFinancials();
        } catch (error) {
            console.error('Erro ao pagar tudo:', error);
            alert('Houve um erro ao tentar quitar os itens.');
        } finally {
            setLoading(false);
        }
    }
`;

    // Insert handlePayAllFiltered before handleConfirmPayment
    code = code.replace(
        "    const handleConfirmPayment = async",
        functionCode + "\n    const handleConfirmPayment = async"
    );

    // 2. Add the button to the JSX
    // In financeiro, it's filteredAppts, filteredSales, filteredPkgs
    const btnCode = `
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: extractRecords.type === 'expenses' ? '#ef4444' : '#10b981' }}>
                            {formatCurrency(totalFiltered)}
                        </span>
                        {extractRecords.type === 'pending' && (
                            <button
                                className={styles.confirmPayBtn}
                                style={{ backgroundColor: '#10b981', padding: '0.4rem 1rem', fontSize: '0.9rem' }}
                                onClick={() => handlePayAllFiltered(filteredAppts, filteredSales, filteredPkgs, totalFiltered)}
                            >
                                Pagar Tudo
                            </button>
                        )}
                    </div>
    `;

    code = code.replace(
        /<span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: extractRecords.type === 'expenses' \? '#ef4444' : '#10b981' }}>[\s\S]*?<\/span>/,
        btnCode
    );

    fs.writeFileSync(filePath, code);
    console.log('Patched financeiro/page.tsx');
}

function patchDashboard() {
    const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/page.tsx');
    let code = fs.readFileSync(filePath, 'utf8');

    // 1. Add handlePayAllFiltered
    const functionCode = `
    const handlePayAllFiltered = async (appts: any[], sales: any[], pkgs: any[], total: number) => {
        if (!confirm(\`Deseja quitar todos os \${appts.length + sales.length + pkgs.length} itens filtrados no valor total de \${formatCurrency(total)}?\`)) return;

        const paymentMethod = prompt('Qual a forma de pagamento para TODOS os itens? (pix, cash, credit, debit)', 'pix');
        if (!paymentMethod) return;

        setLoading(true);
        try {
            for (const appt of appts) {
                await supabase.from('appointments').update({
                    payment_status: 'paid',
                    paid_at: new Date().toISOString()
                }).eq('id', appt.id);
            }
            for (const sale of sales) {
                await payPetshopSale(sale.id, paymentMethod);
            }
            for (const pkg of pkgs) {
                await updatePackagePaymentStatus(pkg.id, 'paid', paymentMethod);
            }
            alert('Todos os itens filtrados foram pagos com sucesso!');
            window.location.reload();
        } catch (error) {
            console.error('Erro ao pagar tudo:', error);
            alert('Houve um erro ao tentar quitar os itens.');
            setLoading(false);
        }
    }
`;

    // Insert handlePayAllFiltered before handleConfirmPayment
    code = code.replace(
        "    const handleConfirmPayment = async",
        functionCode + "\n    const handleConfirmPayment = async"
    );

    // 2. Add the button to the JSX
    // In dashboard, it's filteredAppts, filteredSales, filteredPackages
    const btnCode = `
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <strong style={{ fontSize: '1.2rem', color: '#10b981' }}>{formatCurrency(totalFiltered)}</strong>
                        {extractRecords.type === 'pending' && (
                            <button
                                className={styles.confirmPayBtn}
                                style={{ backgroundColor: '#10b981', padding: '0.4rem 1rem', fontSize: '0.9rem' }}
                                onClick={() => handlePayAllFiltered(filteredAppts, filteredSales, filteredPackages, totalFiltered)}
                            >
                                Pagar Tudo
                            </button>
                        )}
                    </div>
    `;

    // Let's check how the dashboard renders totalFiltered first
    // I'll do this safely by reading the file and replacing the correct block.
    
    // In dashboard:
    // <strong style={{ fontSize: '1.2rem', color: '#10b981' }}>{formatCurrency(totalFiltered)}</strong>
    code = code.replace(
        /<strong style={{ fontSize: '1.2rem', color: '#10b981' }}>{formatCurrency\(totalFiltered\)}<\/strong>/,
        btnCode
    );

    fs.writeFileSync(filePath, code);
    console.log('Patched dashboard/owner/page.tsx');
}

patchFinanceiro();
patchDashboard();
