const fs = require('fs');
const path = require('path');

function patchCss(relativePath) {
    const filePath = path.join(__dirname, '..', relativePath);
    let code = fs.readFileSync(filePath, 'utf8');

    code = code.replace(
        "overflow-y: auto;",
        "overflow-y: auto;\n    overscroll-behavior: contain;\n    -webkit-overflow-scrolling: touch;"
    );

    fs.writeFileSync(filePath, code);
    console.log('Patched CSS in', relativePath);
}

patchCss('src/app/(dashboard)/owner/financeiro/page.module.css');
patchCss('src/app/(dashboard)/owner/page.module.css');
