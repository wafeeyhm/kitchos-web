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
}

interface ModifierOption {
  name: string;
  price: number;
}

interface CartItem {
  id: string;
  product: ProductItem;
  quantity: number;
  modifiers: ModifierOption[];
  notes?: string;
  unit_total: number;
}

interface BankAccount {
  name: string;
  account_name: string;
  account_number: string;
}

interface QrProvider {
  name: string;
  qr_image_url: string;
  instructions?: string;
  merchant_id?: string;
}

interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  is_enabled: boolean;
  config: {
    networks?: string[];
    providers?: QrProvider[];
    banks?: BankAccount[];
  };
}

interface CompletedSale {
  id: string;
  created_at: string;
  order_type: 'DINE_IN' | 'TAKEAWAY';
  total_amount: number;
  payment_method: string;
  amount_tendered: number;
  change_due: number;
  items: CartItem[];
  staff_name?: string;
  reference_number?: string;
  payment_details?: any;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

const PRESET_MODIFIERS: ModifierOption[] = [
  { name: 'Oat Milk Sub', price: 0.8 },
  { name: 'Extra Espresso Shot', price: 1.0 },
  { name: 'Vanilla Syrup', price: 0.5 },
  { name: 'Caramel Drizzle', price: 0.5 },
  { name: 'Less Sweet (50%)', price: 0.0 },
  { name: 'No Sugar (0%)', price: 0.0 },
  { name: 'Less Ice', price: 0.0 },
  { name: 'No Ice', price: 0.0 },
];

function broadcastToCfd(supabase: any, type: string, payload: any) {
  try {
    const local = new BroadcastChannel('kitchos_cfd_channel');
    local.postMessage({ type, ...payload });
    local.close();

    supabase.channel('kitchos_cfd_realtime').send({
      type: 'broadcast',
      event: 'cfd_event',
      payload: { type, ...payload },
    });
  } catch (err) {
    console.warn('CFD broadcast error:', err);
  }
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

  // Cart & Order State
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY'>('DINE_IN');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);

  // Modifier Customizer Modal State
  const [customizingProduct, setCustomizingProduct] = useState<ProductItem | null>(null);
  const [activeModifiers, setActiveModifiers] = useState<ModifierOption[]>([]);
  const [itemNoteInput, setItemNoteInput] = useState('');

  // Shift Float State
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);

  // Dynamic Payment Channels State
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethodCode, setSelectedMethodCode] = useState<string>('CASH');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [amountTendered, setAmountTendered] = useState<string>('');
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [selectedCardNetwork, setSelectedCardNetwork] = useState<string>('VISA');
  const [selectedQrProvider, setSelectedQrProvider] = useState<QrProvider | null>(null);
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Receipt Modal State
  const [lastSale, setLastSale] = useState<CompletedSale | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Cart Subtotals
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unit_total * item.quantity, 0);
  }, [cart]);

  const totalItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // CFD Live Sync: Push order changes to secondary customer display
  useEffect(() => {
    broadcastToCfd(supabase, 'CART_UPDATE', {
      items: cart,
      subtotal: cartSubtotal,
      orderType,
      cashierName: activeStaff.name,
    });
  }, [cart, cartSubtotal, orderType, activeStaff.name, supabase]);

  // 1. Initialize Active Staff
  useEffect(() => {
    const saved = localStorage.getItem('kitchos_active_staff');
    if (saved) {
      try {
        setActiveStaff(JSON.parse(saved));
      } catch (e) {}
    } else {
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

  // 2. Load Products & Portions
  const fetchProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const { data, error } = await supabase
        .from('product_availability')
        .select('id, name, category, selling_price, available_portions')
        .order('name');

      if (error) {
        const { data: prodData } = await supabase
          .from('products')
          .select('id, name, category, selling_price')
          .eq('is_active', true)
          .order('name');

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
      console.error('Error loading menu products:', err.message);
    } finally {
      setLoadingProducts(false);
    }
  }, [supabase]);

  // 3. Load Active Register Shift
  const fetchActiveShift = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveShift(data);
    } catch (err: any) {
      console.error('Error loading cash shift:', err.message);
    }
  }, [supabase]);

  // 4. Load Active Payment Methods & Providers
  const fetchPaymentMethods = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('is_enabled', true)
        .order('display_order', { ascending: true });

      if (data && data.length > 0) {
        setPaymentMethods(data);
        setSelectedMethodCode(data[0].code);

        const transfer = data.find((d) => d.code === 'TRANSFER');
        if (transfer?.config?.banks && transfer.config.banks.length > 0) {
          setSelectedBank(transfer.config.banks[0].name);
        }

        const qr = data.find((d) => d.code === 'QR');
        if (qr?.config?.providers && qr.config.providers.length > 0) {
          setSelectedQrProvider(qr.config.providers[0]);
        }
      }
    } catch (err: any) {
      console.error('Error loading payment methods:', err.message);
    }
  }, [supabase]);

  useEffect(() => {
    fetchProducts();
    fetchActiveShift();
    fetchPaymentMethods();
  }, [fetchProducts, fetchActiveShift, fetchPaymentMethods]);

  // Keypad Authentication for Cashier Switching and Station Unlocking
  const handleAuthenticatePin = async (pinToTest: string, unlockOnly = false) => {
    setIsVerifyingPin(true);
    setPinError(null);
    try {
      const { data, error } = await supabase.rpc('authenticate_staff_pin', {
        p_pin: pinToTest,
      });

      if (error) throw error;
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
        setPinError('Invalid PIN.');
        setPinInput('');
      }
    } catch (err: any) {
      setPinError(err.message || 'Verification failed.');
      setPinInput('');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleKeypadPress = (digit: string, isUnlockScreen: boolean) => {
    if (isVerifyingPin || pinInput.length >= 4) return;
    const next = pinInput + digit;
    setPinInput(next);
    if (next.length === 4) {
      handleAuthenticatePin(next, isUnlockScreen);
    }
  };

  // Categories
  const categories = useMemo(() => {
    const list = Array.from(new Set(products.map((p) => p.category.toUpperCase())));
    return ['ALL', ...list];
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'ALL' || p.category.toUpperCase() === selectedCategory;
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Quick Direct Add
  const handleAddToCartDirect = (product: ProductItem) => {
    if (product.available_portions <= 0) return;

    setCart((prev) => {
      const existing = prev.find(
        (i) => i.product.id === product.id && i.modifiers.length === 0 && !i.notes
      );
      if (existing) {
        if (existing.quantity >= product.available_portions) return prev;
        return prev.map((i) => (i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i));
      }

      return [
        ...prev,
        {
          id: `${product.id}-${Date.now()}`,
          product,
          quantity: 1,
          modifiers: [],
          unit_total: product.selling_price,
        },
      ];
    });
  };

  // Open Custom Modifiers
  const handleOpenCustomize = (product: ProductItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomizingProduct(product);
    setActiveModifiers([]);
    setItemNoteInput('');
  };

  const handleToggleModifier = (mod: ModifierOption) => {
    setActiveModifiers((prev) =>
      prev.some((m) => m.name === mod.name)
        ? prev.filter((m) => m.name !== mod.name)
        : [...prev, mod]
    );
  };

  const handleAddCustomizedToCart = () => {
    if (!customizingProduct) return;

    const modifierCost = activeModifiers.reduce((sum, m) => sum + m.price, 0);
    const unitTotal = customizingProduct.selling_price + modifierCost;

    setCart((prev) => [
      ...prev,
      {
        id: `${customizingProduct.id}-${Date.now()}`,
        product: customizingProduct,
        quantity: 1,
        modifiers: [...activeModifiers],
        notes: itemNoteInput.trim() || undefined,
        unit_total: unitTotal,
      },
    ]);

    setCustomizingProduct(null);
  };

  const handleUpdateQuantity = (lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === lineId) {
            const nextQty = item.quantity + delta;
            if (nextQty > item.product.available_portions) return item;
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleClearCart = () => {
    setCart([]);
    broadcastToCfd(supabase, 'CLEAR_CART', {});
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
  const changeDue = selectedMethodCode === 'CASH' ? Math.max(0, tenderFloat - cartSubtotal) : 0;
  const isTenderSufficient = selectedMethodCode !== 'CASH' || tenderFloat >= cartSubtotal;

  const activeMethodObj = paymentMethods.find((m) => m.code === selectedMethodCode);

  // Open Checkout Modal & Broadcast to Customer Facing Display
  const handleOpenCheckout = () => {
    setAmountTendered(cartSubtotal.toFixed(2));
    setTransactionRef('');
    setCheckoutError(null);
    setIsCheckoutOpen(true);

    broadcastToCfd(supabase, 'CHECKOUT_START', {
      subtotal: cartSubtotal,
      orderType,
      paymentMethod: selectedMethodCode,
      paymentDetails: {
        channel: selectedMethodCode,
        qr_provider: selectedQrProvider?.name,
        qr_image_url: selectedQrProvider?.qr_image_url,
        instructions: selectedQrProvider?.instructions,
        merchant_id: selectedQrProvider?.merchant_id,
        bank: selectedBank,
        network: selectedCardNetwork,
      },
    });
  };

  // Select Payment Channel & Sync with Customer Screen
  const handleSelectPaymentMethod = (code: string) => {
    setSelectedMethodCode(code);
    setTransactionRef('');

    broadcastToCfd(supabase, 'PAYMENT_METHOD_CHANGE', {
      paymentMethod: code,
      paymentDetails: {
        channel: code,
        qr_provider: selectedQrProvider?.name,
        qr_image_url: selectedQrProvider?.qr_image_url,
        instructions: selectedQrProvider?.instructions,
        merchant_id: selectedQrProvider?.merchant_id,
        bank: selectedBank,
        network: selectedCardNetwork,
      },
    });
  };

  // Select QR Provider & Sync with Customer Screen
  const handleSelectQrProvider = (provider: QrProvider) => {
    setSelectedQrProvider(provider);

    broadcastToCfd(supabase, 'PAYMENT_METHOD_CHANGE', {
      paymentMethod: 'QR',
      paymentDetails: {
        channel: 'QR',
        qr_provider: provider.name,
        qr_image_url: provider.qr_image_url,
        instructions: provider.instructions,
        merchant_id: provider.merchant_id,
      },
    });
  };

  // Complete Order
  const handleProcessCheckout = async () => {
    if (cart.length === 0 || !isTenderSufficient) return;

    if (
      (selectedMethodCode === 'QR' ||
        selectedMethodCode === 'CARD' ||
        selectedMethodCode === 'TRANSFER') &&
      !transactionRef.trim()
    ) {
      if (
        !confirm(
          'No transaction ID / reference was entered. Proceed without reference identifier?'
        )
      ) {
        return;
      }
    }

    setIsProcessingCheckout(true);
    setCheckoutError(null);

    try {
      const finalTendered = selectedMethodCode === 'CASH' ? tenderFloat : cartSubtotal;
      const finalChange = selectedMethodCode === 'CASH' ? changeDue : 0;

      let paymentDetails: any = { channel: selectedMethodCode };
      if (selectedMethodCode === 'TRANSFER') {
        paymentDetails.bank = selectedBank;
      } else if (selectedMethodCode === 'CARD') {
        paymentDetails.network = selectedCardNetwork;
      } else if (selectedMethodCode === 'QR' && selectedQrProvider) {
        paymentDetails.qr_provider = selectedQrProvider.name;
        paymentDetails.merchant_id = selectedQrProvider.merchant_id;
      }

      const finalRef = transactionRef.trim() || null;
      if (finalRef) {
        paymentDetails.reference_id = finalRef;
      }

      // 1. Insert Sales Header
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .insert({
          total_amount: cartSubtotal,
          payment_method: selectedMethodCode.toLowerCase(),
          amount_tendered: finalTendered,
          change_due: finalChange,
          status: 'COMPLETED',
          staff_id: activeStaff.id || null,
          order_type: orderType,
          notes: orderNotes.trim() || null,
          reference_number: finalRef,
          payment_details: paymentDetails,
        })
        .select('id, created_at')
        .single();

      if (saleErr) throw saleErr;

      // 2. Insert Items with Modifiers
      const lineItemsToInsert = cart.map((item) => ({
        sale_id: saleData.id,
        product_id: item.product.id,
        item_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.unit_total,
        subtotal: item.unit_total * item.quantity,
        modifiers: item.modifiers,
        notes: item.notes || null,
      }));

      const { error: itemsErr } = await supabase.from('sale_items').insert(lineItemsToInsert);
      if (itemsErr) throw itemsErr;

      // 3. Broadcast Completion to Customer Facing Display
      broadcastToCfd(supabase, 'SALE_COMPLETED', {
        completedSale: {
          id: saleData.id,
          total: cartSubtotal,
          amountTendered: finalTendered,
          changeDue: finalChange,
          referenceNumber: finalRef,
        },
      });

      // 4. Prepare Receipt
      setLastSale({
        id: saleData.id,
        created_at: saleData.created_at,
        order_type: orderType,
        total_amount: cartSubtotal,
        payment_method: selectedMethodCode,
        amount_tendered: finalTendered,
        change_due: finalChange,
        items: [...cart],
        staff_name: activeStaff.name,
        reference_number: finalRef || undefined,
        payment_details: paymentDetails,
      });

      setCart([]);
      setOrderNotes('');
      setTransactionRef('');
      setIsCheckoutOpen(false);
      setIsReceiptOpen(true);
      fetchProducts();
    } catch (err: any) {
      console.error('Checkout error:', err);
      setCheckoutError(err.message || 'Transaction could not be completed.');
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
              <p className="text-[11px] text-neutral-400">Direct order entry & modifier controls</p>
            </div>

            <div className="flex items-center gap-3">
              <NetworkStatus />

              {/* Cashier Badge */}
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
                  <span className="text-[10px] text-neutral-400 bg-neutral-950 px-1.5 py-0.5 rounded uppercase font-mono">
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

              {/* Till Float Badge */}
              {activeShift ? (
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(true)}
                  className="flex items-center gap-2 bg-neutral-950 hover:bg-neutral-800/80 border border-emerald-800/50 px-3.5 py-1.5 rounded-xl text-xs transition cursor-pointer"
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
                  className="flex items-center gap-2 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60 px-3.5 py-1.5 rounded-xl text-xs text-amber-300 font-semibold transition cursor-pointer"
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
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => fetchProducts()}
                className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs text-neutral-400 transition cursor-pointer"
                title="Refresh menu"
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
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
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
                  const inCartCount = cart
                    .filter((c) => c.product.id === product.id)
                    .reduce((sum, c) => sum + c.quantity, 0);

                  return (
                    <div
                      key={product.id}
                      onClick={() => !isSoldOut && handleAddToCartDirect(product)}
                      className={`relative flex flex-col justify-between p-4 rounded-2xl border transition text-left cursor-pointer group ${
                        isSoldOut
                          ? 'bg-neutral-900/30 border-neutral-800/40 opacity-50 cursor-not-allowed'
                          : 'bg-neutral-900/80 hover:bg-neutral-800/90 border-neutral-800 hover:border-neutral-700 active:scale-[0.98]'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">
                            {product.category}
                          </span>
                          {inCartCount > 0 && (
                            <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                              {inCartCount} in order
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-sm text-white leading-tight line-clamp-2">
                          {product.name}
                        </h3>
                      </div>

                      <div className="flex justify-between items-end mt-4 pt-3 border-t border-neutral-800/60">
                        <div>
                          <span className="font-mono text-sm font-extrabold text-emerald-400">
                            ${product.selling_price.toFixed(2)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {!isSoldOut && (
                            <button
                              type="button"
                              onClick={(e) => handleOpenCustomize(product, e)}
                              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-[10px] font-bold text-neutral-300 transition cursor-pointer"
                              title="Add custom modifiers & notes"
                            >
                              ⚙️ Mod
                            </button>
                          )}
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                              isSoldOut
                                ? 'bg-rose-950/60 text-rose-400 border-rose-800/50'
                                : 'bg-neutral-800/80 text-neutral-400 border-neutral-700/60'
                            }`}
                          >
                            {isSoldOut ? 'Sold Out' : `${product.available_portions} left`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Order Ticket Section */}
        <section className="w-96 bg-neutral-900/30 flex flex-col flex-shrink-0">
          <div className="h-16 px-6 border-b border-neutral-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white text-sm">Active Order</h2>
              <span className="bg-neutral-800 text-neutral-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full">
                {totalItemCount} items
              </span>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={handleClearCart}
                className="text-[11px] text-rose-400 hover:text-rose-300 transition cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* DINE-IN / TAKEAWAY TOGGLE */}
          <div className="p-3 border-b border-neutral-800 bg-neutral-950/60 flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setOrderType('DINE_IN')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                orderType === 'DINE_IN'
                  ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-md shadow-emerald-950/40'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
            >
              <span>🍽️</span>
              <span>Dine-In</span>
            </button>
            <button
              type="button"
              onClick={() => setOrderType('TAKEAWAY')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                orderType === 'TAKEAWAY'
                  ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-md shadow-emerald-950/40'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
            >
              <span>🛍️</span>
              <span>Takeaway</span>
            </button>
          </div>

          {/* Cart Items with Modifiers */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-neutral-500">
                <span className="text-3xl mb-2">🛒</span>
                <p className="text-xs">No items on current order ticket.</p>
                <p className="text-[10px] text-neutral-600 mt-1">
                  Tap dishes on the catalog to ring up order.
                </p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-neutral-900/80 border border-neutral-800 rounded-xl space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-semibold text-white truncate">{item.product.name}</h4>
                      <p className="font-mono text-[11px] text-neutral-400">
                        ${item.unit_total.toFixed(2)} each
                      </p>
                    </div>

                    <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.id, -1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-bold transition cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-mono text-xs font-bold text-white w-4 text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={item.quantity >= item.product.available_portions}
                        onClick={() => handleUpdateQuantity(item.id, 1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 text-neutral-300 text-xs font-bold transition cursor-pointer"
                      >
                        +
                      </button>
                    </div>

                    <span className="font-mono text-xs font-bold text-emerald-400 w-16 text-right">
                      ${(item.unit_total * item.quantity).toFixed(2)}
                    </span>
                  </div>

                  {/* Modifiers List */}
                  {(item.modifiers.length > 0 || item.notes) && (
                    <div className="pt-1.5 border-t border-neutral-800/60 text-[10px] space-y-0.5 font-mono">
                      {item.modifiers.map((m, idx) => (
                        <div key={idx} className="flex justify-between text-amber-400/90">
                          <span>+ {m.name}</span>
                          {m.price > 0 && <span>+${m.price.toFixed(2)}</span>}
                        </div>
                      ))}
                      {item.notes && (
                        <p className="text-neutral-400 italic">Note: "{item.notes}"</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Ticket Notes & Checkout Button */}
          <div className="p-4 border-t border-neutral-800 bg-neutral-950/70 space-y-3 flex-shrink-0">
            <div>
              <input
                type="text"
                placeholder="Order memo / Table # (optional)..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Subtotal ({orderType === 'DINE_IN' ? 'Dine-In' : 'Takeaway'})</span>
                <span className="font-mono">${cartSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-black text-white pt-1 border-t border-neutral-800">
                <span>Total Due</span>
                <span className="font-mono text-emerald-400">${cartSubtotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleOpenCheckout}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed font-extrabold text-xs text-neutral-950 tracking-wider uppercase transition shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              Checkout (${cartSubtotal.toFixed(2)})
            </button>
          </div>
        </section>
      </main>

      {/* MODAL: ITEM MODIFIERS & KITCHEN NOTES */}
      {customizingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                Customize Order Item
              </span>
              <h3 className="text-lg font-bold text-white">{customizingProduct.name}</h3>
              <p className="text-xs text-neutral-400">
                Base price: ${customizingProduct.selling_price.toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase text-neutral-400">
                Add-ons & Recipe Modifiers
              </span>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_MODIFIERS.map((mod) => {
                  const isSelected = activeModifiers.some((m) => m.name === mod.name);
                  return (
                    <button
                      key={mod.name}
                      type="button"
                      onClick={() => handleToggleModifier(mod)}
                      className={`p-2.5 rounded-xl border text-left text-xs transition cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500 text-neutral-950 border-emerald-400 font-bold'
                          : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className="truncate">{mod.name}</div>
                      <div className="text-[10px] opacity-80">
                        {mod.price > 0 ? `+$${mod.price.toFixed(2)}` : 'Free'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium text-xs mb-1">
                Kitchen Prep Instruction
              </label>
              <input
                type="text"
                placeholder="e.g. Extra hot, separate bag"
                value={itemNoteInput}
                onChange={(e) => setItemNoteInput(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="pt-2 border-t border-neutral-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-neutral-400 block">Unit Total:</span>
                <span className="font-mono text-sm font-bold text-emerald-400">
                  $
                  {(
                    customizingProduct.selling_price +
                    activeModifiers.reduce((s, m) => s + m.price, 0)
                  ).toFixed(2)}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCustomizingProduct(null)}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddCustomizedToCart}
                  className="px-4 py-1.5 font-bold text-xs text-neutral-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition"
                >
                  Add to Ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DYNAMIC CHECKOUT MODAL */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white">Select Payment Channel</h2>
                <p className="text-xs text-neutral-400">
                  Total: ${cartSubtotal.toFixed(2)} • {orderType === 'DINE_IN' ? 'Dine-In' : 'Takeaway'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Dynamic Tender Options */}
            <div className="grid grid-cols-4 gap-2">
              {paymentMethods.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => handleSelectPaymentMethod(m.code)}
                  className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition border cursor-pointer ${
                    selectedMethodCode === m.code
                      ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white'
                  }`}
                >
                  {m.code === 'CASH'
                    ? '💵 Cash'
                    : m.code === 'CARD'
                    ? '💳 Card'
                    : m.code === 'QR'
                    ? '📱 QR'
                    : '🏦 Transfer'}
                </button>
              ))}
            </div>

            {/* 1. CASH BODY */}
            {selectedMethodCode === 'CASH' && (
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
            )}

            {/* 2. CARD BODY + APPROVAL CODE */}
            {selectedMethodCode === 'CARD' && (
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-400 font-bold uppercase text-[10px]">
                    Card Network:
                  </span>
                  <div className="flex gap-1.5">
                    {(activeMethodObj?.config?.networks || ['VISA', 'MASTERCARD', 'AMEX']).map(
                      (net) => (
                        <button
                          key={net}
                          type="button"
                          onClick={() => {
                            setSelectedCardNetwork(net);
                            broadcastToCfd(supabase, 'PAYMENT_METHOD_CHANGE', {
                              paymentMethod: 'CARD',
                              paymentDetails: {
                                channel: 'CARD',
                                network: net,
                              },
                            });
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                            selectedCardNetwork === net
                              ? 'bg-emerald-500 text-neutral-950 border-emerald-400'
                              : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                          }`}
                        >
                          {net}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Terminal Approval / Trace / Txn No. (Slip Ref) *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. 084920 or last 4 digits"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 font-mono text-sm text-white focus:outline-none"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Enter the approval code from the EDC paper receipt for bank settlement.
                  </p>
                </div>
              </div>
            )}

            {/* 3. MULTI-PROVIDER BRUNEI QR BODY */}
            {selectedMethodCode === 'QR' && (
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3.5">
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-1.5">
                    Select Customer QR Provider:
                  </span>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {(activeMethodObj?.config?.providers || []).map((p) => {
                      const isSelected = selectedQrProvider?.name === p.name;
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => handleSelectQrProvider(p)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap border transition cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500 text-neutral-950 border-emerald-400'
                              : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                          }`}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedQrProvider && (
                  <div className="flex items-center gap-3 p-3 bg-neutral-900/60 rounded-xl border border-neutral-800">
                    <div className="w-24 h-24 bg-white p-1 rounded-lg flex-shrink-0 flex items-center justify-center">
                      <img
                        src={selectedQrProvider.qr_image_url}
                        alt={selectedQrProvider.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1 text-xs">
                      <h4 className="font-bold text-white">{selectedQrProvider.name}</h4>
                      <p className="text-[11px] text-emerald-400 font-mono">
                        {selectedQrProvider.merchant_id || 'QuickPay / Qpay'}
                      </p>
                      <p className="text-[10px] text-neutral-400 mt-1">
                        {selectedQrProvider.instructions || 'Customer scans QR on counter/screen.'}
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Customer App Transaction ID (e.g. last 6 digits) *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. 984210"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 font-mono text-sm text-white focus:outline-none"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Verify customer's green payment screen and record the reference code.
                  </p>
                </div>
              </div>
            )}

            {/* 4. BANK TRANSFER BODY */}
            {selectedMethodCode === 'TRANSFER' && (
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3.5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase block">
                  Select Destination Bank Account:
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {(activeMethodObj?.config?.banks || []).map((bank) => {
                    const isSelected = selectedBank === bank.name;
                    return (
                      <div
                        key={bank.name}
                        onClick={() => {
                          setSelectedBank(bank.name);
                          broadcastToCfd(supabase, 'PAYMENT_METHOD_CHANGE', {
                            paymentMethod: 'TRANSFER',
                            paymentDetails: {
                              channel: 'TRANSFER',
                              bank: bank.name,
                            },
                          });
                        }}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer flex justify-between items-center transition ${
                          isSelected
                            ? 'bg-emerald-950/40 border-emerald-500 text-white'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-white">{bank.name}</p>
                          <p className="font-mono text-[11px] text-emerald-400">
                            #{bank.account_number}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(bank.account_number);
                            alert(`Copied ${bank.name} account number!`);
                          }}
                          className="bg-neutral-800 hover:bg-neutral-700 text-white text-[10px] px-2 py-1 rounded transition"
                        >
                          Copy
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Transfer Ref / Sender Account Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TRF-9941 or customer name"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 font-mono text-sm text-white focus:outline-none"
                  />
                </div>
              </div>
            )}

            {checkoutError && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-900 text-rose-300 text-xs rounded-lg">
                {checkoutError}
              </div>
            )}

            <div className="flex gap-2.5 pt-2 border-t border-neutral-800">
              <button
                type="button"
                disabled={isProcessingCheckout}
                onClick={() => setIsCheckoutOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingCheckout || !isTenderSufficient}
                onClick={handleProcessCheckout}
                className="flex-2 py-2.5 rounded-xl text-xs font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 transition cursor-pointer"
              >
                {isProcessingCheckout ? 'Finalizing...' : 'Complete Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THERMAL RECEIPT SLIP */}
      {isReceiptOpen && lastSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-5 print:shadow-none print:border-none print:m-0 print:p-0">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-3 print:hidden">
              <div>
                <h3 className="text-base font-bold text-white">Payment Successful</h3>
                <p className="text-[11px] text-neutral-400">Thermal slip ready for print</p>
              </div>
              <button
                type="button"
                onClick={() => setIsReceiptOpen(false)}
                className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-neutral-300 space-y-2.5 print:border-none print:p-0 print:text-black">
              <div className="text-center pb-2 border-b border-dashed border-neutral-700">
                <h4 className="font-extrabold text-sm text-white tracking-widest uppercase print:text-black">
                  KITCHOS RESTAURANT
                </h4>
                <p className="text-[10px] text-neutral-400 print:text-neutral-600 font-bold uppercase mt-0.5">
                  *** {lastSale.order_type === 'DINE_IN' ? 'DINE-IN' : 'TAKEAWAY'} ***
                </p>
                <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                  Ticket #{lastSale.id.slice(0, 8)} • Cashier: {lastSale.staff_name}
                </p>
                <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                  {new Date(lastSale.created_at).toLocaleString([], {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </p>
              </div>

              {/* Items with modifiers */}
              <div className="space-y-1.5 py-1 border-b border-dashed border-neutral-800">
                {lastSale.items.map((item, idx) => (
                  <div key={idx} className="text-[11px]">
                    <div className="flex justify-between">
                      <span className="truncate pr-2 font-bold">
                        {item.quantity}x {item.product.name}
                      </span>
                      <span className="font-bold font-mono">
                        ${(item.unit_total * item.quantity).toFixed(2)}
                      </span>
                    </div>

                    {item.modifiers.map((m, mIdx) => (
                      <div key={mIdx} className="text-[10px] text-neutral-400 pl-3">
                        + {m.name} {m.price > 0 ? `($${m.price.toFixed(2)})` : ''}
                      </div>
                    ))}
                    {item.notes && (
                      <div className="text-[10px] text-neutral-400 italic pl-3">
                        "{item.notes}"
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between font-bold text-white print:text-black">
                  <span>TOTAL:</span>
                  <span>${lastSale.total_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-neutral-400 print:text-neutral-600">
                  <span>Tender:</span>
                  <span className="uppercase">
                    {lastSale.payment_method}
                    {lastSale.payment_details?.qr_provider &&
                      ` (${lastSale.payment_details.qr_provider})`}
                    {lastSale.payment_details?.bank && ` (${lastSale.payment_details.bank})`}
                    {lastSale.payment_details?.network &&
                      ` (${lastSale.payment_details.network})`}
                  </span>
                </div>

                {lastSale.reference_number && (
                  <div className="flex justify-between text-emerald-400 print:text-black font-bold pt-0.5 pb-0.5">
                    <span>Ref / Txn ID:</span>
                    <span>#{lastSale.reference_number}</span>
                  </div>
                )}

                <div className="flex justify-between text-neutral-400 print:text-neutral-600">
                  <span>Tendered:</span>
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
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <span>🖨️</span>
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setIsReceiptOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-neutral-950 transition cursor-pointer"
              >
                New Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SWITCH CASHIER MODAL */}
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

      {/* SHIFT FLOAT MODAL */}
      <ShiftModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        activeShift={activeShift}
        onShiftUpdated={(shift) => setActiveShift(shift)}
      />
    </div>
  );
}