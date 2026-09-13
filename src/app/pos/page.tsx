'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ShiftModal, { CashShift } from '@/components/ShiftModal';
import { useWakeLock } from '@/hooks/useWakeLock';
import NetworkStatus from '@/components/NetworkStatus';

interface ProductItem {
  id: string;
  name: string;
  category: string;
  selling_price: number;
  available_portions: number;
  is_active?: boolean;
}

interface CartItem {
  product: ProductItem;
  quantity: number;
}

interface CompletedSale {
  id: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  amount_tendered: number;
  change_due: number;
  items: CartItem[];
  staff_name?: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

export default function PosPage() {
  const supabase = createClient();

  useWakeLock(true);

  // Active Staff & Lock Screen State
  const [activeStaff, setActiveStaff] = useState<StaffMember>({
    id: '',
    name: 'Alex (Cashier)',
    role: 'CASHIER',
  });
  const [isTerminalLocked, setIsTerminalLocked] = useState(false);
  const [isSwitchStaffOpen, setIsSwitchStaffOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Products & Catalog State
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);

  // Active Shift State
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);

  // Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'qr' | 'transfer'>('cash');
  const [amountTendered, setAmountTendered] = useState<string>('');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Receipt Modal State
  const [lastSale, setLastSale] = useState<CompletedSale | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // 1. Initial Staff Load from storage or default
  useEffect(() => {
    const saved = localStorage.getItem('kitchos_active_staff');
    if (saved) {
      try {
        setActiveStaff(JSON.parse(saved));
      } catch (e) {
        // fallback to default
      }
    } else {
      // Fetch Alex as default starter
      supabase
        .from('staff_members')
        .select('id, name, role')
        .eq('role', 'CASHIER')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setActiveStaff(data);
            localStorage.setItem('kitchos_active_staff', JSON.stringify(data));
          }
        });
    }
  }, [supabase]);

  // 2. Fetch Products
  const fetchProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const { data, error } = await supabase
        .from('product_availability')
        .select('id, name, category, selling_price, available_portions')
        .order('name');

      if (error) {
        const { data: prodData, error: prodErr } = await supabase
          .from('products')
          .select('id, name, category, selling_price')
          .eq('is_active', true)
          .order('name');

        if (prodErr) throw prodErr;

        setProducts(
          (prodData || []).map((p: any) => ({
            ...p,
            available_portions: 999,
          }))
        );
      } else {
        setProducts(
          (data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            category: p.category || 'General',
            selling_price: Number(p.selling_price || 0),
            available_portions: Number(p.available_portions ?? 0),
          }))
        );
      }
    } catch (err: any) {
      console.error('Error loading products:', err.message);
    } finally {
      setLoadingProducts(false);
    }
  }, [supabase]);

  // 3. Fetch Active Register Shift
  const fetchActiveShift = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setActiveShift(data);
    } catch (err: any) {
      console.error('Error fetching cash shift:', err.message);
    }
  }, [supabase]);

  useEffect(() => {
    fetchProducts();
    fetchActiveShift();

    const inventorySub = supabase
      .channel(`realtime:pos-inventory-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
        fetchProducts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_bom' }, () => {
        fetchProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(inventorySub);
    };
  }, [fetchProducts, fetchActiveShift, supabase]);

  // Staff Authentication / Unlock with PIN
  const handleAuthenticatePin = async (pinToTest: string, unlockOnly = false) => {
    setIsVerifyingPin(true);
    setPinError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('authenticate_staff_pin', {
        p_pin: pinToTest,
      });

      if (rpcErr) throw rpcErr;

      const staff = data && data[0];
      if (staff) {
        if (!unlockOnly) {
          setActiveStaff(staff);
          localStorage.setItem('kitchos_active_staff', JSON.stringify(staff));
        }
        setIsTerminalLocked(false);
        setIsSwitchStaffOpen(false);
        setPinInput('');
      } else {
        setPinError('Invalid PIN. Please try again.');
        setPinInput('');
      }
    } catch (err: any) {
      setPinError(err.message || 'Authentication error.');
      setPinInput('');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleKeypadPress = (digit: string, isUnlockScreen: boolean) => {
    if (isVerifyingPin || pinInput.length >= 4) return;
    const nextPin = pinInput + digit;
    setPinInput(nextPin);
    if (nextPin.length === 4) {
      handleAuthenticatePin(nextPin, isUnlockScreen);
    }
  };

  // Categories list
  const categories = useMemo(() => {
    const list = Array.from(new Set(products.map((p) => p.category.toUpperCase())));
    return ['ALL', ...list];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'ALL' || p.category.toUpperCase() === selectedCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.selling_price * item.quantity, 0);
  }, [cart]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Cart actions
  const handleAddToCart = (product: ProductItem) => {
    if (product.available_portions <= 0) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.available_portions) return prev;
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty > item.product.available_portions) return item;
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Quick cash tender presets
  const quickCashPresets = useMemo(() => {
    const total = cartSubtotal;
    const presets = new Set<number>();
    presets.add(parseFloat(total.toFixed(2)));

    const next5 = Math.ceil(total / 5) * 5;
    const next10 = Math.ceil(total / 10) * 10;
    const next20 = Math.ceil(total / 20) * 20;
    const next50 = Math.ceil(total / 50) * 50;

    if (next5 >= total) presets.add(next5);
    if (next10 >= total) presets.add(next10);
    if (next20 >= total) presets.add(next20);
    if (next50 >= total) presets.add(next50);

    return Array.from(presets).sort((a, b) => a - b).slice(0, 4);
  }, [cartSubtotal]);

  const tenderFloat = parseFloat(amountTendered) || 0;
  const changeDue = paymentMethod === 'cash' ? Math.max(0, tenderFloat - cartSubtotal) : 0;
  const isTenderSufficient = paymentMethod !== 'cash' || tenderFloat >= cartSubtotal;

  // Process checkout with staff_id tagging
  const handleProcessCheckout = async () => {
    if (cart.length === 0) return;
    if (!isTenderSufficient) {
      setCheckoutError('Amount tendered is less than the total bill.');
      return;
    }

    setIsProcessingCheckout(true);
    setCheckoutError(null);

    try {
      const finalTendered = paymentMethod === 'cash' ? tenderFloat : cartSubtotal;
      const finalChange = paymentMethod === 'cash' ? changeDue : 0;

      // 1. Insert header sale tagged with active cashier ID
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .insert({
          total_amount: cartSubtotal,
          payment_method: paymentMethod,
          amount_tendered: finalTendered,
          change_due: finalChange,
          status: 'COMPLETED',
          staff_id: activeStaff.id || null,
        })
        .select('id, created_at')
        .single();

      if (saleErr) throw saleErr;

      // 2. Insert line items
      const lineItems = cart.map((item) => ({
        sale_id: saleData.id,
        product_id: item.product.id,
        item_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.selling_price,
        subtotal: item.product.selling_price * item.quantity,
      }));

      const { error: itemsErr } = await supabase.from('sale_items').insert(lineItems);
      if (itemsErr) throw itemsErr;

      // 3. Receipt slip preparation
      setLastSale({
        id: saleData.id,
        created_at: saleData.created_at,
        total_amount: cartSubtotal,
        payment_method: paymentMethod.toUpperCase(),
        amount_tendered: finalTendered,
        change_due: finalChange,
        items: [...cart],
        staff_name: activeStaff.name,
      });

      // 4. Reset checkout & cart states
      setCart([]);
      setIsCheckoutOpen(false);
      setIsReceiptOpen(true);
      fetchProducts();
    } catch (err: any) {
      console.error('Checkout error:', err);
      setCheckoutError(err.message || 'Transaction failed to process.');
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
      <div className="h-full flex-shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 flex overflow-hidden">
        {/* Catalog Section */}
        <section className="flex-1 flex flex-col min-w-0 border-r border-neutral-800">
          <header className="h-16 px-6 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">POS Terminal</h1>
              <p className="text-[11px] text-neutral-400">Direct order entry & live portion guards</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Cashier Badge & Switcher */}
              <NetworkStatus />
              <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => {
                    setPinInput('');
                    setPinError(null);
                    setIsSwitchStaffOpen(true);
                  }}
                  className="flex items-center gap-2 hover:bg-neutral-800 px-2.5 py-1 rounded-lg text-xs transition cursor-pointer"
                  title="Switch cashier"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="font-semibold text-white">{activeStaff.name}</span>
                  <span className="text-[10px] text-neutral-400 bg-neutral-950 px-1.5 py-0.5 rounded uppercase">
                    {activeStaff.role}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPinInput('');
                    setPinError(null);
                    setIsTerminalLocked(true);
                  }}
                  className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition cursor-pointer"
                  title="Lock terminal"
                >
                  🔒
                </button>
              </div>

              {/* Till Status */}
              {activeShift ? (
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(true)}
                  className="flex items-center gap-2 bg-neutral-950 hover:bg-neutral-800/80 border border-emerald-800/50 px-3.5 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-sm"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-emerald-400 font-bold">
                    ${Number(activeShift.opening_float).toFixed(2)} Float
                  </span>
                  <span className="text-neutral-500 text-[10px] pl-1 border-l border-neutral-800">
                    Z-Report →
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(true)}
                  className="flex items-center gap-2 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60 px-3.5 py-1.5 rounded-xl text-xs text-amber-300 font-semibold transition cursor-pointer shadow-sm"
                >
                  <span>⚠️ Till Closed</span>
                  <span>• Open Shift</span>
                </button>
              )}
            </div>
          </header>

          {/* Search & Category Filter Bar */}
          <div className="p-4 border-b border-neutral-800 bg-neutral-900/20 space-y-3 flex-shrink-0">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search dish or beverage..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => fetchProducts()}
                className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs text-neutral-400 transition-colors cursor-pointer"
                title="Refresh stock"
              >
                ↻
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-emerald-500 text-neutral-950 shadow-md shadow-emerald-950/40'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loadingProducts ? (
              <div className="flex items-center justify-center h-48 text-neutral-500 text-xs">
                Loading live menu and portions...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-neutral-500 text-xs">
                No matching menu items found.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {filteredProducts.map((product) => {
                  const isSoldOut = product.available_portions <= 0;
                  const cartItem = cart.find((i) => i.product.id === product.id);
                  const inCartQty = cartItem?.quantity || 0;
                  const remainingAvailable = Math.max(0, product.available_portions - inCartQty);

                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={isSoldOut || remainingAvailable <= 0}
                      onClick={() => handleAddToCart(product)}
                      className={`relative flex flex-col justify-between p-4 rounded-2xl text-left border transition-all cursor-pointer ${
                        isSoldOut
                          ? 'bg-neutral-900/30 border-neutral-800/40 opacity-50 cursor-not-allowed'
                          : remainingAvailable <= 0
                          ? 'bg-neutral-900/40 border-neutral-800 opacity-60'
                          : 'bg-neutral-900/80 hover:bg-neutral-800/90 border-neutral-800 hover:border-neutral-700 active:scale-[0.98]'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">
                            {product.category}
                          </span>
                          {inCartQty > 0 && (
                            <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                              {inCartQty} in cart
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-sm text-white leading-tight line-clamp-2">
                          {product.name}
                        </h3>
                      </div>

                      <div className="flex justify-between items-end mt-4 pt-3 border-t border-neutral-800/60">
                        <span className="font-mono text-sm font-extrabold text-emerald-400">
                          ${product.selling_price.toFixed(2)}
                        </span>

                        <span
                          className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border ${
                            isSoldOut
                              ? 'bg-rose-950/60 text-rose-400 border-rose-800/50'
                              : product.available_portions <= 5
                              ? 'bg-amber-950/60 text-amber-400 border-amber-800/50'
                              : 'bg-neutral-800/80 text-neutral-400 border-neutral-700/60'
                          }`}
                        >
                          {isSoldOut ? 'Sold Out' : `${remainingAvailable} left`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Current Order Ticket / Cart */}
        <section className="w-96 bg-neutral-900/30 flex flex-col flex-shrink-0">
          <div className="h-16 px-6 border-b border-neutral-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white text-sm">Active Order</h2>
              <span className="bg-neutral-800 text-neutral-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full">
                {totalCartCount} items
              </span>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={handleClearCart}
                className="text-[11px] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-neutral-500">
                <span className="text-3xl mb-2">🛒</span>
                <p className="text-xs">No items in the order ticket yet.</p>
                <p className="text-[10px] text-neutral-600 mt-1">
                  Select items from the catalog on the left.
                </p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="p-3 bg-neutral-900/80 border border-neutral-800 rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-semibold text-white truncate">{item.product.name}</h4>
                    <p className="font-mono text-[11px] text-neutral-400">
                      ${item.product.selling_price.toFixed(2)} each
                    </p>
                  </div>

                  <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => handleUpdateQuantity(item.product.id, -1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-bold transition-colors cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-mono text-xs font-bold text-white w-4 text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      disabled={item.quantity >= item.product.available_portions}
                      onClick={() => handleUpdateQuantity(item.product.id, 1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 text-neutral-300 text-xs font-bold transition-colors cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right">
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      ${(item.product.selling_price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-5 border-t border-neutral-800 bg-neutral-950/70 space-y-4 flex-shrink-0">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Subtotal</span>
                <span className="font-mono">${cartSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Server / Cashier</span>
                <span className="font-semibold text-white">{activeStaff.name}</span>
              </div>
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-neutral-800">
                <span>Total Due</span>
                <span className="font-mono text-emerald-400">${cartSubtotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => {
                setAmountTendered(cartSubtotal.toFixed(2));
                setCheckoutError(null);
                setIsCheckoutOpen(true);
              }}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed font-extrabold text-xs text-neutral-950 tracking-wider uppercase transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              Proceed to Pay (${cartSubtotal.toFixed(2)})
            </button>
          </div>
        </section>
      </main>

      {/* CHECKOUT MODAL */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white">Select Tender & Pay</h2>
                <p className="text-xs text-neutral-400">
                  Total: ${cartSubtotal.toFixed(2)} • Cashier: {activeStaff.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="text-neutral-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {(['cash', 'card', 'qr', 'transfer'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                    paymentMethod === method
                      ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:bg-neutral-800 hover:text-white'
                  }`}
                >
                  {method === 'cash'
                    ? '💵 Cash'
                    : method === 'card'
                    ? '💳 Card'
                    : method === 'qr'
                    ? '📱 QR'
                    : '🏦 Transfer'}
                </button>
              ))}
            </div>

            {paymentMethod === 'cash' ? (
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Amount Tendered ($)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    autoFocus
                    required
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 font-mono text-xl font-bold text-white focus:outline-none"
                  />
                </div>

                <div className="flex gap-2">
                  {quickCashPresets.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmountTendered(amt.toFixed(2))}
                      className="flex-1 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-mono font-semibold text-neutral-300 cursor-pointer"
                    >
                      ${amt.toFixed(2)}
                    </button>
                  ))}
                </div>

                <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 flex justify-between items-center text-xs">
                  <span className="text-neutral-400">Change Due:</span>
                  <span
                    className={`font-mono font-bold text-base ${
                      tenderFloat < cartSubtotal ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    ${changeDue.toFixed(2)}
                  </span>
                </div>
              </div>
            ) : paymentMethod === 'card' ? (
              <div className="p-6 bg-neutral-950 border border-neutral-800 rounded-xl text-center space-y-2">
                <span className="text-3xl">💳</span>
                <p className="text-xs text-neutral-300 font-medium">Terminal Reader Ready</p>
                <p className="text-[10px] text-neutral-500">
                  Swipe, insert chip, or tap customer card on EDC terminal.
                </p>
              </div>
            ) : paymentMethod === 'transfer' ? (
              <div className="p-6 bg-neutral-950 border border-neutral-800 rounded-xl text-center space-y-2">
                <span className="text-3xl">🏦</span>
                <p className="text-xs text-neutral-300 font-medium">Bank / Wire Transfer</p>
                <p className="text-[10px] text-neutral-500">
                  Verify instant transfer confirmation receipt from customer before completing.
                </p>
              </div>
            ) : (
              <div className="p-6 bg-neutral-950 border border-neutral-800 rounded-xl text-center space-y-2">
                <div className="w-24 h-24 mx-auto bg-white rounded-lg flex items-center justify-center text-black font-mono text-xs font-bold">
                  [ QR CODE ]
                </div>
                <p className="text-xs text-neutral-300 font-medium">Scan to Pay via E-Wallet</p>
                <p className="text-[10px] text-neutral-500">Waiting for webhook transfer confirmation...</p>
              </div>
            )}

            {checkoutError && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-900 text-rose-300 text-xs rounded-lg">
                {checkoutError}
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                disabled={isProcessingCheckout}
                onClick={() => setIsCheckoutOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingCheckout || !isTenderSufficient}
                onClick={handleProcessCheckout}
                className="flex-2 py-2.5 rounded-xl text-xs font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 transition-colors cursor-pointer"
              >
                {isProcessingCheckout ? 'Finalizing...' : 'Confirm & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THERMAL RECEIPT SLIP MODAL */}
      {isReceiptOpen && lastSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-5 print:shadow-none print:border-none print:m-0 print:p-0">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-3 print:hidden">
              <div>
                <h3 className="text-base font-bold text-white">Payment Successful</h3>
                <p className="text-[11px] text-neutral-400">Transaction recorded to ledger.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsReceiptOpen(false)}
                className="text-neutral-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-neutral-300 space-y-2.5 print:border-none print:p-0 print:text-black">
              <div className="text-center pb-2 border-b border-dashed border-neutral-700">
                <h4 className="font-extrabold text-sm text-white tracking-widest uppercase print:text-black">
                  KITCHOS RESTAURANT
                </h4>
                <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                  Order #{lastSale.id.slice(0, 8)}
                </p>
                <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                  Cashier: {lastSale.staff_name || activeStaff.name}
                </p>
                <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                  {new Date(lastSale.created_at).toLocaleString([], {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </p>
              </div>

              <div className="space-y-1.5 py-1 border-b border-dashed border-neutral-800">
                {lastSale.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-[11px]">
                    <span className="truncate pr-2">
                      {item.quantity}x {item.product.name}
                    </span>
                    <span className="font-bold">
                      ${(item.product.selling_price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between font-bold text-white print:text-black">
                  <span>TOTAL:</span>
                  <span>${lastSale.total_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-neutral-400 print:text-neutral-600">
                  <span>Tender ({lastSale.payment_method}):</span>
                  <span>${lastSale.amount_tendered.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-neutral-400 print:text-neutral-600">
                  <span>Change Due:</span>
                  <span>${lastSale.change_due.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-center pt-2 border-t border-dashed border-neutral-700 text-[10px] text-neutral-500">
                Thank you for dining with us!
              </div>
            </div>

            <div className="flex gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>🖨️</span>
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setIsReceiptOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-neutral-950 transition-colors cursor-pointer"
              >
                New Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SWITCH CASHIER */}
      {isSwitchStaffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-xs w-full p-6 text-center space-y-4 shadow-2xl">
            <div>
              <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg mb-2">
                👤
              </div>
              <h3 className="text-base font-bold text-white">Switch Cashier Station</h3>
              <p className="text-xs text-neutral-400">Enter your 4-digit Staff PIN</p>
            </div>

            <div className="flex justify-center items-center gap-3 py-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-3 w-3 rounded-full transition-all duration-150 ${
                    pinInput.length > i
                      ? 'bg-emerald-400 scale-110 shadow-sm shadow-emerald-500/50'
                      : 'bg-neutral-800 border border-neutral-700'
                  }`}
                />
              ))}
            </div>

            {pinError && (
              <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 py-1.5 px-2 rounded-xl">
                {pinError}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={isVerifyingPin}
                  onClick={() => handleKeypadPress(digit, false)}
                  className="h-12 rounded-2xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 active:scale-95 font-mono text-lg font-bold text-white transition cursor-pointer"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setIsSwitchStaffOpen(false)}
                className="h-12 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 text-xs font-semibold"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isVerifyingPin}
                onClick={() => handleKeypadPress('0', false)}
                className="h-12 rounded-2xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 active:scale-95 font-mono text-lg font-bold text-white transition cursor-pointer"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                className="h-12 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 text-base font-bold"
              >
                ⌫
              </button>
            </div>

            <p className="text-[10px] text-neutral-500 font-mono">
              Alex: 1234 • Sam: 5678 • Manager: 9999
            </p>
          </div>
        </div>
      )}

      {/* FULL SCREEN BLACKOUT LOCK SCREEN */}
      {isTerminalLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl max-w-xs w-full p-6 text-center space-y-5 shadow-2xl">
            <div>
              <div className="w-12 h-12 mx-auto rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xl mb-2">
                🔒
              </div>
              <h3 className="text-lg font-black text-white">Station Locked</h3>
              <p className="text-xs text-neutral-400">
                Enter PIN to unlock terminal ({activeStaff.name})
              </p>
            </div>

            <div className="flex justify-center items-center gap-3.5 py-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-3.5 w-3.5 rounded-full transition-all duration-150 ${
                    pinInput.length > i
                      ? 'bg-emerald-400 scale-110 shadow-sm shadow-emerald-500/50'
                      : 'bg-neutral-800 border border-neutral-700'
                  }`}
                />
              ))}
            </div>

            {pinError && (
              <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 py-1.5 px-2 rounded-xl">
                {pinError}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={isVerifyingPin}
                  onClick={() => handleKeypadPress(digit, true)}
                  className="h-13 rounded-2xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 active:scale-95 font-mono text-xl font-bold text-white transition cursor-pointer"
                >
                  {digit}
                </button>
              ))}

              <div />

              <button
                type="button"
                disabled={isVerifyingPin}
                onClick={() => handleKeypadPress('0', true)}
                className="h-13 rounded-2xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 active:scale-95 font-mono text-xl font-bold text-white transition cursor-pointer"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                className="h-13 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 text-base font-bold flex items-center justify-center"
              >
                ⌫
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT RECONCILIATION MODAL */}
      <ShiftModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        activeShift={activeShift}
        onShiftUpdated={(shift) => setActiveShift(shift)}
      />
    </div>
  );
}