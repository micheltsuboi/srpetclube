const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(dashboard)/owner/financeiro/page.tsx');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add allPendingAppts query
code = code.replace(
    "const [apptsResponse, txsResponse, pendingSalesResponse, pendingPackagesResponse] = await Promise.all([",
    "const [apptsResponse, txsResponse, pendingSalesResponse, pendingPackagesResponse, allPendingApptsResponse] = await Promise.all(["
);

code = code.replace(
    "supabase\n                    .from('customer_packages')\n                    .select('id, total_paid, calculated_price, payment_status, purchased_at, pets ( name, customers ( name ) ), service_packages ( name )')\n                    .eq('org_id', profile.org_id)\n                    .eq('payment_status', 'pending')\n                    .order('purchased_at', { ascending: true })",
    "supabase\n                    .from('customer_packages')\n                    .select('id, total_paid, calculated_price, payment_status, purchased_at, pets ( name, customers ( name ) ), service_packages ( name )')\n                    .eq('org_id', profile.org_id)\n                    .eq('payment_status', 'pending')\n                    .order('purchased_at', { ascending: true }),\n                supabase\n                    .from('appointments')\n                    .select(`\n                        id, final_price, calculated_price, payment_status, scheduled_at, paid_at, package_credit_id,\n                        pets ( name, customers ( name ) ),\n                        services ( name, service_categories ( name ) )\n                    `)\n                    .eq('org_id', profile.org_id)\n                    .neq('payment_status', 'paid')\n                    .order('scheduled_at', { ascending: true })"
);

// 2. Add allPendingAppts data
code = code.replace(
    "const pendingPackages = (pendingPackagesResponse.data || [])",
    "const pendingPackages = (pendingPackagesResponse.data || [])\n            const allPendingAppts = (allPendingApptsResponse.data || []).filter((a: any) => !a.package_credit_id)"
);

// 3. Preserve extractRecords.type
code = code.replace(
    "setExtractRecords({\n                type: null,\n                appointments: activeAppts,\n                transactions: activeTxs,\n                pendingSales,\n                pendingPackages\n            })",
    "setExtractRecords(prev => ({\n                ...prev,\n                appointments: activeAppts,\n                transactions: activeTxs,\n                pendingSales,\n                pendingPackages,\n                allPendingAppts\n            }))"
);

// Update extractRecords default state
code = code.replace(
    "pendingPackages: any[];\n    }>({",
    "pendingPackages: any[];\n        allPendingAppts: any[];\n    }>({"
);
code = code.replace(
    "pendingPackages: []\n    })",
    "pendingPackages: [],\n        allPendingAppts: []\n    })"
);

// Update pendingTotal
code = code.replace(
    "const pendingTotal = extractRecords.appointments\n        .filter(a => a.payment_status !== 'paid' && (selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory))\n        .reduce((sum, a) => sum + (a.final_price ?? a.calculated_price ?? 0), 0)",
    "const pendingTotal = extractRecords.allPendingAppts\n        .filter(a => selectedCategory === 'all' || (a.services as any)?.service_categories?.name === selectedCategory)\n        .reduce((sum, a) => sum + (a.final_price ?? a.calculated_price ?? 0), 0)"
);

// Update extract modal list
code = code.replace(
    "const filteredAppts = extractRecords.type !== 'expenses' ? extractRecords.appointments\n        .filter(a => extractRecords.type === 'revenue' ? a.payment_status === 'paid' : a.payment_status !== 'paid')",
    "const filteredAppts = extractRecords.type === 'revenue' ? extractRecords.appointments.filter(a => a.payment_status === 'paid') : (extractRecords.type === 'pending' ? extractRecords.allPendingAppts : [])"
);

fs.writeFileSync(filePath, code);
console.log('Patched financeiro/page.tsx');
