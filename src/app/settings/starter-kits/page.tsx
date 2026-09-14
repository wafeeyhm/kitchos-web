'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';
import { createClient } from '@/utils/supabase/client';
import { useBranch } from '@/context/BranchContext';
import { STARTER_KITS, StarterKitInfo } from '@/data/starterKits';

export default function StarterKitsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { refreshBranches } = useBranch();

  const [selectedKit, setSelectedKit] = useState<StarterKitInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [managerPin, setManagerPin] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleOpenModal = (kit: StarterKitInfo) => {
    setSelectedKit(kit);
    setManagerPin('');
    setConfirmText('');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleApplyKit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKit) return;

    if (confirmText.trim().toUpperCase() !== 'RESET') {
      setErrorMsg('Please type RESET in capital letters to confirm database wipe.');
      return;
    }

    if (managerPin.trim() !== '9999') {
      setErrorMsg('Invalid Manager PIN. You must enter 9999 to authorize this reset.');
      return;
    }

    setIsSeeding(true);
    setErrorMsg(null);

    try {
      // Execute the Master Seeding RPC
      const { data, error } = await supabase.rpc('apply_starter_kit', {
        p_kit_type: selectedKit.id,
        p_manager_pin: managerPin.trim(),
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'Failed to seed starter kit.');

      // Clear cached client state so fresh staff & branch hydrate immediately
      if (typeof window !== 'undefined') {
        localStorage.removeItem('kitchos_active_staff');
        localStorage.removeItem('kitchos_active_branch_id');
        localStorage.removeItem('kitchos_terminal_locked');
      }

      await refreshBranches();

      // Trigger staff & lock updates
      window.dispatchEvent(new Event('kitchos_staff_changed'));

      setIsModalOpen(false);
      router.push('/pos');
    } catch (err: any) {
      setErrorMsg(err.message || 'Seeding failed.');
      setIsSeeding(false);
    }
  };

  return (
    <ManagerGuard
      pageTitle="Industry Starter Kits & Data Reset"
      description="Applying starter kits resets the database and seeds fresh industry presets. This operation requires Manager authorization."
    >
      <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 bg-rose-950/60 border border-rose-800/50 px-2 py-0.5 rounded-md">
                  Sandbox & Seeding Engine
                </span>
                <span className="text-xs text-neutral-400 font-mono">Clean Baseline</span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight mt-1">
                Industry Starter Kits & Data Reset
              </h1>
              <p className="text-xs text-neutral-400 mt-0.5">
                Truncate existing test data and launch a clean store blueprint configured with recipes, stock, branches, staff, and menus.
              </p>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-900/60 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="text-xs space-y-1">
              <span className="font-bold text-rose-300 block">
                Destructive Operation Notice: Complete Database Truncation
              </span>
              <p className="text-neutral-400 leading-relaxed">
                Applying an industry starter kit will <strong className="text-white">completely wipe all existing sales, drawer shifts, products, inventory, and branches</strong>, 
                re-provisioning the system with a calibrated business profile. Only proceed if you want a clean start.
              </p>
            </div>
          </div>

          {/* 4 Vertical Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {STARTER_KITS.map((kit) => (
              <div
                key={kit.id}
                className="bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 rounded-3xl p-6 flex flex-col justify-between space-y-6 transition shadow-xl backdrop-blur-sm group"
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform">
                        {kit.icon}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                          {kit.badge}
                        </span>
                        <h2 className="text-lg font-black text-white">{kit.title}</h2>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-300 font-medium">{kit.tagline}</p>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">{kit.description}</p>

                  {/* Operational Details */}
                  <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800/80 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-500 font-mono text-[11px]">Default Outlet:</span>
                      <span className="font-bold text-white text-[11px]">{kit.branchName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500 font-mono text-[11px]">Staff Seeded:</span>
                      <span className="font-mono text-emerald-400 text-[11px]">
                        {kit.managerName} • {kit.cashierName}
                      </span>
                    </div>
                  </div>

                  {/* Sample Menu Items Preview */}
                  <div>
                    <span className="text-[10px] font-bold uppercase text-neutral-400 tracking-wider block mb-2">
                      Sample Catalog & Pricing:
                    </span>
                    <div className="space-y-1">
                      {kit.sampleProducts.map((p, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center text-xs py-1 border-b border-neutral-800/40 last:border-none"
                        >
                          <span className="text-neutral-200 font-medium">{p.name}</span>
                          <span className="font-mono font-bold text-emerald-400">
                            ${p.price.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inventory Highlights */}
                  <div>
                    <span className="text-[10px] font-bold uppercase text-neutral-400 tracking-wider block mb-1.5">
                      Inventory & BOM Elements:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {kit.inventoryHighlights.map((inv, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-neutral-950 border border-neutral-800 text-neutral-300"
                        >
                          {inv}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-800">
                  <button
                    onClick={() => handleOpenModal(kit)}
                    className="w-full py-3 rounded-2xl bg-neutral-800 hover:bg-emerald-500 hover:text-neutral-950 text-white font-extrabold text-xs tracking-wider uppercase transition cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                  >
                    <span>Reset Database & Seed {kit.title}</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* SAFETY CONFIRMATION MODAL */}
          {isModalOpen && selectedKit && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
              <div className="bg-neutral-900 border border-rose-900/60 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
                <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 block">
                      Confirm Database Reset
                    </span>
                    <h3 className="text-lg font-black text-white mt-0.5">
                      Seed: {selectedKit.title}
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-2">
                    <p className="text-neutral-300">This action will perform the following:</p>
                    <ul className="list-disc list-inside text-neutral-400 space-y-1 font-mono text-[11px]">
                      <li>Wipe all existing sales records and drawer shifts</li>
                      <li>Delete all existing menu items and recipe links</li>
                      <li>Delete all inventory stock items and vendors</li>
                      <li>Seed <strong>{selectedKit.branchName}</strong></li>
                      <li>Create Manager (PIN: <strong>9999</strong>) and Cashier (PIN: <strong>1234</strong>)</li>
                    </ul>
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">
                      Type <strong className="text-rose-400">RESET</strong> to confirm truncation *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="RESET"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 font-mono text-center tracking-widest text-sm text-white uppercase focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">
                      Enter Manager PIN (Default: 9999) *
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      required
                      placeholder="••••"
                      value={managerPin}
                      onChange={(e) => setManagerPin(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 font-mono text-center tracking-widest text-base text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 bg-rose-950/60 border border-rose-900 text-rose-300 rounded-xl text-xs">
                      {errorMsg}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-neutral-800">
                    <button
                      type="button"
                      disabled={isSeeding}
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-semibold text-white transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={
                        isSeeding ||
                        confirmText.trim().toUpperCase() !== 'RESET' ||
                        managerPin.length !== 4
                      }
                      onClick={handleApplyKit}
                      className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-lg shadow-rose-950/60"
                    >
                      {isSeeding ? 'Wiping & Seeding...' : 'Confirm Full Reset'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ManagerGuard>
  );
}