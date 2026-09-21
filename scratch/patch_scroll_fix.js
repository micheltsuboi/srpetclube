const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/financeiro/page.tsx');
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
    "if (isExtractModalOpen || isAddExpenseModalOpen || isNewTransactionModalOpen) {",
    "if (isExtractModalOpen || isAddExpenseModalOpen) {"
);

code = code.replace(
    "}, [isExtractModalOpen, isAddExpenseModalOpen, isNewTransactionModalOpen]);",
    "}, [isExtractModalOpen, isAddExpenseModalOpen]);"
);

fs.writeFileSync(filePath, code);
console.log('Patched financeiro/page.tsx to remove isNewTransactionModalOpen');
