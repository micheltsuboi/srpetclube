const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/page.tsx');
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
    "onClick={() => handlePayAllFiltered(filteredAppts, filteredSales, filteredPackages, totalFiltered)}",
    "onClick={() => handlePayAllFiltered(filteredPendingAppts, filteredSales, filteredPackages, totalFiltered)}"
);

fs.writeFileSync(filePath, code);
console.log('Patched dashboard button arguments');
