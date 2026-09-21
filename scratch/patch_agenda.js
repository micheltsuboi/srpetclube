const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/agenda/page.tsx');
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/appt\.status === 'no_show'/g, "(appt.status as string) === 'no_show'");
code = code.replace(/appt\.status !== 'no_show'/g, "(appt.status as string) !== 'no_show'");

fs.writeFileSync(filePath, code);
console.log('Patched agenda/page.tsx');
