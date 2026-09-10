'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

type InventoryItem = {
  id: string
  name: string
  unit_of_measure: string
  quantity_in_stock: number
}

export default function InventoryManager() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  
  // Restock Modal State
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [restockAmount, setRestockAmount] = useState('')
  const [isRestocking, setIsRestocking] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  const fetchInventory = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data } = await supabase
      .from('inventory_items')
      .select('*')
      .order('name')

    if (data) setItems(data)
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem || !restockAmount) return

    setIsRestocking(true)
    const qtyToAdd = parseFloat(restockAmount)

    const newTotal = selectedItem.quantity_in_stock + qtyToAdd

    const { error } = await supabase
      .from('inventory_items')
      .update({ quantity_in_stock: newTotal })
      .eq('id', selectedItem.id)

    if (error) {
      console.error("Restock failed:", error)
      alert("Failed to update inventory.")
    } else {
      setSelectedItem(null)
      setRestockAmount('')
      fetchInventory() // Refresh table data
    }
    setIsRestocking(false)
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-emerald-400">Loading Inventory...</div>

  return (
    <div className="flex h-screen bg-zinc-950 font-sans text-white overflow-hidden">
      <Sidebar />
      
      <div className="flex flex-1 flex-col overflow-y-auto p-8 relative">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Inventory Manager</h1>
              <p className="mt-1 text-zinc-400">Track raw ingredients and restock levels in real-time.</p>
            </div>
          </header>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-800/50 text-zinc-400">
                <tr>
                  <th className="p-4 font-semibold">Ingredient Name</th>
                  <th className="p-4 font-semibold">Unit</th>
                  <th className="p-4 font-semibold text-right">Current Stock</th>
                  <th className="p-4 font-semibold text-center">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-zinc-800/20">
                    <td className="p-4 font-medium text-zinc-200">{item.name}</td>
                    <td className="p-4 text-zinc-500 uppercase text-xs tracking-wider">{item.unit_of_measure}</td>
                    <td className="p-4 text-right font-bold text-emerald-400">{item.quantity_in_stock}</td>
                    <td className="p-4 text-center">
                      {item.quantity_in_stock < 50 ? (
                        <span className="rounded-full bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-400 border border-rose-500/20">Low Stock</span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">Healthy</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-emerald-500 hover:text-zinc-950"
                      >
                        + Restock
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-zinc-500">No inventory items found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RESTOCK MODAL */}
        {selectedItem && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
              <h2 className="text-xl font-bold mb-2">Restock Item</h2>
              <p className="text-sm text-zinc-400 mb-6">Adding stock for <span className="text-white font-semibold">{selectedItem.name}</span> ({selectedItem.unit_of_measure}).</p>
              
              <form onSubmit={handleRestockSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Quantity to Add</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={restockAmount}
                    onChange={(e) => setRestockAmount(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setSelectedItem(null); setRestockAmount(''); }}
                    className="flex-1 rounded-xl bg-zinc-800 py-3 font-semibold text-zinc-300 hover:bg-zinc-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRestocking}
                    className="flex-1 rounded-xl bg-emerald-500 py-3 font-semibold text-zinc-950 hover:bg-emerald-400 transition disabled:opacity-50"
                  >
                    {isRestocking ? 'Updating...' : 'Confirm'}
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