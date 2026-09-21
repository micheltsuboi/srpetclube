const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/page.tsx');
let code = fs.readFileSync(filePath, 'utf8');

const btnCode = `
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: extractRecords.type === 'expenses' ? '#ef4444' : '#10b981' }}>
                            {formatCurrency(totalFiltered)}
                        </span>
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

code = code.replace(
    /<span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: extractRecords.type === 'expenses' \? '#ef4444' : '#10b981' }}>[\s\S]*?<\/span>/,
    btnCode
);

fs.writeFileSync(filePath, code);
console.log('Patched dashboard JSX');
