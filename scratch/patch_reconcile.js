const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/actions/reconcile_packages.ts');
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
    "const petName = Array.isArray(pkg.pets) ? pkg.pets[0]?.name : pkg.pets?.name",
    "const petName = Array.isArray(pkg.pets) ? (pkg.pets as any)[0]?.name : (pkg.pets as any)?.name"
);
code = code.replace(
    "const customerName = Array.isArray(pkg.customers) ? pkg.customers[0]?.name : pkg.customers?.name",
    "const customerName = Array.isArray(pkg.customers) ? (pkg.customers as any)[0]?.name : (pkg.customers as any)?.name"
);

fs.writeFileSync(filePath, code);
console.log('Patched reconcile_packages.ts');
