const fs = require('fs')

let content = fs.readFileSync('src/components/EditAppointmentModal.tsx', 'utf-8')

content = content.replace(
    "import { updateAppointment, deleteAppointment } from '@/app/actions/appointment'",
    "import { updateAppointment, deleteAppointment } from '@/app/actions/appointment'\nimport { createPetshopSale } from '@/app/actions/petshop'"
)

content = content.replace(
    "    base_price: number\n}",
    "    base_price: number\n}\n\ninterface Product {\n    id: string\n    name: string\n    price: number\n    stock_quantity: number\n}"
)

content = content.replace(
    "    const [services, setServices] = useState<Service[]>([])",
    "    const [services, setServices] = useState<Service[]>([])\n    const [products, setProducts] = useState<Product[]>([])\n\n    // Product Sales States\n    const [selectedProductId, setSelectedProductId] = useState('')\n    const [productQuantity, setProductQuantity] = useState(1)\n    const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending')\n    const [paymentMethod, setPaymentMethod] = useState('cash')\n    const [productSales, setProductSales] = useState<Array<{ product_id: string, product_name: string, quantity: number, unit_price: number, total_price: number, payment_status: 'pending' | 'paid', payment_method: string }>>([])"
)

content = content.replace(
    "            if (data) setServices(data)",
    "            if (data) setServices(data)\n\n            const { data: prodData } = await supabase\n                .from('products')\n                .select('id, name, price, stock_quantity')\n                .eq('org_id', profile.org_id)\n                .order('name')\n            \n            if (prodData) setProducts(prodData)"
)

const handlers = `
    const handleRemoveExtra = (e: React.MouseEvent, index: number) => {
        e.preventDefault()
        e.stopPropagation()
        const newExtras = [...extrasList]
        newExtras.splice(index, 1)
        setExtrasList(newExtras)
    }

    const handleAddProduct = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!selectedProductId || productQuantity <= 0) return
        
        const product = products.find(p => p.id === selectedProductId)
        if (!product) return

        setProductSales([...productSales, {
            product_id: product.id,
            product_name: product.name,
            quantity: productQuantity,
            unit_price: product.price,
            total_price: product.price * productQuantity,
            payment_status: paymentStatus,
            payment_method: paymentMethod
        }])
        
        setSelectedProductId('')
        setProductQuantity(1)
        setPaymentStatus('pending')
    }

    const handleRemoveProduct = (e: React.MouseEvent, index: number) => {
        e.preventDefault()
        e.stopPropagation()
        const newSales = [...productSales]
        newSales.splice(index, 1)
        setProductSales(newSales)
    }
`

content = content.replace(
    "    const handleRemoveExtra = (e: React.MouseEvent, index: number) => {\n        e.preventDefault()\n        e.stopPropagation()\n        setExtrasList(extrasList.filter((_, i) => i !== index))\n    }",
    handlers.trim()
)

const saveLogic = `        const result = await updateAppointment({ message: '', success: false }, formData)

        if (result.success) {
            for (const sale of productSales) {
                await createPetshopSale({
                    pet_id: appointment.pet_id,
                    product_id: sale.product_id,
                    product_name: sale.product_name,
                    quantity: sale.quantity,
                    unit_price: sale.unit_price,
                    total_price: sale.total_price,
                    payment_status: sale.payment_status,
                    payment_method: sale.payment_method
                })
            }
        }

        setLoading(false)`

content = content.replace(
    "        const result = await updateAppointment({ message: '', success: false }, formData)\n\n        setLoading(false)",
    saveLogic
)

const productsUI = `                            {extrasList.length > 0 && (
                                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid #334155' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>EXTRAS ADICIONADOS:</span>
                                    {extrasList.map((item, index) => (
                                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>{item.name}</span>
                                                <span style={{ fontSize: '0.8rem', color: '#E8826A', fontWeight: 700 }}>R$ {item.price.toFixed(2)}</span>
                                            </div>
                                            <button
                                                onClick={(e) => handleRemoveExtra(e, index)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#ef4444',
                                                    fontSize: '1.2rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    padding: '4px'
                                                }}
                                                title="Remover"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #334155', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                        <span style={{ color: '#cbd5e1' }}>Total Extras:</span>
                                        <span style={{ color: '#E8826A' }}>R$ {extrasList.reduce((sum, item) => sum + item.price, 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Produtos do Pet */}
                        <div style={{ 
                            background: 'rgba(59, 130, 246, 0.05)', 
                            padding: '1rem', 
                            borderRadius: '12px', 
                            border: '1px solid rgba(59, 130, 246, 0.1)',
                            marginBottom: '0.5rem'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>🛒 Adicionar Produtos?</span>
                                <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Venda de produtos de petshop associados a este agendamento.</span>
                            </div>
                            
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>PRODUTO</label>
                                    <select
                                        value={selectedProductId}
                                        onChange={(e) => setSelectedProductId(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                    >
                                        <option value="">Selecione um produto...</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} - R$ {p.price.toFixed(2)} ({p.stock_quantity} em estoque)</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>QUANTIDADE</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={productQuantity}
                                            onChange={(e) => setProductQuantity(parseInt(e.target.value) || 1)}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>PAGAMENTO</label>
                                        <select
                                            value={paymentStatus}
                                            onChange={(e) => setPaymentStatus(e.target.value as 'paid' | 'pending')}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                        >
                                            <option value="pending">Pendente (Cobrar Depois)</option>
                                            <option value="paid">Pago</option>
                                        </select>
                                    </div>
                                </div>
                                {paymentStatus === 'paid' && (
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '0.25rem' }}>MÉTODO DE PAGAMENTO</label>
                                        <select
                                            value={paymentMethod}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: 'white', fontSize: '0.85rem' }}
                                        >
                                            <option value="pix">PIX</option>
                                            <option value="cash">Dinheiro</option>
                                            <option value="credit">Cartão de Crédito</option>
                                            <option value="debit">Cartão de Débito</option>
                                        </select>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                                    <button
                                        onClick={handleAddProduct}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            fontSize: '0.85rem',
                                            height: '34px',
                                            borderColor: '#3b82f6',
                                            color: 'white',
                                            background: '#3b82f6',
                                            borderRadius: '8px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            border: 'none'
                                        }}
                                    >
                                        + Add Produto
                                    </button>
                                </div>
                            </div>

                            {productSales.length > 0 && (
                                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid #334155' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>PRODUTOS ADICIONADOS:</span>
                                    {productSales.map((item, index) => (
                                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>{item.quantity}x {item.product_name}</span>
                                                <span style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 700 }}>R$ {item.total_price.toFixed(2)} - {item.payment_status === 'paid' ? 'Pago' : 'Pendente'}</span>
                                            </div>
                                            <button
                                                onClick={(e) => handleRemoveProduct(e, index)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#ef4444',
                                                    fontSize: '1.2rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    padding: '4px'
                                                }}
                                                title="Remover"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #334155', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                        <span style={{ color: '#cbd5e1' }}>Total Produtos:</span>
                                        <span style={{ color: '#3b82f6' }}>R$ {productSales.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </div>`

const originalExtrasUI = `                            {extrasList.length > 0 && (
                                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid #334155' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>EXTRAS ADICIONADOS:</span>
                                    {extrasList.map((item, index) => (
                                        <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>{item.name}</span>
                                                <span style={{ fontSize: '0.8rem', color: '#E8826A', fontWeight: 700 }}>R$ {item.price.toFixed(2)}</span>
                                            </div>
                                            <button
                                                onClick={(e) => handleRemoveExtra(e, index)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#ef4444',
                                                    fontSize: '1.2rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    padding: '4px'
                                                }}
                                                title="Remover"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #334155', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                        <span style={{ color: '#cbd5e1' }}>Total Extras:</span>
                                        <span style={{ color: '#E8826A' }}>R$ {extrasList.reduce((sum, item) => sum + item.price, 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            )}
                        </div>`

content = content.replace(originalExtrasUI, productsUI)
fs.writeFileSync('src/components/EditAppointmentModal.tsx', content)
console.log('done')
