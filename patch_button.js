const fs = require('fs')

let content = fs.readFileSync('src/app/(dashboard)/owner/petshop/page.tsx', 'utf-8')

content = content.replace(
    "<button type=\"submit\" style={{ padding: '0.75rem 1.5rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>\n                                Confirmar Venda",
    "<button type=\"submit\" disabled={isSavingSale} style={{ padding: '0.75rem 1.5rem', background: isSavingSale ? '#94a3b8' : '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: isSavingSale ? 'not-allowed' : 'pointer', fontWeight: 600 }}>\n                                {isSavingSale ? 'Processando...' : 'Confirmar Venda'}"
)

fs.writeFileSync('src/app/(dashboard)/owner/petshop/page.tsx', content)
console.log('done')
