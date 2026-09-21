const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/actions/package.ts');
let code = fs.readFileSync(filePath, 'utf8');

// Replace the end of updatePackagePaymentStatus
code = code.replace(
    "    revalidatePath('/owner/banho-tosa')\n    revalidatePath('/owner/hospedagem')\n}",
    "    revalidatePath('/owner/banho-tosa')\n    revalidatePath('/owner/hospedagem')\n\n    return { success: true, message: 'Status de pagamento atualizado com sucesso!' }\n}"
);

// Add try-catch block and return error
code = code.replace(
    "export async function updatePackagePaymentStatus(id: string, status: string, method?: string) {\n    const supabase = await createClient()",
    "export async function updatePackagePaymentStatus(id: string, status: string, method?: string) {\n    try {\n    const supabase = await createClient()"
);

code = code.replace(
    "    return { success: true, message: 'Status de pagamento atualizado com sucesso!' }\n}",
    "    return { success: true, message: 'Status de pagamento atualizado com sucesso!' }\n    } catch (e: any) {\n        console.error(e);\n        return { success: false, message: 'Erro ao atualizar pagamento do pacote.' }\n    }\n}"
);

fs.writeFileSync(filePath, code);
console.log('Patched packages.ts');
