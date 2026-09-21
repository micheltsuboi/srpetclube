const fs = require('fs');
const path = require('path');

function patchFile(relativePath, modalVars) {
    const filePath = path.join(__dirname, '..', relativePath);
    let code = fs.readFileSync(filePath, 'utf8');

    // Add useEffect to the top of the component
    const effectCode = `
    useEffect(() => {
        if (${modalVars.join(' || ')}) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; }
    }, [${modalVars.join(', ')}]);
`;

    // Insert right after the last useState
    // We can just find the first useEffect and insert before it
    code = code.replace("useEffect(() => {", effectCode + "\n    useEffect(() => {");
    
    fs.writeFileSync(filePath, code);
    console.log('Patched', relativePath);
}

patchFile('src/app/(dashboard)/owner/financeiro/page.tsx', [
    'isExtractModalOpen',
    'isAddExpenseModalOpen',
    'isNewTransactionModalOpen'
]);

patchFile('src/app/(dashboard)/owner/page.tsx', [
    'isExtractModalOpen'
]);
