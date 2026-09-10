'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

// Define our data structures
type Product = { id: string; name: string; selling_price: number }
type CartItem = Product & { quantity: number }

export default function POSTerminal() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [diagnosticData, setDiagnosticData] = useState<any>(null) // New diagnostic state
  
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
      
      // Fetch products and capture both data and errors for the diagnostic box
      const { data, error } = await supabase.from('products').select('*')
      
      setDiagnosticData({ data, error }) // Store raw response for debugging

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
    
    // Simulate waiting for customer to scan QR code
    setTimeout(async () => {
      setPaymentStep('processing')
      
      // 1. Get current user's workspace context
      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id, branch_id')
        .single()

      if (!profile) return

      // 2. Format the cart for PostgreSQL
      const formattedCart = cart.map(item => ({
        id: item.id,
        quantity: item.quantity,
        price: item.selling_price
      }))

      // 3. Trigger the database transaction
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
      
      // 4. Show success screen
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
    <div className="flex h-screen overflow-hidden bg-zinc-950 font-sans text-white">
      
      {/* LEFT PANEL: Product Grid & Diagnostics */}
      <div className="flex flex-1 flex-col overflow-y-auto p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight">Terminal</h1>
          <p className="text-sm text-zinc-400">Select items to add to order</p>
        </header>
        
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              className="flex h-32 flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left shadow-lg transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 active:scale-95"
            >
              <span className="line-clamp-2 font-semibold text-zinc-200">{product.name}</span>
              <span className="text-lg font-bold text-emerald-400">${product.selling_price.toFixed(2)}</span>
            </button>
          ))}
        </div>

        {/* Debug Console */}
        <div className="mt-auto rounded-xl border border-zinc-800 bg-black p-6 shadow-lg">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-rose-400">System Diagnostic Data</h3>
          <pre className="overflow-auto whitespace-pre-wrap text-xs text-emerald-400">
            {JSON.stringify(diagnosticData, null, 2)}
          </pre>
        </div>
      </div>

      {/* RIGHT PANEL: Current Cart */}
      <div className="flex w-96 flex-shrink-0 flex-col border-l border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="border-b border-zinc-800 p-6">
          <h2 className="text-lg font-bold">Current Order</h2>
        </div>
        
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {cart.length === 0 ? (
            <p className="mt-10 text-center text-zinc-500">Cart is empty</p>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-zinc-200">{item.name}</span>
                  <span className="text-xs text-zinc-500">x{item.quantity}</span>
                </div>
                <span className="font-semibold">${(item.selling_price * item.quantity).toFixed(2)}</span>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-zinc-800 bg-zinc-950 p-6">
          <div className="mb-6 flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Total</span>
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
            
            {paymentStep === 'select' && (
              <div className="space-y-4">
                <h2 className="mb-6 text-center text-2xl font-bold">Select Payment</h2>
                <button onClick={() => handlePaymentSelection('Cash')} className="w-full rounded-xl bg-zinc-800 py-4 font-bold text-white transition hover:bg-zinc-700">Cash</button>
                <button onClick={() => handlePaymentSelection('Touch n Go')} className="w-full rounded-xl bg-blue-600 py-4 font-bold text-white transition hover:bg-blue-500">Touch 'n Go eWallet</button>
                <button onClick={() => handlePaymentSelection('DANA')} className="w-full rounded-xl bg-sky-500 py-4 font-bold text-white transition hover:bg-sky-400">DANA</button>
                <button onClick={closeCheckout} className="mt-4 w-full text-sm text-zinc-500 hover:text-white">Cancel</button>
              </div>
            )}

            {paymentStep === 'qr' && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="mb-6 flex h-48 w-48 items-center justify-center rounded-xl bg-white p-2">
                  <div className="flex h-full w-full items-center justify-center border-4 border-dashed border-zinc-300 text-center text-sm font-semibold text-zinc-400">
                    Dynamic QR<br/>Payload
                  </div>
                </div>
                <h3 className="text-xl font-bold text-emerald-400">Awaiting {selectedWallet} Scan...</h3>
                <p className="mt-2 text-center text-sm text-zinc-500">Customer should scan using their app.</p>
              </div>
            )}

            {paymentStep === 'processing' && (
              <div className="flex flex-col items-center justify-center space-y-4 py-12">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
                <h3 className="text-xl font-bold">Verifying Webhook...</h3>
              </div>
            )}

            {paymentStep === 'success' && (
              <div className="flex flex-col items-center justify-center space-y-4 py-8">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500">
                  <span className="text-4xl font-extrabold text-zinc-900">✓</span>
                </div>
                <h3 className="text-2xl font-bold text-emerald-400">Payment Complete</h3>
                <button onClick={closeCheckout} className="mt-8 w-full rounded-xl bg-zinc-800 py-3 font-bold text-white transition hover:bg-zinc-700">Start New Order</button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}