'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useWakeLock } from '@/hooks/useWakeLock';

interface CartItem {
  id: string;
  product: {
    name: string;
    selling_price: number;
    category: string;
  };
  quantity: number;
  modifiers: { name: string; price: number }[];
  notes?: string;
  unit_total: number;
}

interface CfdState {
  view: 'IDLE' | 'RINGING' | 'CHECKOUT' | 'COMPLETED';
  orderType?: 'DINE_IN' | 'TAKEAWAY';
  cashierName?: string;
  items: CartItem[];
  subtotal: number;
  paymentMethod?: string;
  paymentDetails?: {
    channel?: string;
    qr_provider?: string;
    qr_image_url?: string;
    instructions?: string;
    merchant_id?: string;
    bank?: string;
    network?: string;
  };
  completedSale?: {
    id: string;
    total: number;
    amountTendered: number;
    changeDue: number;
    referenceNumber?: string;
  };
}

export default function CustomerDisplayPage() {
  const supabase = createClient();
  useWakeLock(true); // Keep secondary customer display awake

  const [state, setState] = useState<CfdState>({
    view: 'IDLE',
    items: [],
    subtotal: 0,
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync listener: Dual BroadcastChannel + Supabase Realtime
  useEffect(() => {
    // 1. Local Browser BroadcastChannel (Instant for dual-head monitors on same PC)
    const localChannel = new BroadcastChannel('kitchos_cfd_channel');

    localChannel.onmessage = (event) => {
      handleCfdPayload(event.data);
    };

    // 2. Supabase Realtime Broadcast (For standalone iPads/tablets on counter)
    const realtimeChannel = supabase
      .channel('kitchos_cfd_realtime')
      .on('broadcast', { event: 'cfd_event' }, ({ payload }) => {
        handleCfdPayload(payload);
      })
      .subscribe();

    function handleCfdPayload(data: any) {
      if (!data || !data.type) return;

      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }

      switch (data.type) {
        case 'CART_UPDATE':
          if (!data.items || data.items.length === 0) {
            setState({ view: 'IDLE', items: [], subtotal: 0 });
          } else {
            setState({
              view: 'RINGING',
              items: data.items,
              subtotal: data.subtotal,
              orderType: data.orderType,
              cashierName: data.cashierName,
            });
          }
          break;

        case 'CHECKOUT_START':
          setState((prev) => ({
            ...prev,
            view: 'CHECKOUT',
            subtotal: data.subtotal,
            orderType: data.orderType,
            paymentMethod: data.paymentMethod,
            paymentDetails: data.paymentDetails,
          }));
          break;

        case 'PAYMENT_METHOD_CHANGE':
          setState((prev) => ({
            ...prev,
            paymentMethod: data.paymentMethod,
            paymentDetails: data.paymentDetails,
          }));
          break;

        case 'SALE_COMPLETED':
          setState((prev) => ({
            ...prev,
            view: 'COMPLETED',
            completedSale: data.completedSale,
          }));

          // Automatically return to IDLE after 6 seconds
          resetTimerRef.current = setTimeout(() => {
            setState({ view: 'IDLE', items: [], subtotal: 0 });
          }, 6000);
          break;

        case 'CLEAR_CART':
          setState({ view: 'IDLE', items: [], subtotal: 0 });
          break;

        default:
          break;
      }
    }

    return () => {
      localChannel.close();
      supabase.removeChannel(realtimeChannel);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [supabase]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-neutral-950 text-white font-sans flex flex-col overflow-hidden select-none relative">
      {/* Top Floating Control Pill */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <button
          onClick={toggleFullscreen}
          className="bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white px-3 py-1.5 rounded-full text-xs font-mono transition cursor-pointer backdrop-blur-sm"
          title="Toggle Fullscreen Kiosk Mode"
        >
          {isFullscreen ? 'Exit Fullscreen' : '⛶ Fullscreen'}
        </button>
      </div>

      {/* VIEW 1: IDLE / WELCOME BRANDING */}
      {state.view === 'IDLE' && (
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-radial from-neutral-900 to-neutral-950">
          <div className="w-24 h-24 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-4xl mb-6 shadow-2xl shadow-emerald-950/50 animate-pulse">
            K
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-2">
            Welcome to KitchOS
          </h1>
          <p className="text-neutral-400 text-base max-w-md leading-relaxed">
            Freshly prepared food & beverages. Your order will appear on this screen as it is rung up.
          </p>

          <div className="mt-12 flex items-center gap-3 px-5 py-2.5 rounded-full bg-neutral-900/60 border border-neutral-800">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-mono font-bold text-neutral-300">
              Terminal Active • Ready for Order
            </span>
          </div>
        </main>
      )}

      {/* VIEW 2: LIVE ORDER RINGING */}
      {state.view === 'RINGING' && (
        <main className="flex-1 flex overflow-hidden">
          {/* Left Column: Itemized Ticket List */}
          <section className="flex-1 flex flex-col border-r border-neutral-800/80 bg-neutral-950 p-8">
            <div className="flex justify-between items-center pb-5 border-b border-neutral-800/80 mb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Current Order
                </span>
                <h2 className="text-2xl font-black text-white">Itemized Receipt</h2>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${
                    state.orderType === 'TAKEAWAY'
                      ? 'bg-amber-950/80 text-amber-400 border-amber-800/60'
                      : 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                  }`}
                >
                  {state.orderType === 'TAKEAWAY' ? '🛍️ Takeaway' : '🍽️ Dine-In'}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {state.items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-neutral-900/60 border border-neutral-800/80 rounded-2xl flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-emerald-400 text-sm bg-emerald-950/80 border border-emerald-800/50 px-2 py-0.5 rounded-lg">
                        {item.quantity}x
                      </span>
                      <h3 className="font-bold text-base text-white truncate">{item.product.name}</h3>
                    </div>

                    {/* Modifiers & Custom Notes */}
                    {(item.modifiers.length > 0 || item.notes) && (
                      <div className="mt-2 space-y-0.5 text-xs text-neutral-400 pl-8 font-mono">
                        {item.modifiers.map((m, idx) => (
                          <div key={idx} className="text-amber-300">
                            + {m.name} {m.price > 0 ? `(+$${m.price.toFixed(2)})` : ''}
                          </div>
                        ))}
                        {item.notes && <div className="italic text-neutral-400">"{item.notes}"</div>}
                      </div>
                    )}
                  </div>

                  <span className="font-mono text-base font-black text-white">
                    ${(item.unit_total * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Right Column: Total Bill Summary */}
          <section className="w-96 bg-neutral-900/40 p-8 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-6 border-b border-neutral-800">
                <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center font-black text-emerald-400">
                  K
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">KitchOS Cafe</h3>
                  <p className="text-xs text-neutral-500 font-mono">
                    Cashier: {state.cashierName || 'Main Station'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-neutral-400 text-sm">
                  <span>Item Count</span>
                  <span className="font-mono font-bold text-white">
                    {state.items.reduce((s, i) => s + i.quantity, 0)} items
                  </span>
                </div>
                <div className="flex justify-between text-neutral-400 text-sm">
                  <span>Order Type</span>
                  <span className="font-bold text-white">
                    {state.orderType === 'TAKEAWAY' ? 'Takeaway' : 'Dine-In'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 bg-neutral-950 border border-neutral-800 rounded-3xl space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 block">
                Total Amount Due
              </span>
              <p className="font-mono text-5xl font-black text-emerald-400 tracking-tight">
                ${state.subtotal.toFixed(2)}
              </p>
              <span className="text-[11px] text-neutral-500 block pt-1">
                Taxes included • Ready for payment
              </span>
            </div>
          </section>
        </main>
      )}

      {/* VIEW 3: CHECKOUT & DYNAMIC QR DISPLAY */}
      {state.view === 'CHECKOUT' && (
        <main className="flex-1 flex flex-col items-center justify-center p-8 bg-neutral-950">
          <div className="max-w-xl w-full bg-neutral-900/80 border border-neutral-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Payment Request • {state.orderType === 'TAKEAWAY' ? 'Takeaway' : 'Dine-In'}
              </span>
              <h2 className="text-3xl font-black text-white mt-1">Please Complete Payment</h2>
              <div className="mt-2 font-mono text-6xl font-black text-emerald-400">
                ${state.subtotal.toFixed(2)}
              </div>
            </div>

            {/* DYNAMIC BRUNEI QR PROVIDER DISPLAY */}
            {state.paymentMethod === 'QR' && state.paymentDetails?.qr_image_url && (
              <div className="p-6 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-4">
                <div className="w-56 h-56 mx-auto bg-white p-3 rounded-2xl shadow-xl flex items-center justify-center">
                  <img
                    src={state.paymentDetails.qr_image_url}
                    alt="Payment QR"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">
                    {state.paymentDetails.qr_provider || 'Scan QR to Pay'}
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                    {state.paymentDetails.merchant_id && `Merchant: ${state.paymentDetails.merchant_id}`}
                  </p>
                  <p className="text-xs text-emerald-400/90 mt-1">
                    {state.paymentDetails.instructions ||
                      'Scan using BIBD, Baiduri, TAIB, Pocket, or Ding!'}
                  </p>
                </div>
              </div>
            )}

            {/* CARD TERMINAL PROMPT */}
            {state.paymentMethod === 'CARD' && (
              <div className="p-8 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3">
                <span className="text-5xl block">💳</span>
                <h3 className="font-extrabold text-xl text-white">
                  Tap or Insert Card on EDC Terminal
                </h3>
                <p className="text-xs text-neutral-400">
                  Accepting {state.paymentDetails?.network || 'Visa / Mastercard / Debit'}
                </p>
              </div>
            )}

            {/* CASH PAYMENT PROMPT */}
            {state.paymentMethod === 'CASH' && (
              <div className="p-8 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3">
                <span className="text-5xl block">💵</span>
                <h3 className="font-extrabold text-xl text-white">Paying with Cash</h3>
                <p className="text-xs text-neutral-400">Please hand cash to the cashier at the till.</p>
              </div>
            )}

            {/* BANK WIRE PROMPT */}
            {state.paymentMethod === 'TRANSFER' && (
              <div className="p-6 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3 text-left font-mono">
                <span className="text-xs text-neutral-400 uppercase font-bold block text-center">
                  Instant Bank Wire Details
                </span>
                <div className="p-3 bg-neutral-900 rounded-xl border border-neutral-800 text-xs space-y-1">
                  <p className="text-white font-bold">{state.paymentDetails?.bank || 'Bank Account'}</p>
                  <p className="text-emerald-400 font-bold text-sm">
                    Amount: ${state.subtotal.toFixed(2)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* VIEW 4: PAYMENT COMPLETED / THANK YOU */}
      {state.view === 'COMPLETED' && (
        <main className="flex-1 flex flex-col items-center justify-center p-8 bg-radial from-neutral-900 to-neutral-950 text-center space-y-6 animate-fade-in">
          <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-4xl text-emerald-400 shadow-2xl shadow-emerald-950">
            ✓
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Payment Confirmed
            </span>
            <h1 className="text-4xl font-black text-white mt-1">Thank You For Your Order!</h1>
            <p className="text-sm text-neutral-400 mt-1 font-mono">
              Order #{state.completedSale?.id.slice(0, 8)}
            </p>
          </div>

          {state.completedSale && state.completedSale.changeDue > 0 && (
            <div className="p-6 bg-neutral-900/90 border border-neutral-800 rounded-3xl max-w-sm w-full space-y-1">
              <span className="text-xs text-neutral-400">Your Change:</span>
              <p className="font-mono text-4xl font-black text-emerald-400">
                ${state.completedSale.changeDue.toFixed(2)}
              </p>
            </div>
          )}

          <p className="text-xs text-neutral-500 animate-pulse font-mono">
            Returning to welcome screen...
          </p>
        </main>
      )}
    </div>
  );
}