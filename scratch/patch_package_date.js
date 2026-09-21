const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/actions/package.ts');
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
    "date: pkg.purchased_at, // DATA ORIGINAL DA COMPRA",
    "date: new Date().toISOString(), // HOJE (data do pagamento real)"
);

fs.writeFileSync(filePath, code);
console.log('Patched package.ts date');
