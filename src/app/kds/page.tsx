'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import { useWakeLock } from '@/hooks/useWakeLock';
import NetworkStatus from '@/components/NetworkStatus';
import { useBranch } from '@/context/BranchContext';

interface SaleItem {
  id: string;
  item_name: string;
  quantity: number;
  is_prepared: boolean;
  modifiers?: { name: string; price: number }[];
  notes?: string | null;
  product?: {
    category: string;
  } | null;
}

interface KitchenTicket {
  id: string;
  created_at: string;
  branch_id?: string | null;
  order_type: 'DINE_IN' | 'TAKEAWAY';
  kds_status: 'QUEUED' | 'IN_PREP' | 'READY' | 'SERVED';
  is_rush: boolean;
  notes?: string | null;
  staff?: {
    name: string;
  } | null;
  sale_items: SaleItem[];
}

type StationFilter = 'ALL' | 'KITCHEN' | 'BARISTA';

// Browser Web Audio API Chime (Synthesized sound without external mp3 files)
function playNewOrderChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc1.frequency.setValueAtTime(880.0, ctx.currentTime + 0.15); // A5

    osc2.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc2.frequency.setValueAtTime(880.0, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.6);
  } catch (e) {
    // Blocked until first user interaction on browser
  }
}

export default function KdsPage() {
  const supabase = createClient();
  const { currentBranch } = useBranch();
  useWakeLock(true); // Keep Kitchen Monitor Display Awake

  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [stationFilter, setStationFilter] = useState<StationFilter>('ALL');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [audioEnabled, setAudioEnabled] = useState(true);

  const knownTicketIds = useRef<Set<string>>(new Set());

  // 1. Fetch Active Kitchen Tickets (Scoped to Active Branch)
  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('sales')
        .select(`
          id,
          created_at,
          branch_id,
          order_type,
          kds_status,
          is_rush,
          notes,
          staff:staff_members(name),
          sale_items(
            id,
            item_name,
            quantity,
            is_prepared,
            modifiers,
            notes,
            product:products(category)
          )
        `)
        .in('kds_status', ['QUEUED', 'IN_PREP', 'READY'])
        .order('created_at', { ascending: true });

      if (currentBranch) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const formatted = (data as any) || [];

      // Detect incoming new tickets to trigger audio chime
      if (knownTicketIds.current.size > 0) {
        const hasNewTicket = formatted.some(
          (t: KitchenTicket) =>
            !knownTicketIds.current.has(t.id) &&
            (t.kds_status === 'QUEUED' || t.kds_status === 'IN_PREP')
        );
        if (hasNewTicket && audioEnabled) {
          playNewOrderChime();
        }
      }

      knownTicketIds.current = new Set(formatted.map((t: KitchenTicket) => t.id));
      setTickets(formatted);
    } catch (err: any) {
      console.error('Error loading kitchen tickets:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, currentBranch, audioEnabled]);

  // 2. Realtime Listener & Periodic Clock Update
  useEffect(() => {
    fetchTickets();

    const channel = supabase
      .channel(`realtime:kds-kanban-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        fetchTickets();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, () => {
        fetchTickets();
      })
      .subscribe();

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchTickets, supabase]);

  // 3. Toggle Individual Item Strikethrough
  const handleToggleItemPrepared = async (itemId: string, currentStatus: boolean) => {
    // Optimistic UI update
    setTickets((prev) =>
      prev.map((t) => ({
        ...t,
        sale_items: t.sale_items.map((i) =>
          i.id === itemId ? { ...i, is_prepared: !currentStatus } : i
        ),
      }))
    );

    try {
      const { error } = await supabase
        .from('sale_items')
        .update({ is_prepared: !currentStatus })
        .eq('id', itemId);

      if (error) throw error;
    } catch (err: any) {
      console.error('Failed to update item state:', err);
      fetchTickets();
    }
  };

  // 4. Update Ticket Workflow Kanban Stage
  const handleUpdateTicketStatus = async (
    ticketId: string,
    newStatus: KitchenTicket['kds_status']
  ) => {
    if (newStatus === 'SERVED') {
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    } else {
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, kds_status: newStatus } : t))
      );
    }

    try {
      const { error } = await supabase
        .from('sales')
        .update({ kds_status: newStatus })
        .eq('id', ticketId);

      if (error) throw error;
    } catch (err: any) {
      console.error('Failed to update ticket status:', err);
      fetchTickets();
    }
  };

  // Helper: Elapsed time and color escalation
  const getTicketAging = (createdAt: string) => {
    const elapsedMinutes = Math.floor((currentTime - new Date(createdAt).getTime()) / 60000);

    if (elapsedMinutes < 5) {
      return {
        minutes: elapsedMinutes,
        text: `${elapsedMinutes}m ago`,
        badgeClass: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60',
        cardBorder: 'border-neutral-800',
      };
    } else if (elapsedMinutes < 10) {
      return {
        minutes: elapsedMinutes,
        text: `⚠️ ${elapsedMinutes}m ago`,
        badgeClass: 'bg-amber-950/80 text-amber-400 border-amber-800/60 font-bold',
        cardBorder: 'border-amber-800/80',
      };
    } else {
      return {
        minutes: elapsedMinutes,
        text: `🔥 ${elapsedMinutes}m DELAYED`,
        badgeClass: 'bg-rose-950 text-rose-400 border-rose-800 font-black animate-pulse',
        cardBorder: 'border-rose-600 shadow-lg shadow-rose-950/60',
      };
    }
  };

  // Sort helper: Rush first, then oldest tickets first
  const sortTickets = (items: KitchenTicket[]) => {
    return [...items].sort((a, b) => {
      if (a.is_rush && !b.is_rush) return -1;
      if (!a.is_rush && b.is_rush) return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  };

  // Filter tickets by station
  const stationFilteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (stationFilter === 'ALL') return true;

      if (stationFilter === 'BARISTA') {
        return ticket.sale_items.some((item) => {
          const cat = item.product?.category?.toUpperCase() || '';
          return cat.includes('BEV') || cat.includes('COFFEE') || cat.includes('BAR');
        });
      }

      if (stationFilter === 'KITCHEN') {
        return ticket.sale_items.some((item) => {
          const cat = item.product?.category?.toUpperCase() || '';
          return !cat.includes('BEV') && !cat.includes('COFFEE') && !cat.includes('BAR');
        });
      }

      return true;
    });
  }, [tickets, stationFilter]);

  // Group tickets into 3 Kanban columns
  const queuedTickets = useMemo(
    () => sortTickets(stationFilteredTickets.filter((t) => t.kds_status === 'QUEUED')),
    [stationFilteredTickets]
  );

  const inPrepTickets = useMemo(
    () => sortTickets(stationFilteredTickets.filter((t) => t.kds_status === 'IN_PREP')),
    [stationFilteredTickets]
  );

  const readyTickets = useMemo(
    () => sortTickets(stationFilteredTickets.filter((t) => t.kds_status === 'READY')),
    [stationFilteredTickets]
  );

  // Render individual ticket card inside a column
  const renderTicketCard = (ticket: KitchenTicket) => {
    const aging = getTicketAging(ticket.created_at);
    const allItemsPrepped =
      ticket.sale_items.length > 0 && ticket.sale_items.every((item) => item.is_prepared);

    return (
      <div
        key={ticket.id}
        className={`bg-neutral-900/90 rounded-2xl border flex flex-col justify-between overflow-hidden shadow-xl transition-all ${
          ticket.is_rush
            ? 'border-rose-500 ring-2 ring-rose-500/40 shadow-rose-950/50'
            : aging.cardBorder
        }`}
      >
        {/* Ticket Header */}
        <div className="p-3.5 border-b border-neutral-800/80 bg-neutral-950/70 space-y-2">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-black text-white">
                #{ticket.id.slice(0, 8)}
              </span>

              {/* RUSH PRIORITY BADGE */}
              {ticket.is_rush && (
                <span className="bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md animate-pulse shadow-md shadow-rose-950">
                  🔥 RUSH
                </span>
              )}
            </div>

            {/* Timer Escalation Badge */}
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${aging.badgeClass}`}
            >
              {aging.text}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                ticket.order_type === 'TAKEAWAY'
                  ? 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                  : 'bg-neutral-800 text-neutral-300 border-neutral-700'
              }`}
            >
              {ticket.order_type === 'TAKEAWAY' ? '🛍️ Takeaway' : '🍽️ Dine-In'}
            </span>

            <span className="text-[10px] text-neutral-400 font-mono">
              Staff: {ticket.staff?.name || 'POS'}
            </span>
          </div>

          {/* Order Memo / Table Notes */}
          {ticket.notes && (
            <div className="p-1.5 bg-neutral-900 rounded-lg text-[10px] text-amber-300 font-mono truncate">
              💬 {ticket.notes}
            </div>
          )}
        </div>

        {/* Ticket Items with Interactive Strikethrough */}
        <div className="p-3.5 space-y-2 flex-1">
          {ticket.sale_items.map((item) => (
            <div
              key={item.id}
              onClick={() => handleToggleItemPrepared(item.id, item.is_prepared)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                item.is_prepared
                  ? 'bg-neutral-950/40 border-neutral-800/50 opacity-40'
                  : 'bg-neutral-950/80 hover:bg-neutral-800/80 border-neutral-800'
              }`}
              title="Tap item to mark prepared / strike-through"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span
                    className={`font-mono font-black text-xs px-1.5 py-0.5 rounded ${
                      item.is_prepared
                        ? 'bg-neutral-800 text-neutral-500 line-through'
                        : 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                    }`}
                  >
                    {item.quantity}x
                  </span>

                  <span
                    className={`text-xs font-bold leading-snug break-words ${
                      item.is_prepared ? 'line-through text-neutral-500' : 'text-white'
                    }`}
                  >
                    {item.item_name}
                  </span>
                </div>

                <span className="text-xs">{item.is_prepared ? '✅' : '⚪'}</span>
              </div>

              {/* Modifiers & Kitchen Instructions */}
              {(item.modifiers || item.notes) && (
                <div className="mt-1.5 pl-6 space-y-1 text-[10px] font-mono">
                  {item.modifiers?.map((m, idx) => (
                    <span
                      key={idx}
                      className={`inline-block mr-1.5 px-1.5 py-0.5 rounded border ${
                        item.is_prepared
                          ? 'bg-neutral-900 text-neutral-600 border-neutral-800 line-through'
                          : 'bg-amber-950/80 text-amber-300 border-amber-800/60 font-bold'
                      }`}
                    >
                      + {m.name}
                    </span>
                  ))}

                  {item.notes && (
                    <p
                      className={`italic ${
                        item.is_prepared
                          ? 'text-neutral-600 line-through'
                          : 'text-rose-400 font-semibold'
                      }`}
                    >
                      ⚠️ Note: "{item.notes}"
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Ticket Footer Actions */}
        <div className="p-3 border-t border-neutral-800/80 bg-neutral-950/70 space-y-2">
          {allItemsPrepped && (
            <div className="text-center text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 py-1 rounded-lg">
              ✓ All items prepared
            </div>
          )}

          <div className="flex gap-1.5">
            {ticket.kds_status === 'QUEUED' && (
              <button
                type="button"
                onClick={() => handleUpdateTicketStatus(ticket.id, 'IN_PREP')}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 transition cursor-pointer"
              >
                Start Prep →
              </button>
            )}

            {ticket.kds_status === 'IN_PREP' && (
              <>
                <button
                  type="button"
                  onClick={() => handleUpdateTicketStatus(ticket.id, 'QUEUED')}
                  className="px-2.5 py-2 rounded-xl text-xs font-bold text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 transition cursor-pointer"
                  title="Move back to Queue"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateTicketStatus(ticket.id, 'READY')}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 transition cursor-pointer"
                >
                  Mark Ready 🔔
                </button>
              </>
            )}

            {ticket.kds_status === 'READY' && (
              <>
                <button
                  type="button"
                  onClick={() => handleUpdateTicketStatus(ticket.id, 'IN_PREP')}
                  className="px-2.5 py-2 rounded-xl text-xs font-bold text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 transition cursor-pointer"
                  title="Move back to In Prep"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateTicketStatus(ticket.id, 'SERVED')}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-white transition cursor-pointer"
                >
                  Bump / Served ✓
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden select-none">
      <div className="h-full flex-shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 flex flex-col overflow-hidden bg-neutral-950">
        {/* KDS Header Bar */}
        <header className="h-16 px-6 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span>🍳</span>
              <span>Kitchen Display System</span>
            </h1>

            {/* Active Branch Pill */}
            {currentBranch && (
              <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-1 rounded-full">
                📍 {currentBranch.name}
              </span>
            )}

            <span className="bg-neutral-800 text-neutral-300 font-mono text-xs font-bold px-2.5 py-1 rounded-full border border-neutral-700">
              {stationFilteredTickets.length} Active Orders
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Station Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
              {(
                [
                  { id: 'ALL', label: 'All Stations' },
                  { id: 'KITCHEN', label: 'Hot Kitchen' },
                  { id: 'BARISTA', label: 'Barista Bar' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStationFilter(st.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    stationFilter === st.id
                      ? 'bg-emerald-500 text-neutral-950 shadow'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Audio Chime Toggle */}
            <button
              type="button"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-2 rounded-xl border text-xs transition cursor-pointer ${
                audioEnabled
                  ? 'bg-neutral-900 text-emerald-400 border-neutral-800'
                  : 'bg-neutral-900 text-neutral-500 border-neutral-800'
              }`}
              title={audioEnabled ? 'New Order Chime: On' : 'New Order Chime: Muted'}
            >
              {audioEnabled ? '🔔' : '🔕'}
            </button>

            <NetworkStatus />
          </div>
        </header>

        {/* 3-COLUMN KANBAN BOARD */}
        <div className="flex-1 overflow-hidden p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full text-neutral-500 text-xs">
              Loading active kitchen queue...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
              {/* COLUMN 1: QUEUED / INCOMING */}
              <section className="bg-neutral-900/40 border border-neutral-800/80 rounded-3xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-neutral-800 bg-neutral-950/60 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                    <h2 className="font-extrabold text-sm text-white uppercase tracking-wider">
                      Incoming / Queued
                    </h2>
                  </div>
                  <span className="font-mono text-xs font-bold bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full border border-neutral-700">
                    {queuedTickets.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {queuedTickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-600 text-xs">
                      <span>📥</span>
                      <span className="mt-1">No queued tickets</span>
                    </div>
                  ) : (
                    queuedTickets.map((t) => renderTicketCard(t))
                  )}
                </div>
              </section>

              {/* COLUMN 2: IN PREPARATION */}
              <section className="bg-neutral-900/40 border border-neutral-800/80 rounded-3xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-neutral-800 bg-neutral-950/60 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                    <h2 className="font-extrabold text-sm text-white uppercase tracking-wider">
                      In Preparation
                    </h2>
                  </div>
                  <span className="font-mono text-xs font-bold bg-amber-950/80 text-amber-400 px-2 py-0.5 rounded-full border border-amber-800/60">
                    {inPrepTickets.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {inPrepTickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-600 text-xs">
                      <span>🍳</span>
                      <span className="mt-1">No orders being cooked</span>
                    </div>
                  ) : (
                    inPrepTickets.map((t) => renderTicketCard(t))
                  )}
                </div>
              </section>

              {/* COLUMN 3: READY FOR DISPATCH */}
              <section className="bg-neutral-900/40 border border-neutral-800/80 rounded-3xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-neutral-800 bg-neutral-950/60 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <h2 className="font-extrabold text-sm text-white uppercase tracking-wider">
                      Ready for Dispatch
                    </h2>
                  </div>
                  <span className="font-mono text-xs font-bold bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-800/60">
                    {readyTickets.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {readyTickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-600 text-xs">
                      <span>🔔</span>
                      <span className="mt-1">No tickets waiting for pickup</span>
                    </div>
                  ) : (
                    readyTickets.map((t) => renderTicketCard(t))
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}