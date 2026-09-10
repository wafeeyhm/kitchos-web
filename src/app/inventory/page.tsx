'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type InventoryItem = {
  id: string
  name: string
  unit_of_measure: string
  quantity_in_stock: number
}

export default function InventoryManager() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function fetchInventory() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch inventory. RLS ensures we only see items for this specific tenant.
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name')

      if (data) setItems(data)
      setLoading(false)
    }
    fetchInventory()
  }, [router, supabase])

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-emerald-400">Loading Inventory...</div>

  return (
    <div className="min-h-screen bg-zinc-950 p-8 text-white font-sans">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Inventory Manager</h1>
            <p className="mt-1 text-zinc-400">Track raw ingredients and stock levels in real-time.</p>
          </div>
          <Link href="/" className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold hover:bg-zinc-700 transition">
            Back to Dashboard
          </Link>
        </header>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800/50 text-zinc-400">
              <tr>
                <th className="p-4 font-semibold">Ingredient Name</th>
                <th className="p-4 font-semibold">Unit</th>
                <th className="p-4 font-semibold text-right">Current Stock</th>
                <th className="p-4 font-semibold text-center">Status</th>
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
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-zinc-500">No inventory items found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}