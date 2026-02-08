'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Product, ProductFormData } from '@/types/database'
import styles from './page.module.css'

// Mock Data
const mockProducts: Product[] = [
    {
        id: '1',
        org_id: 'org_1',
        name: 'Ração Premium Adulto 15kg',
        category: 'Alimentação',
        cost_price: 180.00,
        selling_price: 249.90,
        stock_quantity: 45,
        min_stock_threshold: 10,
        expiration_date: '2025-12-31',
        photo_url: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '2',
        org_id: 'org_1',
        name: 'Shampoo Hipoalergênico 500ml',
        category: 'Higiene',
        cost_price: 25.50,
        selling_price: 49.90,
        stock_quantity: 12,
        min_stock_threshold: 5,
        expiration_date: '2024-10-15',
        photo_url: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '3',
        org_id: 'org_1',
        name: 'Brinquedo Mordedor Resistente',
        category: 'Brinquedos',
        cost_price: 15.00,
        selling_price: 39.90,
        stock_quantity: 8,
        min_stock_threshold: 15,
        expiration_date: null,
        photo_url: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: '4',
        org_id: 'org_1',
        name: 'Antipulgas Pipeta P',
        category: 'Farmácia',
        cost_price: 45.00,
        selling_price: 89.90,
        stock_quantity: 100,
        min_stock_threshold: 20,
        expiration_date: '2024-06-01', // Near expiration example
        photo_url: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
]

export default function PetshopPage() {
    const [products, setProducts] = useState<Product[]>(mockProducts)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('Todas')
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false)
    const [saleData, setSaleData] = useState({
        quantity: 1,
        tempDiscountPercent: 0
    })
    const [productToSell, setProductToSell] = useState<Product | null>(null)

    // Form State
    const [formData, setFormData] = useState<ProductFormData>({
        name: '',
        category: 'Alimentação',
        cost_price: 0,
        selling_price: 0,
        stock_quantity: 0,
        expiration_date: '',
        description: ''
    })

    const categories = ['Todas', 'Alimentação', 'Higiene', 'Brinquedos', 'Farmácia', 'Acessórios']

    const handleOpenModal = (product?: Product) => {
        if (product) {
            setEditingProduct(product)
            setFormData({
                name: product.name,
                category: product.category,
                cost_price: product.cost_price,
                selling_price: product.selling_price,
                stock_quantity: product.stock_quantity,
                expiration_date: product.expiration_date || '',
                description: product.description || ''
            })
        } else {
            setEditingProduct(null)
            setFormData({
                name: '',
                category: 'Alimentação',
                cost_price: 0,
                selling_price: 0,
                stock_quantity: 0,
                expiration_date: '',
                description: ''
            })
        }
        setIsModalOpen(true)
    }

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault()

        if (editingProduct) {
            // Update existing
            setProducts(products.map(p => p.id === editingProduct.id ? {
                ...p,
                ...formData,
                updated_at: new Date().toISOString()
            } : p))
        } else {
            // Create new
            const newProduct: Product = {
                id: Math.random().toString(36).substr(2, 9),
                org_id: 'org_1',
                ...formData,
                expiration_date: formData.expiration_date || null,
                photo_url: null,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
            setProducts([...products, newProduct])
        }
        setIsModalOpen(false)
    }

    const handleOpenSaleModal = (product: Product) => {
        setProductToSell(product)
        setSaleData({ quantity: 1, tempDiscountPercent: 0 })
        setIsSaleModalOpen(true)
    }

    const handleConfirmSale = (e: React.FormEvent) => {
        e.preventDefault()
        if (!productToSell) return

        const discountAmount = (productToSell.selling_price * saleData.quantity) * (saleData.tempDiscountPercent / 100)
        const finalTotal = (productToSell.selling_price * saleData.quantity) - discountAmount

        // Update Stock
        setProducts(products.map(p => p.id === productToSell.id ? {
            ...p,
            stock_quantity: p.stock_quantity - saleData.quantity,
            updated_at: new Date().toISOString()
        } : p))

        // In a real app, this would also post to a 'transactions' table
        alert(`Venda realizada com sucesso!\n\nTotal: ${formatCurrency(finalTotal)}\nEstoque atualizado.`)

        setIsSaleModalOpen(false)
        setProductToSell(null)
    }

    const handleDelete = (id: string) => {
        if (confirm('Tem certeza que deseja excluir este produto?')) {
            setProducts(products.filter(p => p.id !== id))
        }
    }

    const filteredProducts = products.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesCategory = selectedCategory === 'Todas' || product.category === selectedCategory
        return matchesSearch && matchesCategory
    })

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'N/A'
        return new Date(dateString).toLocaleDateString('pt-BR')
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>📦 Gestão de Produtos</h1>
                    <p className={styles.subtitle}>Gerencie o estoque e catálogo do Pet Shop</p>
                </div>
                <button className={styles.addButton} onClick={() => handleOpenModal()}>
                    ➕ Novo Produto
                </button>
            </div>

            <div className={styles.filters}>
                <div className={styles.searchBox}>
                    <input
                        type="text"
                        placeholder="Buscar produtos..."
                        className={styles.searchInput}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <span className={styles.searchIcon}>🔍</span>
                </div>
                <select
                    className={styles.categoryFilter}
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                >
                    {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

            <div className={styles.grid}>
                {filteredProducts.map(product => (
                    <div key={product.id} className={styles.productCard}>
                        <div className={styles.productImage}>
                            {/* Placeholder for image */}
                            <div style={{ width: '100%', height: '100%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
                                📦
                            </div>
                        </div>
                        <div className={styles.productContent}>
                            <div className={styles.productHeader}>
                                <div>
                                    <span className={styles.productCategory}>{product.category}</span>
                                    <h3 className={styles.productName}>{product.name}</h3>
                                </div>
                            </div>

                            <div className={styles.productPrice}>
                                {formatCurrency(product.selling_price)}
                                <div style={{ fontSize: '0.75rem', color: '#666', fontWeight: 'normal' }}>
                                    Custo: {formatCurrency(product.cost_price)}
                                </div>
                            </div>

                            <div className={styles.stockInfo}>
                                <div>
                                    <span className={styles.stockLabel}>Estoque: </span>
                                    <span className={`${styles.stockValue} ${product.stock_quantity < (product.min_stock_threshold || 5) ? styles.lowStock : ''}`}>
                                        {product.stock_quantity} un
                                    </span>
                                </div>
                                <div>
                                    <span className={styles.stockLabel}>Validade: </span>
                                    <span className={styles.stockValue}>{formatDate(product.expiration_date)}</span>
                                </div>
                            </div>

                            <div className={styles.actions}>
                                <button className={`${styles.actionButton} ${styles.saleButton}`} onClick={() => handleOpenSaleModal(product)}>
                                    💲 Vender
                                </button>
                                <button className={`${styles.actionButton} ${styles.editButton}`} onClick={() => handleOpenModal(product)}>
                                    ✏️ Editar
                                </button>
                                <button className={`${styles.actionButton} ${styles.deleteButton}`} onClick={() => handleDelete(product.id)}>
                                    🗑️ Excluir
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={() => setIsModalOpen(false)}>×</button>
                        <h2>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h2>

                        <form onSubmit={handleSave}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Nome do Produto</label>
                                <input
                                    className={styles.input}
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className={styles.row}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Categoria</label>
                                    <select
                                        className={styles.select}
                                        value={formData.category}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                    >
                                        {categories.filter(c => c !== 'Todas').map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Validade</label>
                                    <input
                                        className={styles.input}
                                        type="date"
                                        value={formData.expiration_date}
                                        onChange={e => setFormData({ ...formData, expiration_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className={styles.row}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Preço de Custo (R$)</label>
                                    <input
                                        className={styles.input}
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        required
                                        value={formData.cost_price}
                                        onChange={e => setFormData({ ...formData, cost_price: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Preço de Venda (R$)</label>
                                    <input
                                        className={styles.input}
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        required
                                        value={formData.selling_price}
                                        onChange={e => setFormData({ ...formData, selling_price: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className={styles.row}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Quantidade em Estoque</label>
                                    <input
                                        className={styles.input}
                                        type="number"
                                        min="0"
                                        required
                                        value={formData.stock_quantity}
                                        onChange={e => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Descrição</label>
                                <textarea
                                    className={styles.textarea}
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <button type="submit" className={styles.submitButton}>
                                Salvar Produto
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {isSaleModalOpen && productToSell && (
                <div className={styles.modalOverlay} onClick={() => setIsSaleModalOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.closeButton} onClick={() => setIsSaleModalOpen(false)}>×</button>
                        <h2><span className={styles.modalIcon}>$</span> Registrar Venda</h2>
                        <p className={styles.subtitle}>{productToSell.name}</p>

                        <form onSubmit={handleConfirmSale} className={styles.saleForm}>
                            <div className={styles.saleInfo}>
                                <div className={styles.infoRow}>
                                    <span>Preço Unitário:</span>
                                    <strong>{formatCurrency(productToSell.selling_price)}</strong>
                                </div>
                                <div className={styles.infoRow}>
                                    <span>Em Estoque:</span>
                                    <strong>{productToSell.stock_quantity} un</strong>
                                </div>
                            </div>

                            <div className={styles.row}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Quantidade</label>
                                    <input
                                        className={styles.input}
                                        type="number"
                                        min="1"
                                        max={productToSell.stock_quantity}
                                        required
                                        value={saleData.quantity}
                                        onChange={e => setSaleData({ ...saleData, quantity: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Desconto (%)</label>
                                    <input
                                        className={styles.input}
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={saleData.tempDiscountPercent}
                                        onChange={e => setSaleData({ ...saleData, tempDiscountPercent: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className={styles.totalSection}>
                                <div className={styles.totalRow}>
                                    <span>Subtotal:</span>
                                    <span>{formatCurrency(productToSell.selling_price * saleData.quantity)}</span>
                                </div>
                                <div className={styles.totalRow}>
                                    <span>Desconto:</span>
                                    <span className={styles.discountValue}>
                                        - {formatCurrency((productToSell.selling_price * saleData.quantity) * (saleData.tempDiscountPercent / 100))}
                                    </span>
                                </div>
                                <div className={`${styles.totalRow} ${styles.finalTotal}`}>
                                    <span>Total Final:</span>
                                    <span>
                                        {formatCurrency(
                                            (productToSell.selling_price * saleData.quantity) -
                                            ((productToSell.selling_price * saleData.quantity) * (saleData.tempDiscountPercent / 100))
                                        )}
                                    </span>
                                </div>
                            </div>

                            <button type="submit" className={`${styles.submitButton} ${styles.confirmSaleButton}`}>
                                Confirmar Venda
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
