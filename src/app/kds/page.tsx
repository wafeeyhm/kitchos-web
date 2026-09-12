'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';

interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  item_name: string;
  quantity: number;
  product?: {
    category: string;
  };
}

interface KitchenTicket {
  id: string;
  created_at: string;
  status: 'COMPLETED' | 'VOIDED';
  kitchen_status: 'QUEUED' | 'IN_PREP' | 'READY' | 'SERVED';
  prep_started_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  items: SaleItem[];
}

interface BomSpec {
  quantity_required: number;
  inventory_item: {
    name: string;
    unit_of_measure: string;
  };
}

// Built-in Web Audio API Chime (zero external files required)
function playKitchenChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    // Two-tone bell: D5 to A5
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880.0, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.45);
  } catch (err) {
    console.error('Audio chime failed:', err);
  }
}

export default function KdsPage() {
  const supabase = createClient();

  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [stationFilter, setStationFilter] = useState<'ALL' | 'FOOD' | 'BEVERAGES'>('ALL');
  const [viewHistory, setViewHistory] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Recipe Specs Inspection Modal
  const [inspectDish, setInspectDish] = useState<{ id: string; name: string } | null>(null);
  const [bomSpecs, setBomSpecs] = useState<BomSpec[]>([]);
  const [loadingBom, setLoadingBom] = useState(false);

  // Keep track of ticket IDs to detect newly arrived orders
  const knownTicketIds = useRef<Set<string>>(new Set());

  // 1. Tick interval every second for live elapsed timers
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Fetch Tickets
  const fetchKitchenTickets = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);

      const { data, error } = await supabase
        .from('sales')
        .select(`
          id,
          created_at,
          status,
          kitchen_status,
          prep_started_at,
          ready_at,
          served_at,
          items:sale_items (
            id,
            sale_id,
            product_id,
            item_name,
            quantity,
            product:products (
              category
            )
          )
        `)
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const incoming = (data as any) || [];

      // Check for new tickets to ring chime
      if (!isInitial && soundEnabled) {
        const hasNew = incoming.some(
          (t: KitchenTicket) =>
            !knownTicketIds.current.has(t.id) && t.kitchen_status === 'QUEUED'
        );
        if (hasNew) playKitchenChime();
      }

      knownTicketIds.current = new Set(incoming.map((t: KitchenTicket) => t.id));
      setTickets(incoming);
    } catch (err: any) {
      console.error('Error fetching kitchen tickets:', err.message);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [supabase, soundEnabled]);

  useEffect(() => {
    fetchKitchenTickets(true);

    // Supabase Realtime Listener for instant ticket reception
    const channel = supabase
      .channel(`realtime:kds-stream-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        fetchKitchenTickets(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, () => {
        fetchKitchenTickets(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchKitchenTickets, supabase]);

  // 3. Status Transition Handlers
  const handleUpdateStatus = async (
    ticketId: string,
    nextStatus: 'QUEUED' | 'IN_PREP' | 'READY' | 'SERVED'
  ) => {
    const updatePayload: Record<string, any> = { kitchen_status: nextStatus };
    if (nextStatus === 'IN_PREP') updatePayload.prep_started_at = new Date().toISOString();
    if (nextStatus === 'READY') updatePayload.ready_at = new Date().toISOString();
    if (nextStatus === 'SERVED') updatePayload.served_at = new Date().toISOString();

    // Optimistic UI update
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, ...updatePayload } : t))
    );

    const { error } = await supabase.from('sales').update(updatePayload).eq('id', ticketId);
    if (error) {
      console.error('Failed to update kitchen ticket status:', error.message);
      fetchKitchenTickets(false);
    }
  };

  // 4. Fetch Recipe BOM specs for cooks
  const handleInspectRecipe = async (productId: string, dishName: string) => {
    setInspectDish({ id: productId, name: dishName });
    setLoadingBom(true);
    try {
      const { data, error } = await supabase
        .from('recipe_bom')
        .select(`
          quantity_required,
          inventory_item:inventory_items (
            name,
            unit_of_measure
          )
        `)
        .eq('product_id', productId);

      if (error) throw error;
      setBomSpecs((data as any) || []);
    } catch (err: any) {
      console.error('Error fetching recipe BOM:', err.message);
    } finally {
      setLoadingBom(false);
    }
  };

  // Filter tickets by station
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (!viewHistory && t.kitchen_status === 'SERVED') return false;
      if (viewHistory && t.kitchen_status !== 'SERVED') return false;

      if (stationFilter === 'ALL') return true;
      return t.items.some((item) => {
        const cat = (item.product?.category || '').toUpperCase();
        return stationFilter === 'FOOD' ? cat === 'FOOD' : cat === 'BEVERAGES';
      });
    });
  }, [tickets, stationFilter, viewHistory]);

  // Group active tickets by Kanban columns
  const queuedTickets = filteredTickets.filter((t) => t.kitchen_status === 'QUEUED');
  const inPrepTickets = filteredTickets.filter((t) => t.kitchen_status === 'IN_PREP');
  const readyTickets = filteredTickets.filter((t) => t.kitchen_status === 'READY');

  // Elapsed Timer Formatter & Colorizer
  const getElapsedInfo = (createdAt: string) => {
    const elapsedSec = Math.max(0, Math.floor((currentTime - new Date(createdAt).getTime()) / 1000));
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;
    const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;

    let colorClass = 'bg-neutral-800 text-neutral-300 border-neutral-700';
    if (mins >= 10) {
      colorClass = 'bg-rose-950/80 text-rose-400 border-rose-800/80 animate-pulse';
    } else if (mins >= 5) {
      colorClass = 'bg-amber-950/80 text-amber-300 border-amber-800/70';
    }

    return { formatted, colorClass, mins };
  };

  return (
    <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
      <div className="h-full flex-shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 flex flex-col overflow-hidden bg-neutral-950">
        {/* Top KDS Header */}
        <header className="h-16 px-6 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>🍳</span>
              Kitchen Display (KDS)
            </h1>
            <span className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Feed
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Station Filter Chips */}
            <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs font-semibold">
              <button
                onClick={() => setStationFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  stationFilter === 'ALL'
                    ? 'bg-neutral-800 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                All Stations
              </button>
              <button
                onClick={() => setStationFilter('FOOD')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  stationFilter === 'FOOD'
                    ? 'bg-neutral-800 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Kitchen (Food)
              </button>
              <button
                onClick={() => setStationFilter('BEVERAGES')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  stationFilter === 'BEVERAGES'
                    ? 'bg-neutral-800 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Barista (Bar)
              </button>
            </div>

            {/* Audio Chime Toggle */}
            <button
              onClick={() => {
                if (!soundEnabled) playKitchenChime();
                setSoundEnabled(!soundEnabled);
              }}
              className={`p-2 rounded-xl border text-xs transition cursor-pointer ${
                soundEnabled
                  ? 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  : 'bg-rose-950/30 border-rose-900/60 text-rose-400'
              }`}
              title={soundEnabled ? 'Chime Active' : 'Chime Muted'}
            >
              {soundEnabled ? '🔔 Chime On' : '🔕 Muted'}
            </button>

            {/* Completed History Toggle */}
            <button
              onClick={() => setViewHistory(!viewHistory)}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                viewHistory
                  ? 'bg-emerald-500 text-neutral-950 border-emerald-400'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-800'
              }`}
            >
              {viewHistory ? '← Return to Active KDS' : 'Served History'}
            </button>
          </div>
        </header>

        {/* VIEW: Served History */}
        {viewHistory ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider">
              Recently Served Tickets
            </h2>
            {filteredTickets.length === 0 ? (
              <p className="text-xs text-neutral-500">No served tickets recorded.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="bg-neutral-900/40 border border-neutral-800/80 rounded-2xl p-4 space-y-3 opacity-80 hover:opacity-100 transition"
                  >
                    <div className="flex justify-between items-start border-b border-neutral-800 pb-2">
                      <div>
                        <span className="font-mono font-bold text-white text-sm">
                          #{ticket.id.slice(0, 8)}
                        </span>
                        <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
                          Ordered: {new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="bg-neutral-800 text-neutral-400 text-[10px] font-bold px-2 py-0.5 rounded">
                        SERVED
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      {ticket.items.map((i) => (
                        <div key={i.id} className="flex justify-between text-neutral-300">
                          <span>{i.quantity}x {i.item_name}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-neutral-800 flex justify-end">
                      <button
                        onClick={() => handleUpdateStatus(ticket.id, 'READY')}
                        className="text-[10px] text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 px-2.5 py-1 rounded transition cursor-pointer"
                      >
                        ↶ Revert to Ready
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* VIEW: 3-Column Kanban Board */
          <div className="flex-1 grid grid-cols-3 divide-x divide-neutral-800/80 overflow-hidden">
            {/* COLUMN 1: QUEUED */}
            <div className="flex flex-col h-full bg-neutral-950/40 min-w-0">
              <div className="p-3.5 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/30">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    Queued / New
                  </h2>
                </div>
                <span className="bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono text-xs font-bold px-2 py-0.5 rounded-full">
                  {queuedTickets.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {queuedTickets.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-600">
                    <span className="text-2xl mb-1">💤</span>
                    <p className="text-xs">No pending orders in queue.</p>
                  </div>
                ) : (
                  queuedTickets.map((ticket) => {
                    const elapsed = getElapsedInfo(ticket.created_at);
                    return (
                      <div
                        key={ticket.id}
                        className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 space-y-3.5 shadow-lg shadow-black/40 hover:border-neutral-700 transition"
                      >
                        {/* Ticket Top Meta */}
                        <div className="flex justify-between items-start border-b border-neutral-800 pb-2.5">
                          <div>
                            <span className="font-mono font-extrabold text-white text-base">
                              #{ticket.id.slice(0, 8)}
                            </span>
                            <span className="block text-[10px] text-neutral-500 font-mono mt-0.5">
                              {new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className={`px-2.5 py-1 rounded-lg border font-mono font-extrabold text-xs flex items-center gap-1 ${elapsed.colorClass}`}>
                            <span>⏱️</span>
                            <span>{elapsed.formatted}</span>
                          </div>
                        </div>

                        {/* Items Checklist */}
                        <div className="space-y-2">
                          {ticket.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between items-center group cursor-pointer"
                              onClick={() => handleInspectRecipe(item.product_id, item.item_name)}
                              title="Click to inspect recipe & portion specs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="bg-neutral-800 border border-neutral-700 font-mono text-white text-xs font-bold px-2 py-0.5 rounded">
                                  {item.quantity}x
                                </span>
                                <span className="text-sm font-semibold text-white group-hover:text-emerald-400 transition">
                                  {item.item_name}
                                </span>
                              </div>
                              <span className="text-[10px] text-neutral-500 group-hover:text-emerald-400">
                                🔍 specs
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Action: Start Prep */}
                        <button
                          onClick={() => handleUpdateStatus(ticket.id, 'IN_PREP')}
                          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold tracking-wider uppercase transition shadow-md shadow-blue-950/40 cursor-pointer"
                        >
                          ▶ Start Prep
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUMN 2: IN PREP */}
            <div className="flex flex-col h-full bg-neutral-950/40 min-w-0">
              <div className="p-3.5 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/30">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    In Prep / Cooking
                  </h2>
                </div>
                <span className="bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono text-xs font-bold px-2 py-0.5 rounded-full">
                  {inPrepTickets.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {inPrepTickets.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-600">
                    <span className="text-2xl mb-1">👨‍🍳</span>
                    <p className="text-xs">No tickets currently being prepped.</p>
                  </div>
                ) : (
                  inPrepTickets.map((ticket) => {
                    const elapsed = getElapsedInfo(ticket.created_at);
                    return (
                      <div
                        key={ticket.id}
                        className="bg-neutral-900/90 border border-amber-900/50 rounded-2xl p-4 space-y-3.5 shadow-lg shadow-black/40 hover:border-amber-700/60 transition"
                      >
                        <div className="flex justify-between items-start border-b border-neutral-800 pb-2.5">
                          <div>
                            <span className="font-mono font-extrabold text-white text-base">
                              #{ticket.id.slice(0, 8)}
                            </span>
                            <span className="block text-[10px] text-amber-400/80 font-mono mt-0.5">
                              Started: {ticket.prep_started_at ? new Date(ticket.prep_started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                            </span>
                          </div>

                          <div className={`px-2.5 py-1 rounded-lg border font-mono font-extrabold text-xs flex items-center gap-1 ${elapsed.colorClass}`}>
                            <span>⏱️</span>
                            <span>{elapsed.formatted}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {ticket.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between items-center group cursor-pointer"
                              onClick={() => handleInspectRecipe(item.product_id, item.item_name)}
                              title="Click to inspect recipe & portion specs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="bg-amber-950/60 border border-amber-800/60 font-mono text-amber-300 text-xs font-bold px-2 py-0.5 rounded">
                                  {item.quantity}x
                                </span>
                                <span className="text-sm font-semibold text-white group-hover:text-amber-400 transition">
                                  {item.item_name}
                                </span>
                              </div>
                              <span className="text-[10px] text-neutral-500 group-hover:text-amber-400">
                                🔍 specs
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleUpdateStatus(ticket.id, 'QUEUED')}
                            className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs font-bold transition cursor-pointer"
                            title="Revert to Queue"
                          >
                            ↶
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(ticket.id, 'READY')}
                            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-extrabold tracking-wider uppercase transition shadow-md shadow-amber-950/40 cursor-pointer"
                          >
                            ✓ Mark Ready
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUMN 3: READY FOR PICKUP */}
            <div className="flex flex-col h-full bg-neutral-950/40 min-w-0">
              <div className="p-3.5 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/30">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    Ready for Runner / Pickup
                  </h2>
                </div>
                <span className="bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono text-xs font-bold px-2 py-0.5 rounded-full">
                  {readyTickets.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {readyTickets.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-600">
                    <span className="text-2xl mb-1">🔔</span>
                    <p className="text-xs">No orders waiting on the pass.</p>
                  </div>
                ) : (
                  readyTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="bg-neutral-900/90 border border-emerald-900/60 rounded-2xl p-4 space-y-3.5 shadow-lg shadow-black/40 hover:border-emerald-700/60 transition"
                    >
                      <div className="flex justify-between items-start border-b border-neutral-800 pb-2.5">
                        <div>
                          <span className="font-mono font-extrabold text-white text-base">
                            #{ticket.id.slice(0, 8)}
                          </span>
                          <span className="block text-[10px] text-emerald-400 font-mono mt-0.5">
                            Ready at {ticket.ready_at ? new Date(ticket.ready_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                          </span>
                        </div>

                        <span className="bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs font-extrabold px-2.5 py-1 rounded-lg">
                          READY
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {ticket.items.map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            <span className="bg-emerald-950/60 border border-emerald-800/60 font-mono text-emerald-300 text-xs font-bold px-2 py-0.5 rounded">
                              {item.quantity}x
                            </span>
                            <span className="text-sm font-semibold text-white">
                              {item.item_name}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleUpdateStatus(ticket.id, 'IN_PREP')}
                          className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs font-bold transition cursor-pointer"
                          title="Revert to Prep"
                        >
                          ↶
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(ticket.id, 'SERVED')}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-extrabold tracking-wider uppercase transition shadow-md shadow-emerald-950/40 cursor-pointer"
                        >
                          🚀 Serve & Complete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* RECIPE SPECIFICATIONS MODAL */}
      {inspectDish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  Kitchen Prep Specs
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">{inspectDish.name}</h3>
              </div>
              <button
                onClick={() => setInspectDish(null)}
                className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Ingredients per Serving:
              </h4>

              {loadingBom ? (
                <p className="text-xs text-neutral-500 py-4 text-center">Loading recipe BOM...</p>
              ) : bomSpecs.length === 0 ? (
                <p className="text-xs text-neutral-500 py-4 text-center">
                  No recipe BOM mapped for this dish yet.
                </p>
              ) : (
                <div className="border border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-800/70">
                  {bomSpecs.map((spec, idx) => (
                    <div key={idx} className="p-2.5 flex justify-between items-center text-xs bg-neutral-950/40">
                      <span className="text-white font-medium">{spec.inventory_item.name}</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {spec.quantity_required} {spec.inventory_item.unit_of_measure}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setInspectDish(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white rounded-xl transition cursor-pointer"
              >
                Close Specs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}