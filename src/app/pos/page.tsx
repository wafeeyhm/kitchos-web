'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

type Product = { id: string; name: string; selling_price: number }
type CartItem = Product & { quantity: number }

export default function POSTerminal() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  
  // Payment State Machine
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [paymentStep, setPaymentStep] = useState<'select' | 'qr' | 'processing' | 'success'>('select')
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function fetchProducts() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      
      const { data } = await supabase.from('products').select('*')
      if (data) setProducts(data)
      
      setLoading(false)
    }
    fetchProducts()
  }, [router, supabase])

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id)
      if (existing) {
        return prev.map((item) => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const clearCart = () => setCart([])

  const total = cart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0)

  const handlePaymentSelection = async (wallet: string) => {
    setSelectedWallet(wallet)
    setPaymentStep('qr')
    
    setTimeout(async () => {
      setPaymentStep('processing')
      
      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id, branch_id')
        .single()

      if (!profile) return

      const formattedCart = cart.map(item => ({
        id: item.id,
        quantity: item.quantity,
        price: item.selling_price
      }))

      const { error } = await supabase.rpc('process_sale', {
        p_tenant_id: profile.tenant_id,
        p_branch_id: profile.branch_id,
        p_payment_method: wallet,
        p_total_amount: total,
        p_items: formattedCart
      })

      if (error) {
        console.error("Checkout failed:", error)
        alert("Transaction failed! Check console.")
        setPaymentStep('select')
        return
      }
      
      setPaymentStep('success')
    }, 2500)
  }

  const closeCheckout = () => {
    if (paymentStep === 'success') clearCart()
    setIsCheckoutOpen(false)
    setPaymentStep('select')
    setSelectedWallet(null)
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-emerald-400">Loading Terminal...</div>

  return (
    <div className="flex h-screen bg-zinc-950 font-sans text-white overflow-hidden">
      
      {/* PERSISTENT SIDEBAR */}
      <Sidebar />

      {/* LEFT PANEL: Product Grid */}
      <div className="flex-1 flex flex-col p-8 overflow-y-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">POS Terminal</h1>
          <p className="text-sm text-zinc-400">Select items to build an active order</p>
        </header>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-20">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              className="flex flex-col h-32 justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left shadow-lg transition active:scale-95 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <span className="font-semibold text-zinc-200 line-clamp-2">{product.name}</span>
              <span className="text-lg font-bold text-emerald-400">${product.selling_price.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL: Current Cart */}
      <div className="w-96 flex flex-col border-l border-zinc-800 bg-zinc-900 shadow-2xl flex-shrink-0">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-lg font-bold">Current Order</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cart.length === 0 ? (
            <p className="text-center text-zinc-500 mt-10">Cart is empty</p>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="font-medium text-sm text-zinc-200">{item.name}</span>
                  <span className="text-xs text-zinc-500">x{item.quantity}</span>
                </div>
                <span className="font-semibold">${(item.selling_price * item.quantity).toFixed(2)}</span>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-zinc-950 border-t border-zinc-800">
          <div className="flex justify-between items-center mb-6">
            <span className="text-zinc-400 font-semibold uppercase tracking-wider text-sm">Total</span>
            <span className="text-3xl font-extrabold text-emerald-400">${total.toFixed(2)}</span>
          </div>
          <button
            onClick={() => setIsCheckoutOpen(true)}
            disabled={cart.length === 0}
            className="w-full rounded-xl bg-emerald-500 py-4 font-bold text-white shadow-lg transition hover:bg-emerald-400 disabled:opacity-30 disabled:hover:bg-emerald-500"
          >
            CHARGE
          </button>
        </div>
      </div>

      {/* CHECKOUT MODAL OVERLAY */}
      {isCheckoutOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
            
            {paymentStep === 'select' && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-center mb-6">Select Payment</h2>
                <button onClick={() => handlePaymentSelection('Cash')} className="w-full rounded-xl bg-zinc-800 py-4 font-bold text-white hover:bg-zinc-700 transition">Cash</button>
                <button onClick={() => handlePaymentSelection('Touch n Go')} className="w-full rounded-xl bg-blue-600 py-4 font-bold text-white hover:bg-blue-500 transition">Touch 'n Go eWallet</button>
                <button onClick={() => handlePaymentSelection('DANA')} className="w-full rounded-xl bg-sky-500 py-4 font-bold text-white hover:bg-sky-400 transition">DANA</button>
                <button onClick={closeCheckout} className="w-full mt-4 text-sm text-zinc-500 hover:text-white">Cancel</button>
              </div>
            )}

            {paymentStep === 'qr' && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="h-48 w-48 bg-white mb-6 p-2 rounded-xl flex items-center justify-center">
                  <div className="h-full w-full border-4 border-dashed border-zinc-300 flex items-center justify-center text-zinc-400 text-center text-sm font-semibold">
                    Dynamic QR<br/>Payload
                  </div>
                </div>
                <h3 className="text-xl font-bold text-emerald-400">Awaiting {selectedWallet} Scan...</h3>
                <p className="text-sm text-zinc-500 mt-2 text-center">Customer should scan using their app.</p>
              </div>
            )}

            {paymentStep === 'processing' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="h-12 w-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
                <h3 className="text-xl font-bold">Verifying Webhook...</h3>
              </div>
            )}

            {paymentStep === 'success' && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="h-20 w-20 rounded-full bg-emerald-500 flex items-center justify-center">
                  <span className="text-4xl text-zinc-900 font-extrabold">✓</span>
                </div>
                <h3 className="text-2xl font-bold text-emerald-400">Payment Complete</h3>
                <button onClick={closeCheckout} className="mt-8 w-full rounded-xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700 transition">Start New Order</button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}