'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

type Sale = {
  id: string
  total_amount: number
  payment_method: string
  created_at: string
}

type SaleItemDetail = {
  id: string
  quantity: number
  unit_price: number
  total_price: number
  products: {
    name: string
  } | null
}

export default function SalesHistory() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  
  // Modal State
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleItems, setSaleItems] = useState<SaleItemDetail[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function fetchSales() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false })

      if (data) setSales(data)
      setLoading(false)
    }
    fetchSales()
  }, [router, supabase])

  const handleRowClick = async (sale: Sale) => {
    setSelectedSale(sale)
    setLoadingDetails(true)
    
    // Fetch line items joined with product names
    const { data } = await supabase
      .from('sale_items')
      .select(`
        id,
        quantity,
        unit_price,
        total_price,
        products ( name )
      `)
      .eq('sale_id', sale.id)

    if (data) {
      setSaleItems(data as unknown as SaleItemDetail[])
    }
    setLoadingDetails(false)
  }

  const closeModal = () => {
    setSelectedSale(null)
    setSaleItems([])
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-emerald-400">Loading Sales History...</div>

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_amount), 0)

  return (
    <div className="flex h-screen bg-zinc-950 font-sans text-white overflow-hidden">
      <Sidebar />
      
      <div className="flex flex-1 flex-col overflow-y-auto p-8 relative">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Sales History</h1>
              <p className="mt-1 text-zinc-400">Audit past transactions and review revenue streams. Click any row for details.</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-3 text-right shadow-lg">
              <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Total Revenue</span>
              <p className="text-xl font-extrabold text-emerald-400">${totalRevenue.toFixed(2)}</p>
            </div>
          </header>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-800/50 text-zinc-400">
                <tr>
                  <th className="p-4 font-semibold">Sale ID</th>
                  <th className="p-4 font-semibold">Payment Method</th>
                  <th className="p-4 font-semibold">Date & Time</th>
                  <th className="p-4 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {sales.map((sale) => (
                  <tr 
                    key={sale.id} 
                    onClick={() => handleRowClick(sale)}
                    className="cursor-pointer transition hover:bg-zinc-800/40"
                  >
                    <td className="p-4 font-mono text-xs text-zinc-400">{sale.id.slice(0, 8)}...</td>
                    <td className="p-4 font-medium text-zinc-200">
                      <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300 border border-zinc-700">
                        {sale.payment_method}
                      </span>
                    </td>
                    <td className="p-4 text-zinc-400">{new Date(sale.created_at).toLocaleString()}</td>
                    <td className="p-4 text-right font-bold text-emerald-400">${Number(sale.total_amount).toFixed(2)}</td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-zinc-500">No transactions recorded yet. Try running a sale in the POS terminal!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SALE DETAILS MODAL */}
        {selectedSale && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-start mb-4 border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold">Receipt Breakdown</h2>
                  <p className="text-xs font-mono text-zinc-500 mt-0.5">ID: {selectedSale.id}</p>
                </div>
                <button 
                  onClick={closeModal}
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition"
                >
                  ✕ Close
                </button>
              </div>

              <div className="mb-4 flex justify-between items-center bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                <div>
                  <span className="text-xs text-zinc-400 uppercase tracking-wider block">Payment Method</span>
                  <span className="font-semibold text-zinc-200">{selectedSale.payment_method}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-zinc-400 uppercase tracking-wider block">Timestamp</span>
                  <span className="font-medium text-zinc-300 text-xs">{new Date(selectedSale.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto mb-4 border border-zinc-800 rounded-xl bg-zinc-950/50">
                {loadingDetails ? (
                  <div className="p-8 text-center text-emerald-400 text-sm">Loading receipt items...</div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-800/40 text-zinc-400 text-xs">
                      <tr>
                        <th className="p-3 font-semibold">Item</th>
                        <th className="p-3 font-semibold text-center">Qty</th>
                        <th className="p-3 font-semibold text-right">Unit Price</th>
                        <th className="p-3 font-semibold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {saleItems.map((item) => (
                        <tr key={item.id} className="text-xs">
                          <td className="p-3 font-medium text-zinc-200">{item.products?.name || 'Unknown Product'}</td>
                          <td className="p-3 text-center text-zinc-400">x{item.quantity}</td>
                          <td className="p-3 text-right text-zinc-400">${Number(item.unit_price).toFixed(2)}</td>
                          <td className="p-3 text-right font-bold text-emerald-400">${Number(item.total_price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-zinc-800">
                <span className="text-sm font-semibold text-zinc-400">Total Amount Charged</span>
                <span className="text-2xl font-extrabold text-emerald-400">${Number(selectedSale.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}