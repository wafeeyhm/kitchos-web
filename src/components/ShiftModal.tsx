'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';

export interface CashShift {
  id: string;
  opened_at: string;
  closed_at: string | null;
  status: 'OPEN' | 'CLOSED';
  cashier_name: string;
  opening_float: number;
  counted_cash: number | null;
  expected_cash: number | null;
  cash_variance: number | null;
  total_sales: number;
  total_cash: number;
  total_card: number;
  total_qr: number;
  order_count: number;
  notes: string | null;
}

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeShift: CashShift | null;
  onShiftUpdated: (shift: CashShift | null) => void;
}

export default function ShiftModal({
  isOpen,
  onClose,
  activeShift,
  onShiftUpdated,
}: ShiftModalProps) {
  const supabase = createClient();

  // Open Shift Form State
  const [openingFloat, setOpeningFloat] = useState<string>('100.00');
  const [cashierName, setCashierName] = useState<string>('Main Register');
  const [isOpening, setIsOpening] = useState(false);

  // Close Shift & Reconciliation State
  const [countedCash, setCountedCash] = useState<string>('');
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [isClosing, setIsClosing] = useState(false);
  const [loadingShiftSales, setLoadingShiftSales] = useState(false);

  // Live aggregated sales for the active shift
  const [shiftSales, setShiftSales] = useState({
    totalSales: 0,
    totalCash: 0,
    totalCard: 0,
    totalQr: 0,
    orderCount: 0,
  });

  // Fetch sales records that occurred during this shift
  const fetchShiftMetrics = useCallback(async () => {
    if (!activeShift) return;
    setLoadingShiftSales(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('total_amount, payment_method, created_at')
        .gte('created_at', activeShift.opened_at);

      if (error) throw error;

      let totalSales = 0;
      let totalCash = 0;
      let totalCard = 0;
      let totalQr = 0;

      (data || []).forEach((sale: any) => {
        const amount = Number(sale.total_amount) || 0;
        totalSales += amount;
        const method = (sale.payment_method || '').toLowerCase();
        if (method === 'cash') totalCash += amount;
        else if (method === 'card') totalCard += amount;
        else if (method === 'qr' || method === 'ewallet') totalQr += amount;
      });

      setShiftSales({
        totalSales,
        totalCash,
        totalCard,
        totalQr,
        orderCount: data ? data.length : 0,
      });
    } catch (err: any) {
      console.error('Error fetching shift metrics:', err.message);
    } finally {
      setLoadingShiftSales(false);
    }
  }, [activeShift, supabase]);

  useEffect(() => {
    if (isOpen && activeShift) {
      fetchShiftMetrics();
      setCountedCash('');
      setCloseNotes('');
    }
  }, [isOpen, activeShift, fetchShiftMetrics]);

  // Expected Cash calculation: Opening Float + Cash Sales
  const expectedCash = useMemo(() => {
    if (!activeShift) return 0;
    return Number(activeShift.opening_float || 0) + shiftSales.totalCash;
  }, [activeShift, shiftSales.totalCash]);

  // Over / Short variance
  const cashVariance = useMemo(() => {
    const counted = parseFloat(countedCash);
    if (isNaN(counted)) return 0;
    return counted - expectedCash;
  }, [countedCash, expectedCash]);

  // Handle: Start Shift
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const floatAmount = parseFloat(openingFloat);
    if (isNaN(floatAmount) || floatAmount < 0) return;

    setIsOpening(true);
    try {
      const { data, error } = await supabase
        .from('cash_shifts')
        .insert({
          opening_float: floatAmount,
          cashier_name: cashierName.trim() || 'Register',
          status: 'OPEN',
          opened_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      onShiftUpdated(data);
      onClose();
    } catch (err: any) {
      alert(`Failed to open shift: ${err.message}`);
    } finally {
      setIsOpening(false);
    }
  };

  // Handle: Finalize Reconciliation and Close Shift
  const handleCloseShift = async () => {
    if (!activeShift) return;

    const counted = parseFloat(countedCash);
    if (isNaN(counted) || counted < 0) {
      alert('Please enter a valid physical cash count before closing.');
      return;
    }

    setIsClosing(true);
    try {
      const { data, error } = await supabase
        .from('cash_shifts')
        .update({
          status: 'CLOSED',
          closed_at: new Date().toISOString(),
          counted_cash: counted,
          expected_cash: expectedCash,
          cash_variance: cashVariance,
          total_sales: shiftSales.totalSales,
          total_cash: shiftSales.totalCash,
          total_card: shiftSales.totalCard,
          total_qr: shiftSales.totalQr,
          order_count: shiftSales.orderCount,
          notes: closeNotes.trim() || null,
        })
        .eq('id', activeShift.id)
        .select()
        .single();

      if (error) throw error;

      onShiftUpdated(null);
      onClose();
    } catch (err: any) {
      alert(`Failed to close shift: ${err.message}`);
    } finally {
      setIsClosing(false);
    }
  };

  // Print Thermal Z-Report Slip
  const handlePrintSlip = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      {/* Modal Container */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 print:shadow-none print:border-none print:m-0 print:p-0">
        
        {/* NO ACTIVE SHIFT: Open Register Workflow */}
        {!activeShift ? (
          <div>
            <div className="border-b border-neutral-800 pb-3 mb-4">
              <h2 className="text-xl font-bold text-white">Open Cash Register Shift</h2>
              <p className="text-xs text-neutral-400 mt-1">
                Set your opening drawer float to begin tracking cash reconciliation.
              </p>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Cashier / Register Station
                </label>
                <input
                  type="text"
                  required
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Opening Float Cash Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  autoFocus
                  placeholder="100.00"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-base font-mono font-bold text-emerald-400 focus:outline-none"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Total starting cash bills and coins placed in the till drawer.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800/60 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isOpening}
                  className="px-5 py-2 text-xs font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isOpening ? 'Starting Shift...' : 'Open Register'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* ACTIVE SHIFT: End of Day Reconciliation & Thermal Z-Report View */
          <div className="space-y-4">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-3 print:hidden">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="text-lg font-bold text-white">Shift Reconciliation & Z-Report</h2>
                </div>
                <p className="text-xs text-neutral-400 font-mono mt-0.5">
                  Opened: {new Date(activeShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Station: {activeShift.cashier_name}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-neutral-400 hover:text-white text-sm font-bold px-2 py-1 rounded hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>

            {/* Printable Thermal Slip Section */}
            <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-neutral-300 space-y-2.5 print:border-none print:p-0 print:text-black">
              <div className="text-center pb-2 border-b border-dashed border-neutral-700">
                <h3 className="font-extrabold text-sm text-white tracking-widest uppercase print:text-black">
                  *** Z - REPORT ***
                </h3>
                <p className="text-[10px] text-neutral-400 print:text-neutral-700">KITCHOS POS TERMINAL</p>
                <p className="text-[10px] text-neutral-400 print:text-neutral-700">
                  {new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>

              {/* Sales Summary */}
              <div className="space-y-1">
                <div className="flex justify-between text-neutral-400 print:text-neutral-700 text-[11px]">
                  <span>Total Orders:</span>
                  <span className="text-white font-bold print:text-black">{shiftSales.orderCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Gross Sales:</span>
                  <span className="text-white font-bold print:text-black">${shiftSales.totalSales.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-neutral-800 my-1.5" />

              {/* Payment Methods */}
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>• Cash Sales:</span>
                  <span className="font-bold text-white print:text-black">${shiftSales.totalCash.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>• Card Sales:</span>
                  <span>${shiftSales.totalCard.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>• QR / e-Wallet:</span>
                  <span>${shiftSales.totalQr.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-neutral-800 my-1.5" />

              {/* Till Balancing Calculation */}
              <div className="space-y-1">
                <div className="flex justify-between text-neutral-400 print:text-neutral-700">
                  <span>Opening Float:</span>
                  <span>${Number(activeShift.opening_float).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-neutral-400 print:text-neutral-700">
                  <span>+ Cash Collected:</span>
                  <span>${shiftSales.totalCash.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-white print:text-black pt-1 border-t border-neutral-900">
                  <span>= Expected in Till:</span>
                  <span>${expectedCash.toFixed(2)}</span>
                </div>
              </div>

              {/* Reconciliation Input (Hidden during print) */}
              <div className="pt-2 print:hidden">
                <label className="block text-[11px] font-sans font-bold text-neutral-300 mb-1">
                  Physical Cash Counted ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  placeholder="0.00"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-base font-mono font-bold text-white focus:outline-none"
                />
              </div>

              {/* Variance Indicator */}
              {countedCash !== '' && !isNaN(parseFloat(countedCash)) && (
                <div
                  className={`p-2.5 rounded-lg border flex justify-between items-center text-xs font-bold ${
                    Math.abs(cashVariance) < 0.01
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                      : cashVariance > 0
                      ? 'bg-blue-950/40 border-blue-800 text-blue-400'
                      : 'bg-rose-950/40 border-rose-800 text-rose-400'
                  }`}
                >
                  <span>
                    Drawer Variance:{' '}
                    {Math.abs(cashVariance) < 0.01
                      ? '(Balanced)'
                      : cashVariance > 0
                      ? '(Over)'
                      : '(Short)'}
                  </span>
                  <span className="font-mono">
                    {cashVariance > 0 ? `+$${cashVariance.toFixed(2)}` : `$${cashVariance.toFixed(2)}`}
                  </span>
                </div>
              )}
            </div>

            {/* Shift Close Notes */}
            <div className="print:hidden">
              <input
                type="text"
                placeholder="Optional closeout notes (e.g. rounded change difference)"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-700"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-2 border-t border-neutral-800 print:hidden">
              <button
                type="button"
                onClick={handlePrintSlip}
                className="px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <span>🖨️</span>
                <span>Print Z-Report</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 rounded-lg border border-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isClosing || countedCash === ''}
                  onClick={handleCloseShift}
                  className="px-4 py-2 text-xs font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isClosing ? 'Closing...' : 'Close Shift'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}