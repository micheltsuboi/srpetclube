const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/financeiro/page.tsx');
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
    ".eq('org_id', profile.org_id)\\n                    .gte('scheduled_at', fetchStart),",
    ".eq('org_id', profile.org_id)\\n                    .or(`scheduled_at.gte.${fetchStart},paid_at.gte.${fetchStart}`),"
);

fs.writeFileSync(filePath, code);
console.log('Patched financeiro appts query');
