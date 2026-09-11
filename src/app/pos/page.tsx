'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Sidebar from '@/components/Sidebar'

type Product = {
  id: string
  name: string
  category: string
  selling_price: number
  image_url?: string | null
  is_active: boolean
  max_servings: number
}

type CartItem = {
  item: Product
  quantity: number
}

type SaleRecord = {
  id: string
  total_amount: number
  payment_method: string
  amount_tendered: number
  change_due: number
  created_at: string
  items: CartItem[]
}

export default function PosPage() {
  const [mounted, setMounted] = useState(false)
  const [userProfile, setUserProfile] = useState<{
    id: string
    tenant_id: string
    branch_id: string
    email: string
  } | null>(null)

  // Catalog state
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [loadingItems, setLoadingItems] = useState(true)
  const [fetchError, setFetchError] = useState<string>('')

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])

  // Checkout modal states
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'qr'>('cash')
  const [amountTendered, setAmountTendered] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string>('')
  const [isVerifyingWebhook, setIsVerifyingWebhook] = useState(false)

  // Receipt modal state
  const [lastCompletedSale, setLastCompletedSale] = useState<SaleRecord | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  // Fetch catalog from product_availability view
  const fetchProductsCatalog = useCallback(async () => {
    try {
      const { data: items, error: productsError } = await supabase
        .from('product_availability')
        .select('*')
        .eq('is_active', true)
        .order('product_name', { ascending: true })

      if (productsError) {
        console.error('Database error fetching products:', productsError.message)
        setFetchError(productsError.message)
      } else if (items) {
        // Map database view columns to internal Product shape
        const mappedProducts: Product[] = items.map((p: any) => ({
          id: p.product_id,
          name: p.product_name,
          category: p.category || 'General',
          selling_price: Number(p.selling_price),
          image_url: p.image_url,
          is_active: p.is_active,
          max_servings: Number(p.max_servings ?? 999),
        }))
        setProducts(mappedProducts)
        setFetchError('')
      }
    } catch (err: any) {
      console.error('Error in fetchProductsCatalog:', err)
      setFetchError(err.message)
    } finally {
      setLoadingItems(false)
    }
  }, [supabase])

  const initSession = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, tenant_id, branch_id, role, full_name')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Failed to load profile:', profileError)
      router.push('/login')
      return
    }

    setUserProfile({
      id: profile.id,
      tenant_id: profile.tenant_id,
      branch_id: profile.branch_id,
      email: profile.full_name || user.email || 'staff@kitchos.com',
    })

    await fetchProductsCatalog()
  }, [router, supabase, fetchProductsCatalog])

  useEffect(() => {
    setMounted(true)
    initSession()

    // Listen to inventory changes in real-time to adjust portion limits on the fly
    const channel = supabase
      .channel(`pos-inventory-sync-${Math.random()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_items',
        },
        () => {
          fetchProductsCatalog()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [initSession, fetchProductsCatalog, supabase])

  // Cart Calculations
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, entry) => sum + Number(entry.item.selling_price) * entry.quantity, 0)
  }, [cart])

  const totalItemsCount = useMemo(() => {
    return cart.reduce((sum, entry) => sum + entry.quantity, 0)
  }, [cart])

  const tenderedNumeric = parseFloat(amountTendered) || 0
  const changeDue = Math.max(0, tenderedNumeric - cartTotal)
  const isCashSufficient = tenderedNumeric >= cartTotal

  // Filter categories
  const categories = useMemo(() => {
    const unique = Array.from(new Set(products.map((i) => i.category).filter(Boolean)))
    return ['All', ...unique]
  }, [products])

  // Filter products by category & search query
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory
      const matchesQuery = item.name.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCat && matchesQuery
    })
  }, [products, selectedCategory, searchQuery])

  // Cart Operations with Stock Capacity Protection
  const addToCart = (item: Product) => {
    if (item.max_servings <= 0) return

    setCart((prev) => {
      const existing = prev.find((i) => i.item.id === item.id)
      if (existing) {
        if (existing.quantity >= item.max_servings) {
          alert(`Cannot add more. Only ${item.max_servings} serving(s) available.`)
          return prev
        }
        return prev.map((i) =>
          i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { item, quantity: 1 }]
    })
  }

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((entry) => {
          if (entry.item.id === itemId) {
            const newQty = entry.quantity + delta
            if (delta > 0 && newQty > entry.item.max_servings) {
              alert(`Maximum stock reached for ${entry.item.name} (${entry.item.max_servings} max).`)
              return entry
            }
            return newQty > 0 ? { ...entry, quantity: newQty } : null
          }
          return entry
        })
        .filter(Boolean) as CartItem[]
    )
  }

  const openCheckout = () => {
    if (cart.length === 0) return

    // Double check inventory bounds before opening modal
    const overstockedItem = cart.find((entry) => entry.quantity > entry.item.max_servings)
    if (overstockedItem) {
      alert(`Cannot checkout. "${overstockedItem.item.name}" only has ${overstockedItem.item.max_servings} portions left.`)
      return
    }

    setPaymentMethod('cash')
    setAmountTendered(cartTotal.toFixed(2))
    setCheckoutError('')
    setIsVerifyingWebhook(false)
    setIsCheckoutOpen(true)
  }

  // Sale Finalization
  const finalizeSale = async (
    method: 'cash' | 'card' | 'qr',
    paidAmount: number,
    changeAmount: number
  ) => {
    if (!userProfile) return

    setIsProcessing(true)
    setCheckoutError('')

    try {
      // 1. Record in sales
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          tenant_id: userProfile.tenant_id,
          branch_id: userProfile.branch_id,
          cashier_id: userProfile.id,
          total_amount: cartTotal,
          payment_method: method,
          amount_tendered: paidAmount,
          change_due: changeAmount,
          status: 'completed',
        })
        .select('id, created_at')
        .single()

      if (saleError) throw saleError

      const saleId = saleData.id
      const saleCreatedAt = saleData.created_at

      // 2. Insert line items
      const lineItems = cart.map((entry) => ({
        sale_id: saleId,
        tenant_id: userProfile.tenant_id,
        product_id: entry.item.id,
        item_name: entry.item.name,
        quantity: entry.quantity,
        unit_price: Number(entry.item.selling_price),
        subtotal: Number(entry.item.selling_price) * entry.quantity,
      }))

      const { error: itemsError } = await supabase.from('sale_items').insert(lineItems)
      if (itemsError) {
        console.warn('Line items recording failed:', itemsError.message)
      }

      // 3. Record Audit Log
      await supabase.from('audit_logs').insert({
        tenant_id: userProfile.tenant_id,
        user_id: userProfile.id,
        user_email: userProfile.email,
        action: `SALE_COMPLETED_${method.toUpperCase()}`,
        entity_type: 'sales',
        entity_id: saleId,
        details: {
          total: cartTotal,
          amount_tendered: paidAmount,
          change_due: changeAmount,
          items_count: totalItemsCount,
          payment_method: method,
        },
      })

      // 4. Trigger receipt state
      setLastCompletedSale({
        id: saleId,
        total_amount: cartTotal,
        payment_method: method,
        amount_tendered: paidAmount,
        change_due: changeAmount,
        created_at: saleCreatedAt,
        items: [...cart],
      })

      setCart([])
      setIsCheckoutOpen(false)
      setIsVerifyingWebhook(false)
      setShowReceiptModal(true)
    } catch (err: any) {
      console.error('Detailed transaction error:', err)
      const msg =
        err?.message ||
        err?.details ||
        err?.hint ||
        (typeof err === 'string' ? err : 'Failed to finalize transaction')
      setCheckoutError(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleProcessPayment = async () => {
    if (paymentMethod === 'cash') {
      if (!isCashSufficient) {
        setCheckoutError(`Insufficient tender. Entered $${tenderedNumeric.toFixed(2)}, total is $${cartTotal.toFixed(2)}`)
        return
      }
      await finalizeSale('cash', tenderedNumeric, changeDue)
    } else if (paymentMethod === 'card') {
      await finalizeSale('card', cartTotal, 0)
    } else if (paymentMethod === 'qr') {
      setIsVerifyingWebhook(true)
      setTimeout(async () => {
        await finalizeSale('qr', cartTotal, 0)
      }, 1500)
    }
  }

  const triggerThermalPrint = () => {
    window.print()
  }

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 font-sans text-emerald-400">
        Loading Terminal...
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-zinc-950 font-sans text-white overflow-hidden">
      <div className="print:hidden h-full flex-shrink-0">
        <Sidebar />
      </div>

      <div className="flex flex-1 overflow-hidden print:hidden">
        {/* Products Grid Column */}
        <section className="flex flex-1 flex-col border-r border-zinc-800 bg-zinc-950 p-6 overflow-hidden">
          <div className="mb-6 space-y-4 flex-shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black tracking-tight">Terminal</h1>
                <p className="text-xs text-zinc-400">Cashier: {userProfile?.email || 'Active'}</p>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-72 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-bold transition whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-emerald-500 text-zinc-950 shadow-md'
                      : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-800/80'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {fetchError && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
                Database error: {fetchError}
              </div>
            )}
          </div>

          {/* Catalog Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {loadingItems ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl bg-zinc-900/40 animate-pulse border border-zinc-800" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-zinc-500 text-sm">
                <p>No products found in this category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProducts.map((product) => {
                  const isSoldOut = product.max_servings <= 0
                  const isLowStock = product.max_servings > 0 && product.max_servings <= 10

                  return (
                    <button
                      key={product.id}
                      disabled={isSoldOut}
                      onClick={() => addToCart(product)}
                      className={`group flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                        isSoldOut
                          ? 'border-zinc-800/50 bg-zinc-900/20 opacity-50 cursor-not-allowed'
                          : 'cursor-pointer border-zinc-800 bg-zinc-900/50 hover:border-emerald-500/50 hover:bg-zinc-900 active:scale-[0.98]'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            {product.category}
                          </span>
                          {isSoldOut ? (
                            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800/60">
                              Sold Out
                            </span>
                          ) : isLowStock ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/50">
                              {product.max_servings} left
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {product.max_servings < 999 ? `${product.max_servings} left` : 'In Stock'}
                            </span>
                          )}
                        </div>
                        <h3 className={`font-bold text-sm line-clamp-2 ${isSoldOut ? 'text-zinc-500 line-through' : 'text-zinc-200 group-hover:text-emerald-400'}`}>
                          {product.name}
                        </h3>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="font-mono text-base font-extrabold text-white">
                          ${Number(product.selling_price).toFixed(2)}
                        </span>
                        <span
                          className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                            isSoldOut
                              ? 'bg-zinc-800 text-zinc-600'
                              : 'bg-zinc-800 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-zinc-950'
                          }`}
                        >
                          {isSoldOut ? 'Out' : '+ Add'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* Ticket Sidebar */}
        <aside className="w-96 flex flex-col bg-zinc-900/70 border-l border-zinc-800 flex-shrink-0">
          <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Current Ticket</h2>
              <span className="text-xs text-zinc-400">{totalItemsCount} items selected</span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Cart List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-zinc-600">
                <p className="text-sm font-medium">Cart is empty</p>
                <p className="text-xs text-zinc-500 mt-1">Select products to begin an order</p>
              </div>
            ) : (
              cart.map(({ item, quantity }) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                >
                  <div className="flex-1 pr-2">
                    <p className="text-xs font-bold text-zinc-200 truncate">{item.name}</p>
                    <p className="text-xs font-mono text-zinc-500">${Number(item.selling_price).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 font-mono text-xs font-bold text-zinc-300 hover:bg-zinc-700"
                    >
                      -
                    </button>
                    <span className="w-5 text-center font-mono text-xs font-bold">{quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 font-mono text-xs font-bold text-zinc-300 hover:bg-zinc-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary */}
          <div className="border-t border-zinc-800 bg-zinc-950/80 p-6 space-y-4">
            <div className="space-y-1.5 text-xs text-zinc-400 font-medium">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono text-zinc-200">${cartTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (0%)</span>
                <span className="font-mono text-zinc-200">$0.00</span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-zinc-800">
                <span>Total Due</span>
                <span className="font-mono text-emerald-400 text-lg">${cartTotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={openCheckout}
              disabled={cart.length === 0}
              className="w-full cursor-pointer rounded-xl bg-emerald-500 py-4 text-center font-extrabold text-zinc-950 shadow-lg transition hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed text-sm uppercase tracking-wider"
            >
              Proceed to Pay (${cartTotal.toFixed(2)})
            </button>
          </div>
        </aside>
      </div>

      {/* CHECKOUT MODAL */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 print:hidden">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-black">Checkout & Settle</h3>
                <p className="text-xs text-zinc-400">Select tender method</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase text-zinc-500 font-semibold block">Total Due</span>
                <span className="font-mono text-xl font-black text-emerald-400">${cartTotal.toFixed(2)}</span>
              </div>
            </div>

            {checkoutError && (
              <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
                {checkoutError}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mb-6">
              {(['cash', 'card', 'qr'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(m)
                    setCheckoutError('')
                  }}
                  className={`cursor-pointer rounded-xl py-3 text-xs font-extrabold uppercase tracking-wider transition ${
                    paymentMethod === m
                      ? 'bg-emerald-500 text-zinc-950 shadow-md'
                      : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800 border border-zinc-800'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {paymentMethod === 'cash' && (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Cash Tendered ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    autoFocus
                    placeholder="0.00"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-2xl font-mono font-black text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[cartTotal, 10, 20, 50].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAmountTendered(preset.toFixed(2))}
                      className="cursor-pointer rounded-lg bg-zinc-800 py-2 text-xs font-mono font-bold text-zinc-300 hover:bg-zinc-700"
                    >
                      {idx === 0 ? 'Exact' : `$${preset}`}
                    </button>
                  ))}
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 flex justify-between items-center">
                  <span className="text-xs font-semibold text-zinc-400 uppercase">Change Due</span>
                  <span
                    className={`font-mono text-xl font-extrabold ${
                      isCashSufficient ? 'text-emerald-400' : 'text-zinc-600'
                    }`}
                  >
                    ${changeDue.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {paymentMethod === 'card' && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center mb-6">
                <p className="text-sm font-semibold text-zinc-200">Terminal Ready</p>
                <p className="text-xs text-zinc-400 mt-1">Tap, insert, or swipe on card terminal</p>
              </div>
            )}

            {paymentMethod === 'qr' && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center mb-6">
                {isVerifyingWebhook ? (
                  <div className="space-y-3">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                    <p className="text-xs font-semibold text-emerald-400 animate-pulse">
                      Awaiting Webhook Confirmation...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="mx-auto h-28 w-28 rounded-lg bg-white p-2 flex items-center justify-center text-zinc-950 font-mono text-[10px] font-bold">
                      [QR CODE]
                    </div>
                    <p className="text-xs text-zinc-400">Scan via Mobile Wallet</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setIsCheckoutOpen(false)
                  setIsVerifyingWebhook(false)
                }}
                className="flex-1 cursor-pointer rounded-xl bg-zinc-800 py-3 text-xs font-bold text-zinc-300 hover:bg-zinc-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing || (paymentMethod === 'cash' && !isCashSufficient)}
                onClick={handleProcessPayment}
                className="flex-1 cursor-pointer rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950 hover:bg-emerald-400 transition disabled:opacity-40"
              >
                {isProcessing
                  ? 'Finalizing...'
                  : paymentMethod === 'cash'
                  ? `Complete Sale ($${changeDue.toFixed(2)} Change)`
                  : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THERMAL RECEIPT MODAL */}
      {showReceiptModal && lastCompletedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl print:bg-white print:text-black print:border-none print:shadow-none print:w-full print:p-0">
            <div className="font-mono text-xs text-zinc-200 print:text-black">
              <div className="text-center pb-4 border-b border-dashed border-zinc-700 print:border-black">
                <h2 className="text-base font-black uppercase tracking-widest text-white print:text-black">
                  KITCHOS RECEIPT
                </h2>
                <p className="text-[11px] text-zinc-400 print:text-zinc-600 mt-0.5">
                  Order #{lastCompletedSale.id.slice(0, 8)}
                </p>
                <p className="text-[10px] text-zinc-500 print:text-zinc-600">
                  {new Date(lastCompletedSale.created_at).toLocaleString()}
                </p>
              </div>

              <div className="py-4 space-y-2 border-b border-dashed border-zinc-700 print:border-black">
                {lastCompletedSale.items.map((entry, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>
                      {entry.quantity}x {entry.item.name}
                    </span>
                    <span>${(Number(entry.item.selling_price) * entry.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="py-4 space-y-1 border-b border-dashed border-zinc-700 print:border-black">
                <div className="flex justify-between font-bold text-sm text-white print:text-black">
                  <span>TOTAL</span>
                  <span>${lastCompletedSale.total_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400 print:text-zinc-600 capitalize">
                  <span>Method</span>
                  <span>{lastCompletedSale.payment_method}</span>
                </div>
                {lastCompletedSale.payment_method === 'cash' && (
                  <>
                    <div className="flex justify-between text-zinc-400 print:text-zinc-600">
                      <span>Tendered</span>
                      <span>${lastCompletedSale.amount_tendered.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400 print:text-black font-bold">
                      <span>Change</span>
                      <span>${lastCompletedSale.change_due.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="text-center pt-4 text-[10px] text-zinc-500 print:text-zinc-600">
                Thank you for your order!
              </div>
            </div>

            <div className="mt-6 flex gap-3 print:hidden">
              <button
                type="button"
                onClick={triggerThermalPrint}
                className="flex-1 cursor-pointer rounded-xl bg-zinc-800 py-3 text-xs font-bold text-zinc-200 hover:bg-zinc-700 transition"
              >
                🖨️ Print Slip
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReceiptModal(false)
                  setLastCompletedSale(null)
                }}
                className="flex-1 cursor-pointer rounded-xl bg-emerald-500 py-3 text-xs font-bold text-zinc-950 hover:bg-emerald-400 transition"
              >
                New Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}