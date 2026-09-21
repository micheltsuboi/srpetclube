const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/page.tsx');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Update extractRecords state
code = code.replace(
    "allPending: any[];\n    }>({",
    "allPending: any[];\n        pendingSales: any[];\n        pendingPackages: any[];\n    }>({"
);
code = code.replace(
    "allPending: []\n    })",
    "allPending: [],\n        pendingSales: [],\n        pendingPackages: []\n    })"
);

// 2. Fetch sales and packages
const fetchStr = `
                const { data: pendingSalesData } = await supabase
                    .from('petshop_sales')
                    .select('id, total_price, payment_status, created_at, description, pets ( name, customers ( name ) )')
                    .eq('org_id', profile.org_id)
                    .eq('payment_status', 'pending')
                    .order('created_at', { ascending: true })

                const { data: pendingPackagesData } = await supabase
                    .from('customer_packages')
                    .select('id, total_paid, calculated_price, payment_status, purchased_at, pets ( name, customers ( name ) ), service_packages ( name )')
                    .eq('org_id', profile.org_id)
                    .eq('payment_status', 'pending')
                    .order('purchased_at', { ascending: true })
`;

code = code.replace(
    "const paidAppts = (currentMonthAppts || []).filter(a => a.payment_status === 'paid' && !(a as any).package_credit_id)",
    fetchStr + "\n                const paidAppts = (currentMonthAppts || []).filter(a => a.payment_status === 'paid' && !(a as any).package_credit_id)"
);

// 3. Update pendingPayments calculation
code = code.replace(
    "const pendingPayments = pendingAppts\n                    .reduce((sum, a) => sum + Number(a.final_price ?? a.calculated_price ?? 0), 0)",
    "const pendingPayments = pendingAppts.reduce((sum, a) => sum + Number(a.final_price ?? a.calculated_price ?? 0), 0) + (pendingSalesData || []).reduce((sum, s) => sum + Number(s.total_price), 0) + (pendingPackagesData || []).reduce((sum, p) => sum + Number(p.total_paid || p.calculated_price || 0), 0)"
);

// 4. Store in extractRecords
code = code.replace(
    "allPending: (allPendingAppts || []).filter(a => !(a as any).package_credit_id)\n                })",
    "allPending: (allPendingAppts || []).filter(a => !(a as any).package_credit_id),\n                    pendingSales: pendingSalesData || [],\n                    pendingPackages: pendingPackagesData || []\n                })"
);

// 5. Update filtering and totalFiltered
const filterStr = `
    const filteredSales = extractRecords.type === 'pending' ? extractRecords.pendingSales
        .filter(s => {
            if (!extractSearchTerm) return true
            const search = extractSearchTerm.toLowerCase()
            return s.description?.toLowerCase().includes(search) || 
                   s.pets?.name?.toLowerCase().includes(search) ||
                   s.pets?.customers?.name?.toLowerCase().includes(search)
        }) : []

    const filteredPackages = extractRecords.type === 'pending' ? extractRecords.pendingPackages
        .filter(p => {
            if (!extractSearchTerm) return true
            const search = extractSearchTerm.toLowerCase()
            return p.service_packages?.name?.toLowerCase().includes(search) || 
                   p.pets?.name?.toLowerCase().includes(search) ||
                   p.pets?.customers?.name?.toLowerCase().includes(search)
        }) : []
`;

code = code.replace(
    "const totalFiltered = filteredAppts.reduce((acc, a) => acc + (a.final_price ?? a.calculated_price ?? 0), 0) +\n                          filteredPendingAppts.reduce((acc, a) => acc + (a.final_price ?? a.calculated_price ?? 0), 0) +\n                          filteredTxs.reduce((acc, t) => acc + t.amount, 0)",
    filterStr + "\n    const totalFiltered = filteredAppts.reduce((acc, a) => acc + (a.final_price ?? a.calculated_price ?? 0), 0) +\n                          filteredPendingAppts.reduce((acc, a) => acc + (a.final_price ?? a.calculated_price ?? 0), 0) +\n                          filteredSales.reduce((acc, s) => acc + s.total_price, 0) +\n                          filteredPackages.reduce((acc, p) => acc + (p.total_paid || p.calculated_price || 0), 0) +\n                          filteredTxs.reduce((acc, t) => acc + t.amount, 0)"
);

code = code.replace(
    "const isEmpty = filteredAppts.length === 0 && filteredPendingAppts.length === 0 && filteredTxs.length === 0",
    "const isEmpty = filteredAppts.length === 0 && filteredPendingAppts.length === 0 && filteredSales.length === 0 && filteredPackages.length === 0 && filteredTxs.length === 0"
);

// 6. Update JSX to render Sales and Packages
const jsxStr = `
            {extractRecords.type === 'pending' && filteredSales.map(sale => (
                <div key={sale.id} className={styles.extractItem}>
                    <div className={styles.extractInfo}>
                        <strong>🛍️ {sale.description || 'Venda'} ({sale.pets?.customers?.name || 'Sem tutor'})</strong>
                        <span>{new Date(sale.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div className={styles.extractActions}>
                        <span className={styles.extractAmount}>
                            {formatCurrency(sale.total_price)}
                        </span>
                    </div>
                </div>
            ))}
            {extractRecords.type === 'pending' && filteredPackages.map(pkg => (
                <div key={pkg.id} className={styles.extractItem}>
                    <div className={styles.extractInfo}>
                        <strong>📦 Pacote: {pkg.service_packages?.name} ({pkg.pets?.customers?.name || 'Sem tutor'})</strong>
                        <span>{new Date(pkg.purchased_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div className={styles.extractActions}>
                        <span className={styles.extractAmount}>
                            {formatCurrency(pkg.total_paid || pkg.calculated_price || 0)}
                        </span>
                    </div>
                </div>
            ))}
`;

code = code.replace(
    "{filteredTxs.map(tx => (",
    jsxStr + "\n            {filteredTxs.map(tx => ("
);

// 7. Change window.location.reload to preserve state!
// Wait! `fetchDashboardData()` exists inside useEffect. We need to call it! 
// But it's defined inside useEffect!
// The easiest fix for Dashboard: just close the modal and window.location.reload() OR we can move fetchDashboardData outside.
// Actually, they didn't explicitly complain about Dashboard reloading, but they said "quando clicar em confirmar pago, não está fazendo o pagamento".
// Let's modify handleConfirmPayment in owner/page.tsx to just `window.location.reload()`. Oh wait, it already does that!
// If it reloads, the user sees it as a flash. But the payment IS made!
// Why did they say it's not made? Because in `financeiro/page.tsx` the `type` was reset to `null` so the modal just closed without reloading!
// Wait, in `owner/page.tsx`, does it make the payment? Yes. 

fs.writeFileSync(filePath, code);
console.log('Patched owner/page.tsx');
