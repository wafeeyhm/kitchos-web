'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

type InventoryItem = {
  id: string
  name: string
  unit_of_measure: string
}

type BOMItem = {
  inventory_item_id: string
  quantity_required: number
}

type ProductWithBOM = {
  id: string
  name: string
  selling_price: number
  bill_of_materials: {
    quantity_required: number
    inventory_items: {
      name: string
      unit_of_measure: string
    } | null
  }[]
}

export default function MenuManager() {
  const [products, setProducts] = useState<ProductWithBOM[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  // Form State for New Product
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  
  // Recipe mapping: array of { inventory_item_id, quantity_required }
  const [recipeItems, setRecipeItems] = useState<BOMItem[]>([])
  const [selectedIngredient, setSelectedIngredient] = useState('')
  const [ingredientQty, setIngredientQty] = useState('')

  const supabase = createClient()
  const router = useRouter()

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Fetch inventory items for recipe building
    const { data: invData } = await supabase
      .from('inventory_items')
      .select('id, name, unit_of_measure')
      .order('name')

    if (invData) setInventoryItems(invData)

    // Fetch products along with their Bill of Materials and ingredient details
    const { data: prodData } = await supabase
      .from('products')
      .select(`
        id,
        name,
        selling_price,
        bill_of_materials (
          quantity_required,
          inventory_items ( name, unit_of_measure )
        )
      `)
      .order('name')

    if (prodData) setProducts(prodData as unknown as ProductWithBOM[])
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const addIngredientToRecipe = () => {
    if (!selectedIngredient || !ingredientQty) return
    const qty = parseFloat(ingredientQty)
    if (isNaN(qty) || qty <= 0) return

    // Prevent duplicate ingredient selection
    if (recipeItems.some(item => item.inventory_item_id === selectedIngredient)) return

    setRecipeItems([...recipeItems, { inventory_item_id: selectedIngredient, quantity_required: qty }])
    setSelectedIngredient('')
    setIngredientQty('')
  }

  const removeRecipeItem = (id: string) => {
    setRecipeItems(recipeItems.filter(item => item.inventory_item_id !== id))
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName || !newPrice) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('users')
      .select('tenant_id')
      .single()

    if (!profile) return

    // 1. Insert Product
    const { data: productData, error: prodError } = await supabase
      .from('products')
      .insert({
        tenant_id: profile.tenant_id,
        name: newName,
        selling_price: parseFloat(newPrice),
        is_active: true
      })
      .select()
      .single()

    if (prodError || !productData) {
      console.error("Failed to create product:", prodError)
      alert("Error creating product.")
      return
    }

    // 2. Insert BOM items if any
    if (recipeItems.length > 0) {
      const bomPayload = recipeItems.map(item => ({
        product_id: productData.id,
        inventory_item_id: item.inventory_item_id,
        quantity_required: item.quantity_required
      }))

      const { error: bomError } = await supabase
        .from('bill_of_materials')
        .insert(bomPayload)

      if (bomError) {
        console.error("Failed to save product recipe:", bomError)
        alert("Product created, but recipe mapping failed.")
      }
    }

    // Reset Form & Refresh
    setIsCreating(false)
    setNewName('')
    setNewPrice('')
    setRecipeItems([])
    fetchData()
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-emerald-400">Loading Menu Manager...</div>

  return (
    <div className="flex h-screen bg-zinc-950 font-sans text-white overflow-hidden">
      <Sidebar />
      
      <div className="flex flex-1 flex-col overflow-y-auto p-8 relative">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Menu & BOM Manager</h1>
              <p className="mt-1 text-zinc-400">Create sellable items and map their raw inventory recipes.</p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-zinc-950 shadow-lg transition hover:bg-emerald-400"
            >
              + Add New Product
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {products.map((product) => (
              <div key={product.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-zinc-100">{product.name}</h3>
                    <span className="text-lg font-extrabold text-emerald-400">${Number(product.selling_price).toFixed(2)}</span>
                  </div>

                  <div className="border-t border-zinc-800 pt-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-2">Recipe (Bill of Materials)</span>
                    {product.bill_of_materials && product.bill_of_materials.length > 0 ? (
                      <ul className="space-y-1.5">
                        {product.bill_of_materials.map((bom, idx) => (
                          <li key={idx} className="flex justify-between text-xs bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800/60">
                            <span className="text-zinc-300 font-medium">{bom.inventory_items?.name}</span>
                            <span className="text-emerald-400 font-bold">
                              {bom.quantity_required} {bom.inventory_items?.unit_of_measure}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-zinc-500 italic">No raw inventory mapped (direct sale item).</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CREATE PRODUCT MODAL */}
        {isCreating && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl my-8">
              <h2 className="text-2xl font-bold mb-1">Create New Product</h2>
              <p className="text-sm text-zinc-400 mb-6">Define your menu item and its ingredient breakdown.</p>
              
              <form onSubmit={handleCreateProduct} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Product Name</label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Teh Tarik"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Selling Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      placeholder="2.50"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Recipe Builder Section */}
                <div className="border-t border-zinc-800 pt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Bill of Materials (Recipe)</label>
                  
                  <div className="flex gap-2 mb-3">
                    <select
                      value={selectedIngredient}
                      onChange={(e) => setSelectedIngredient(e.target.value)}
                      className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">Select Ingredient...</option>
                      {inventoryItems.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name} ({inv.unit_of_measure})
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      step="any"
                      value={ingredientQty}
                      onChange={(e) => setIngredientQty(e.target.value)}
                      placeholder="Qty"
                      className="w-24 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
                    />

                    <button
                      type="button"
                      onClick={addIngredientToRecipe}
                      className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 transition"
                    >
                      Add
                    </button>
                  </div>

                  {/* Added recipe list */}
                  {recipeItems.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto mb-4 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                      {recipeItems.map((item) => {
                        const invObj = inventoryItems.find(i => i.id === item.inventory_item_id)
                        return (
                          <div key={item.inventory_item_id} className="flex justify-between items-center text-xs bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800">
                            <span>{invObj?.name} - <strong className="text-emerald-400">{item.quantity_required} {invObj?.unit_of_measure}</strong></span>
                            <button
                              type="button"
                              onClick={() => removeRecipeItem(item.inventory_item_id)}
                              className="text-rose-400 hover:text-rose-300 font-bold px-2"
                            >
                              ✕
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic mb-4">No recipe ingredients added yet for this product.</p>
                  )}
                </div>

                <div className="flex space-x-3 pt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => { setIsCreating(false); setRecipeItems([]); setNewName(''); setNewPrice(''); }}
                    className="flex-1 rounded-xl bg-zinc-800 py-3 font-semibold text-zinc-300 hover:bg-zinc-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-xl bg-emerald-500 py-3 font-semibold text-zinc-950 hover:bg-emerald-400 transition"
                  >
                    Save Product
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}