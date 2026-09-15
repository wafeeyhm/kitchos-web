'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ShiftModal, { CashShift } from '@/components/ShiftModal';
import { useWakeLock } from '@/hooks/useWakeLock';
import NetworkStatus from '@/components/NetworkStatus';
import { useBranch } from '@/context/BranchContext';

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
  is_rush: boolean;
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
  const { currentBranch } = useBranch();
  useWakeLock(true);

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

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY'>('DINE_IN');
  const [isRush, setIsRush] = useState<boolean>(false);
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);

  const [customizingProduct, setCustomizingProduct] = useState<ProductItem | null>(null);
  const [activeModifiers, setActiveModifiers] = useState<ModifierOption[]>([]);
  const [itemNoteInput, setItemNoteInput] = useState('');

  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);

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

  const [lastSale, setLastSale] = useState<CompletedSale | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unit_total * item.quantity, 0);
  }, [cart]);

  const totalItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  useEffect(() => {
    broadcastToCfd(supabase, 'CART_UPDATE', {
      items: cart,
      subtotal: cartSubtotal,
      orderType,
      isRush,
      cashierName: activeStaff.name,
      branchName: currentBranch?.name || 'Main Station',
    });
  }, [cart, cartSubtotal, orderType, isRush, activeStaff.name, currentBranch?.name, supabase]);

  useEffect(() => {
    if (localStorage.getItem('kitchos_terminal_locked') === 'true') {
      setIsTerminalLocked(true);
    }

    const handleLockEvent = () => setIsTerminalLocked(true);
    window.addEventListener('kitchos_lock_terminal', handleLockEvent);

    const saved = localStorage.getItem('kitchos_active_staff');
    if (saved) {
      try {
        setActiveStaff(JSON.parse(saved));
      } catch (e) {}
    } else {
      supabase
        .from('staff_members')
        .select('id, name, role')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setActiveStaff(data);
            localStorage.setItem('kitchos_active_staff', JSON.stringify(data));
          }
        });
    }

    return () => {
      window.removeEventListener('kitchos_lock_terminal', handleLockEvent);
    };
  }, [supabase]);

  const fetchProducts = useCallback(async () => {
    if (!currentBranch?.id) return;

    try {
      setLoadingProducts(true);

      const [prodRes, bpRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, category, selling_price, is_active')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('branch_products')
          .select('product_id, is_available, price_override')
          .eq('branch_id', currentBranch.id),
      ]);

      if (prodRes.error) throw prodRes.error;

      const overrideMap = new Map((bpRes.data || []).map((bp) => [bp.product_id, bp]));
      const branchMenu: ProductItem[] = [];

      (prodRes.data || []).forEach((p: any) => {
        const override = overrideMap.get(p.id);
        const isAvailable = override ? override.is_available : true;

        if (isAvailable) {
          const effectivePrice =
            override?.price_override !== null &&
            override?.price_override !== undefined &&
            Number(override.price_override) > 0
              ? Number(override.price_override)
              : Number(p.selling_price || 0);

          branchMenu.push({
            id: p.id,
            name: p.name,
            category: p.category || 'General',
            selling_price: effectivePrice,
            available_portions: 999,
          });
        }
      });

      setProducts(branchMenu);
    } catch (err: any) {
      console.error('Error loading branch menu products:', err.message);
    } finally {
      setLoadingProducts(false);
    }
  }, [supabase, currentBranch?.id]);

  const fetchActiveShift = useCallback(async () => {
    if (!currentBranch?.id) return;

    try {
      const { data } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('branch_id', currentBranch.id)
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveShift(data);
    } catch (err: any) {
      console.error('Error loading cash shift:', err.message);
    }
  }, [supabase, currentBranch?.id]);

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

  const handleAuthenticatePin = async (pinToTest: string) => {
    setIsVerifyingPin(true);
    setPinError(null);

    try {
      const { data, error } = await supabase.rpc('authenticate_staff_pin', {
        p_pin: pinToTest.trim(),
      });

      if (error) throw error;
      const staff = data && data[0];

      if (staff) {
        setActiveStaff(staff);
        localStorage.setItem('kitchos_active_staff', JSON.stringify(staff));
        localStorage.removeItem('kitchos_terminal_locked');

        window.dispatchEvent(new Event('kitchos_staff_changed'));

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

  const handleKeypadPress = (digit: string) => {
    if (isVerifyingPin || pinInput.length >= 4) return;
    const next = pinInput + digit;
    setPinInput(next);
    if (next.length === 4) {
      handleAuthenticatePin(next);
    }
  };

  const categories = useMemo(() => {
    const list = Array.from(new Set(products.map((p) => p.category.toUpperCase())));
    return ['ALL', ...list];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'ALL' || p.category.toUpperCase() === selectedCategory;
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

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
    setIsRush(false);
    broadcastToCfd(supabase, 'CLEAR_CART', {});
  };

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

  const handleOpenCheckout = () => {
    setAmountTendered(cartSubtotal.toFixed(2));
    setTransactionRef('');
    setCheckoutError(null);
    setIsCheckoutOpen(true);

    broadcastToCfd(supabase, 'CHECKOUT_START', {
      subtotal: cartSubtotal,
      orderType,
      isRush,
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

  const handleProcessCheckout = async () => {
    if (cart.length === 0 || !isTenderSufficient) return;

    if (
      (selectedMethodCode === 'QR' ||
        selectedMethodCode === 'CARD' ||
        selectedMethodCode === 'TRANSFER') &&
      !transactionRef.trim()
    ) {
      if (!confirm('No transaction ID / reference was entered. Proceed without reference?')) {
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

      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .insert({
          total_amount: cartSubtotal,
          payment_method: selectedMethodCode.toLowerCase(),
          amount_tendered: finalTendered,
          change_due: finalChange,
          status: 'COMPLETED',
          kds_status: 'QUEUED',
          is_rush: isRush,
          staff_id: activeStaff.id || null,
          branch_id: currentBranch?.id || null,
          order_type: orderType,
          notes: orderNotes.trim() || null,
          reference_number: finalRef,
          payment_details: paymentDetails,
        })
        .select('id, created_at')
        .single();

      if (saleErr) throw saleErr;

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

      broadcastToCfd(supabase, 'SALE_COMPLETED', {
        completedSale: {
          id: saleData.id,
          total: cartSubtotal,
          amountTendered: finalTendered,
          changeDue: finalChange,
          referenceNumber: finalRef,
        },
      });

      setLastSale({
        id: saleData.id,
        created_at: saleData.created_at,
        order_type: orderType,
        is_rush: isRush,
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
      setIsRush(false);
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
    <div className="flex h-screen bg-base text-theme-primary font-sans overflow-hidden">
      <div className="h-full flex-shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 flex overflow-hidden">
        {/* Menu Catalog Section */}
        <section className="flex-1 flex flex-col min-w-0 border-r border-theme">
          <header className="h-16 px-6 border-b border-theme bg-surface flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-lg font-bold text-theme-primary tracking-tight">POS Terminal</h1>
                <p className="text-[11px] text-theme-muted">Direct order entry & modifier controls</p>
              </div>

              {currentBranch && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-brand bg-brand-light border border-brand-light px-3 py-1 rounded-full">
                  <span>📍</span>
                  <span>{currentBranch.name}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <NetworkStatus />

              {/* Cashier Badge */}
              <div className="flex items-center gap-1.5 bg-surface-elevated border border-theme rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => {
                    setPinInput('');
                    setPinError(null);
                    setIsSwitchStaffOpen(true);
                  }}
                  className="flex items-center gap-2 hover:bg-surface px-2.5 py-1 rounded-lg text-xs transition cursor-pointer"
                  title="Switch cashier"
                >
                  <span className="w-2 h-2 rounded-full bg-brand" />
                  <span className="font-semibold text-theme-primary">{activeStaff.name}</span>
                  <span className="text-[10px] text-theme-muted bg-surface px-1.5 py-0.5 rounded uppercase font-mono">
                    {activeStaff.role}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPinInput('');
                    setPinError(null);
                    localStorage.setItem('kitchos_terminal_locked', 'true');
                    setIsTerminalLocked(true);
                  }}
                  className="p-1 text-theme-muted hover:text-theme-primary hover:bg-surface rounded-lg transition cursor-pointer"
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
                  className="flex items-center gap-2 bg-surface hover:bg-surface-elevated border border-brand-light px-3.5 py-1.5 rounded-xl text-xs transition cursor-pointer"
                >
                  <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
                  <span className="font-mono text-brand font-bold">
                    ${Number(activeShift.opening_float).toFixed(2)} Float
                  </span>
                  <span className="text-theme-muted text-[10px] pl-1 border-l border-theme">
                    Z-Report →
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(true)}
                  className="flex items-center gap-2 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60 px-3.5 py-1.5 rounded-xl text-xs text-amber-400 font-semibold transition cursor-pointer"
                >
                  <span>⚠️ Till Closed</span>
                  <span>• Open Shift</span>
                </button>
              )}
            </div>
          </header>

          {/* Search & Category Filter Bar */}
          <div className="p-4 border-b border-theme bg-surface-elevated/50 space-y-3 flex-shrink-0">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search dish or beverage..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-surface border border-theme rounded-xl px-4 py-2 text-xs text-theme-primary placeholder-theme-muted focus:outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => fetchProducts()}
                className="px-3 py-2 bg-surface hover:bg-surface-elevated border border-theme rounded-xl text-xs text-theme-muted hover:text-theme-primary transition cursor-pointer"
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
                      ? 'bg-brand text-brand-contrast shadow-md font-bold'
                      : 'bg-surface hover:bg-surface-elevated text-theme-secondary hover:text-theme-primary border border-theme'
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
              <div className="flex items-center justify-center h-48 text-theme-muted text-xs">
                Loading branch menu...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-theme-muted space-y-1">
                <span className="text-2xl">📋</span>
                <p className="text-xs font-bold text-theme-secondary">No items available for this branch.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {filteredProducts.map((product) => {
                  const inCartCount = cart
                    .filter((c) => c.product.id === product.id)
                    .reduce((sum, c) => sum + c.quantity, 0);

                  return (
                    <div
                      key={product.id}
                      onClick={() => handleAddToCartDirect(product)}
                      className="relative flex flex-col justify-between p-4 rounded-2xl border transition text-left cursor-pointer group bg-surface hover:bg-surface-elevated border-theme hover:border-brand-light active:scale-[0.98] shadow-sm"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-theme-muted">
                            {product.category}
                          </span>
                          {inCartCount > 0 && (
                            <span className="bg-brand-light border border-brand-light text-brand text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                              {inCartCount} in order
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-sm text-theme-primary leading-tight line-clamp-2">
                          {product.name}
                        </h3>
                      </div>

                      <div className="flex justify-between items-end mt-4 pt-3 border-t border-theme-subtle">
                        <div>
                          <span className="font-mono text-sm font-extrabold text-brand">
                            ${product.selling_price.toFixed(2)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => handleOpenCustomize(product, e)}
                            className="px-2 py-1 bg-surface-elevated hover:bg-surface border border-theme rounded-lg text-[10px] font-bold text-theme-secondary hover:text-theme-primary transition cursor-pointer"
                            title="Add custom modifiers & notes"
                          >
                            ⚙️ Mod
                          </button>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-theme bg-surface text-theme-muted">
                            In Stock
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
        <section className="w-96 bg-surface border-l border-theme flex flex-col flex-shrink-0">
          <div className="h-16 px-6 border-b border-theme flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-theme-primary text-sm">Active Order</h2>
              <span className="bg-surface-elevated text-theme-muted border border-theme font-mono text-[10px] font-bold px-2 py-0.5 rounded-full">
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

          {/* Dine-In / Takeaway & Rush Toggles */}
          <div className="p-3 border-b border-theme bg-surface-elevated/40 flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setOrderType('DINE_IN')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                orderType === 'DINE_IN'
                  ? 'bg-brand text-brand-contrast border-brand shadow-sm font-black'
                  : 'bg-surface text-theme-secondary border-theme hover:text-theme-primary'
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
                  ? 'bg-brand text-brand-contrast border-brand shadow-sm font-black'
                  : 'bg-surface text-theme-secondary border-theme hover:text-theme-primary'
              }`}
            >
              <span>🛍️</span>
              <span>Takeaway</span>
            </button>
            <button
              type="button"
              onClick={() => setIsRush(!isRush)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border ${
                isRush
                  ? 'bg-rose-600 text-white border-rose-500 shadow-sm animate-pulse'
                  : 'bg-surface text-theme-secondary border-theme hover:text-theme-primary'
              }`}
            >
              <span>🔥</span>
              <span>Rush</span>
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-theme-muted">
                <span className="text-3xl mb-2">🛒</span>
                <p className="text-xs">No items on current order ticket.</p>
                <p className="text-[10px] text-theme-muted mt-1">Tap items to ring up an order.</p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-surface-elevated border border-theme rounded-xl space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-semibold text-theme-primary truncate">
                        {item.product.name}
                      </h4>
                      <p className="font-mono text-[11px] text-theme-muted">
                        ${item.unit_total.toFixed(2)} each
                      </p>
                    </div>

                    <div className="flex items-center gap-2 bg-surface border border-theme rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.id, -1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-surface-elevated text-theme-secondary text-xs font-bold transition cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-mono text-xs font-bold text-theme-primary w-4 text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.id, 1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-surface-elevated text-theme-secondary text-xs font-bold transition cursor-pointer"
                      >
                        +
                      </button>
                    </div>

                    <span className="font-mono text-xs font-bold text-brand w-16 text-right">
                      ${(item.unit_total * item.quantity).toFixed(2)}
                    </span>
                  </div>

                  {(item.modifiers.length > 0 || item.notes) && (
                    <div className="pt-1.5 border-t border-theme-subtle text-[10px] space-y-0.5 font-mono">
                      {item.modifiers.map((m, idx) => (
                        <div key={idx} className="flex justify-between text-amber-500">
                          <span>+ {m.name}</span>
                          {m.price > 0 && <span>+${m.price.toFixed(2)}</span>}
                        </div>
                      ))}
                      {item.notes && <p className="text-theme-muted italic">Note: "{item.notes}"</p>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Bottom Totals & Checkout */}
          <div className="p-4 border-t border-theme bg-surface space-y-3 flex-shrink-0">
            <div>
              <input
                type="text"
                placeholder="Order memo / Table # (optional)..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className="w-full bg-surface-elevated border border-theme rounded-xl px-3 py-1.5 text-xs text-theme-primary placeholder-theme-muted focus:outline-none focus:border-brand"
              />
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-theme-secondary">
                <span>
                  Subtotal ({orderType === 'DINE_IN' ? 'Dine-In' : 'Takeaway'})
                  {isRush && <span className="text-rose-400 font-bold ml-1">• RUSH</span>}
                </span>
                <span className="font-mono">${cartSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-black text-theme-primary pt-1 border-t border-theme">
                <span>Total Due</span>
                <span className="font-mono text-brand">${cartSubtotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleOpenCheckout}
              className="w-full py-3 rounded-xl bg-brand hover:opacity-95 text-brand-contrast disabled:opacity-40 disabled:cursor-not-allowed font-extrabold text-xs tracking-wider uppercase transition shadow-lg cursor-pointer"
            >
              Checkout (${cartSubtotal.toFixed(2)})
            </button>
          </div>
        </section>
      </main>

      {/* MODAL: ITEM CUSTOMIZATION */}
      {customizingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface border border-theme rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-brand tracking-wider">
                Customize Order Item
              </span>
              <h3 className="text-lg font-bold text-theme-primary">{customizingProduct.name}</h3>
              <p className="text-xs text-theme-muted">
                Base price: ${customizingProduct.selling_price.toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase text-theme-secondary">
                Add-ons & Modifiers
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
                          ? 'bg-brand text-brand-contrast border-brand font-bold shadow-sm'
                          : 'bg-surface-elevated text-theme-secondary border-theme hover:border-brand-light'
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
              <label className="block text-theme-secondary font-medium text-xs mb-1">
                Kitchen Prep Instruction
              </label>
              <input
                type="text"
                placeholder="e.g. Extra hot, separate bag"
                value={itemNoteInput}
                onChange={(e) => setItemNoteInput(e.target.value)}
                className="w-full bg-surface-elevated border border-theme rounded-xl px-3 py-2 text-xs text-theme-primary"
              />
            </div>

            <div className="pt-2 border-t border-theme flex justify-between items-center">
              <div>
                <span className="text-[10px] text-theme-muted block">Unit Total:</span>
                <span className="font-mono text-sm font-bold text-brand">
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
                  className="px-3 py-1.5 text-xs text-theme-secondary hover:text-theme-primary bg-surface-elevated rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddCustomizedToCart}
                  className="px-4 py-1.5 font-bold text-xs bg-brand text-brand-contrast rounded-xl transition shadow-md"
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
          <div className="bg-surface border border-theme rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex justify-between items-start border-b border-theme pb-3">
              <div>
                <h2 className="text-lg font-bold text-theme-primary">Select Payment Channel</h2>
                <p className="text-xs text-theme-muted">
                  Total: ${cartSubtotal.toFixed(2)} • {orderType === 'DINE_IN' ? 'Dine-In' : 'Takeaway'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="text-theme-muted hover:text-theme-primary text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {paymentMethods.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => handleSelectPaymentMethod(m.code)}
                  className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition border cursor-pointer ${
                    selectedMethodCode === m.code
                      ? 'bg-brand text-brand-contrast border-brand shadow'
                      : 'bg-surface-elevated text-theme-secondary border-theme hover:text-theme-primary'
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

            {selectedMethodCode === 'CASH' && (
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-theme-secondary mb-1.5">
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
                    className="w-full bg-surface-elevated border border-theme focus:border-brand rounded-xl px-4 py-2.5 font-mono text-xl font-bold text-theme-primary focus:outline-none"
                  />
                </div>

                <div className="flex gap-2">
                  {quickCashPresets.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmountTendered(amt.toFixed(2))}
                      className="flex-1 py-1.5 bg-surface-elevated hover:bg-surface border border-theme rounded-lg text-xs font-mono font-semibold text-theme-secondary hover:text-theme-primary cursor-pointer"
                    >
                      ${amt.toFixed(2)}
                    </button>
                  ))}
                </div>

                <div className="p-3 bg-surface-elevated rounded-xl border border-theme flex justify-between items-center text-xs">
                  <span className="text-theme-muted">Change Due:</span>
                  <span
                    className={`font-mono font-bold text-base ${
                      tenderFloat < cartSubtotal ? 'text-rose-400' : 'text-brand'
                    }`}
                  >
                    ${changeDue.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {selectedMethodCode === 'CARD' && (
              <div className="p-4 bg-surface-elevated border border-theme rounded-2xl space-y-3.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-theme-muted font-bold uppercase text-[10px]">
                    Card Network:
                  </span>
                  <div className="flex gap-1.5">
                    {(activeMethodObj?.config?.networks || ['VISA', 'MASTERCARD', 'AMEX']).map((net) => (
                      <button
                        key={net}
                        type="button"
                        onClick={() => setSelectedCardNetwork(net)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          selectedCardNetwork === net
                            ? 'bg-brand text-brand-contrast border-brand'
                            : 'bg-surface text-theme-secondary border-theme'
                        }`}
                      >
                        {net}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-theme-secondary mb-1">
                    Terminal Approval / Slip Ref No. *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. 084920"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full bg-surface border border-theme focus:border-brand rounded-xl px-3.5 py-2 font-mono text-sm text-theme-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {selectedMethodCode === 'QR' && (
              <div className="p-4 bg-surface-elevated border border-theme rounded-2xl space-y-3.5">
                <div>
                  <span className="text-[10px] uppercase font-bold text-theme-muted block mb-1.5">
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
                              ? 'bg-brand text-brand-contrast border-brand'
                              : 'bg-surface text-theme-secondary border-theme hover:text-theme-primary'
                          }`}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedQrProvider && (
                  <div className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-theme">
                    <div className="w-20 h-20 bg-white p-1 rounded-lg flex-shrink-0 flex items-center justify-center">
                      <img
                        src={selectedQrProvider.qr_image_url}
                        alt={selectedQrProvider.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1 text-xs">
                      <h4 className="font-bold text-theme-primary">{selectedQrProvider.name}</h4>
                      <p className="text-[11px] text-brand font-mono">
                        {selectedQrProvider.merchant_id || 'QuickPay'}
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-theme-secondary mb-1">
                    Customer App Txn Reference ID *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. 984210"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full bg-surface border border-theme focus:border-brand rounded-xl px-3.5 py-2 font-mono text-sm text-theme-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {selectedMethodCode === 'TRANSFER' && (
              <div className="p-4 bg-surface-elevated border border-theme rounded-2xl space-y-3.5">
                <span className="text-[10px] font-bold text-theme-muted uppercase block">
                  Select Destination Bank Account:
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {(activeMethodObj?.config?.banks || []).map((bank) => {
                    const isSelected = selectedBank === bank.name;
                    return (
                      <div
                        key={bank.name}
                        onClick={() => setSelectedBank(bank.name)}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer flex justify-between items-center transition ${
                          isSelected
                            ? 'bg-brand-light border-brand text-theme-primary'
                            : 'bg-surface border-theme text-theme-secondary'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-theme-primary">{bank.name}</p>
                          <p className="font-mono text-[11px] text-brand">
                            #{bank.account_number}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs font-medium text-theme-secondary mb-1">
                    Transfer Ref / Sender Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TRF-9941"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full bg-surface border border-theme focus:border-brand rounded-xl px-3.5 py-2 font-mono text-sm text-theme-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {checkoutError && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-900 text-rose-300 text-xs rounded-lg">
                {checkoutError}
              </div>
            )}

            <div className="flex gap-2.5 pt-2 border-t border-theme">
              <button
                type="button"
                disabled={isProcessingCheckout}
                onClick={() => setIsCheckoutOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-theme-secondary hover:text-theme-primary bg-surface-elevated transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingCheckout || !isTenderSufficient}
                onClick={handleProcessCheckout}
                className="flex-2 py-2.5 rounded-xl text-xs font-bold text-brand-contrast bg-brand hover:opacity-90 disabled:opacity-40 transition cursor-pointer"
              >
                {isProcessingCheckout ? 'Finalizing...' : 'Complete Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT SLIP MODAL */}
      {isReceiptOpen && lastSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-surface border border-theme rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-5 print:shadow-none print:border-none print:m-0 print:p-0">
            <div className="flex justify-between items-start border-b border-theme pb-3 print:hidden">
              <div>
                <h3 className="text-base font-bold text-theme-primary">Payment Successful</h3>
                <p className="text-[11px] text-theme-muted">Thermal slip ready for print</p>
              </div>
              <button
                type="button"
                onClick={() => setIsReceiptOpen(false)}
                className="text-theme-muted hover:text-theme-primary text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-surface-elevated border border-theme rounded-xl font-mono text-xs text-theme-primary space-y-2.5">
              <div className="text-center pb-2 border-b border-dashed border-theme">
                <h4 className="font-extrabold text-sm tracking-widest uppercase">
                  KITCHOS RESTAURANT
                </h4>
                {currentBranch && (
                  <p className="text-[10px] text-brand font-bold uppercase">
                    {currentBranch.name} ({currentBranch.code})
                  </p>
                )}
                <p className="text-[10px] text-theme-muted">
                  Ticket #{lastSale.id.slice(0, 8)} • Staff: {lastSale.staff_name}
                </p>
              </div>

              <div className="space-y-1.5 py-1 border-b border-dashed border-theme">
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
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between font-bold text-theme-primary">
                  <span>TOTAL:</span>
                  <span>${lastSale.total_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-theme-muted">
                  <span>Tender ({lastSale.payment_method}):</span>
                  <span>${lastSale.amount_tendered.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-theme-muted">
                  <span>Change:</span>
                  <span>${lastSale.change_due.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-surface-elevated border border-theme text-xs font-bold text-theme-primary flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>🖨️</span>
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setIsReceiptOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-brand text-brand-contrast text-xs font-bold cursor-pointer"
              >
                New Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TERMINAL LOCK SCREEN */}
      {isTerminalLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
          <div className="bg-surface border border-theme rounded-3xl max-w-xs w-full p-6 text-center space-y-5 shadow-2xl">
            <div>
              <div className="w-12 h-12 mx-auto rounded-full bg-surface-elevated border border-theme flex items-center justify-center text-xl mb-2">
                🔒
              </div>
              <h3 className="text-lg font-black text-theme-primary">Station Locked</h3>
              <p className="text-xs text-theme-muted">Enter your 4-digit PIN to unlock</p>
            </div>

            <div className="flex justify-center items-center gap-3.5 py-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-3.5 w-3.5 rounded-full transition-all duration-150 ${
                    pinInput.length > i
                      ? 'bg-brand scale-110 shadow-sm'
                      : 'bg-surface-elevated border border-theme'
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
                  onClick={() => handleKeypadPress(digit)}
                  className="h-13 rounded-2xl bg-surface-elevated hover:bg-surface border border-theme active:scale-95 font-mono text-xl font-bold text-theme-primary transition cursor-pointer"
                >
                  {digit}
                </button>
              ))}

              <div />

              <button
                type="button"
                disabled={isVerifyingPin}
                onClick={() => handleKeypadPress('0')}
                className="h-13 rounded-2xl bg-surface-elevated hover:bg-surface border border-theme active:scale-95 font-mono text-xl font-bold text-theme-primary transition cursor-pointer"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                className="h-13 rounded-2xl bg-surface hover:bg-surface-elevated text-theme-secondary text-base font-bold flex items-center justify-center cursor-pointer"
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