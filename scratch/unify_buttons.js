const fs = require('fs');
const path = require('path');

const financeiroPath = path.join(__dirname, '../src/app/(dashboard)/owner/financeiro/page.tsx');
const dashboardPath = path.join(__dirname, '../src/app/(dashboard)/owner/page.tsx');

let finCode = fs.readFileSync(financeiroPath, 'utf8');
let dashCode = fs.readFileSync(dashboardPath, 'utf8');

// The JSX for buttons we want:
const apptButtons = `
                        <button
                            className={styles.confirmPayBtn}
                            onClick={() => handleConfirmPayment(appt.id)}
                        >
                            Confirmar Pago
                        </button>
                        <button
                            className={styles.confirmPayBtn}
                            style={{ backgroundColor: '#f39c12', marginLeft: '0.5rem' }}
                            onClick={() => handlePartialPayment('appointment', appt.id, appt.final_price ?? appt.calculated_price ?? 0, \`\${appt.pets?.name || 'Pet'} • \${appt.services?.name || 'Serviço'}\`)}
                        >
                            Pagar Parcial
                        </button>`;

const saleButtons = `
                        <button
                            className={styles.confirmPayBtn}
                            onClick={() => handleConfirmPetshopPayment(sale.id, sale.description || 'Venda', sale.total_price)}
                        >
                            Confirmar Pago
                        </button>
                        <button
                            className={styles.confirmPayBtn}
                            style={{ backgroundColor: '#f39c12', marginLeft: '0.5rem' }}
                            onClick={() => handlePartialPayment('sale', sale.id, sale.total_price || 0, sale.description || 'Venda')}
                        >
                            Pagar Parcial
                        </button>`;

const pkgButtons = `
                        <button
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
                        </button>`;


// We need to replace the actions div content
function replaceActions(code, mapVar, itemName, replacement) {
    // Regex to find: <div className={styles.extractActions}> ... </div> inside mapVar.map
    const regex = new RegExp(\`(\\\\.map\\\\(\\\\(?\${itemName}(: any)?\\\\)? => \\\\(\\\\s*<div.*?className={styles.extractItem}>.*?<div className={styles.extractActions}>\\\\s*<span className={styles.extractAmount}>.*?<\\\\/span>)[\\\\s\\\\S]*?(<\\\\/div>\\\\s*<\\\\/div>\\\\s*\\\\)\\\\))\`, 'g');
    
    return code.replace(regex, \`$1\\n\${replacement}\\n                    $3\`);
}

finCode = replaceActions(finCode, 'filteredAppts', 'appt', apptButtons);
finCode = replaceActions(finCode, 'filteredSales', 'sale', saleButtons);
finCode = replaceActions(finCode, 'filteredPkgs', 'pkg', pkgButtons);

dashCode = replaceActions(dashCode, 'filteredPendingAppts', 'appt', apptButtons);
dashCode = replaceActions(dashCode, 'filteredSales', 'sale', saleButtons);
dashCode = replaceActions(dashCode, 'filteredPackages', 'pkg', pkgButtons);

fs.writeFileSync(financeiroPath, finCode);
fs.writeFileSync(dashboardPath, dashCode);
console.log('Buttons unified in both files.');

