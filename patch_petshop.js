const fs = require('fs')

let content = fs.readFileSync('src/app/(dashboard)/owner/petshop/page.tsx', 'utf-8')

content = content.replace(
    "    const [saleData, setSaleData] = useState({",
    "    const [isSavingSale, setIsSavingSale] = useState(false)\n    const [saleData, setSaleData] = useState({"
)

content = content.replace(
    "    const handleConfirmSale = async (e: React.FormEvent) => {\n        e.preventDefault()\n        if (!productToSell) return\n\n        try {",
    "    const handleConfirmSale = async (e: React.FormEvent) => {\n        e.preventDefault()\n        if (!productToSell || isSavingSale) return\n        setIsSavingSale(true)\n\n        try {"
)

content = content.replace(
    "            setShowSaleModal(false)\n            fetchProducts()\n        } catch (error) {\n            console.error('Error completing sale:', error)\n            alert('Erro ao realizar venda')\n        }\n    }",
    "            setShowSaleModal(false)\n            fetchProducts()\n        } catch (error) {\n            console.error('Error completing sale:', error)\n            alert('Erro ao realizar venda')\n        } finally {\n            setIsSavingSale(false)\n        }\n    }"
)

fs.writeFileSync('src/app/(dashboard)/owner/petshop/page.tsx', content)
console.log('done')
