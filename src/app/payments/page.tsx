'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';

interface BankAccount {
  name: string;
  account_name: string;
  account_number: string;
}

interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  is_enabled: boolean;
  display_order: number;
  config: {
    allow_quick_cash?: boolean;
    networks?: string[];
    qr_title?: string;
    qr_image_url?: string;
    instructions?: string;
    banks?: BankAccount[];
  };
}

export default function PaymentSettingsPage() {
  const supabase = createClient();

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Bank Form State
  const [newBankName, setNewBankName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');

  const fetchMethods = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setMethods((data as any) || []);
    } catch (err: any) {
      console.error('Error loading payment channels:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods]);

  const handleToggleEnabled = async (method: PaymentMethod) => {
    try {
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_enabled: !method.is_enabled, updated_at: new Date().toISOString() })
        .eq('id', method.id);

      if (error) throw error;
      fetchMethods();
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  const handleUpdateConfig = async (methodId: string, newConfig: any) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('payment_methods')
        .update({ config: newConfig, updated_at: new Date().toISOString() })
        .eq('id', methodId);

      if (error) throw error;
      fetchMethods();
    } catch (err: any) {
      alert(`Failed to save configuration: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Card Network Toggles
  const handleToggleCardNetwork = (method: PaymentMethod, network: string) => {
    const current = method.config.networks || [];
    const updated = current.includes(network)
      ? current.filter((n) => n !== network)
      : [...current, network];

    handleUpdateConfig(method.id, { ...method.config, networks: updated });
  };

  // Add Bank Account
  const handleAddBank = (transferMethod: PaymentMethod) => {
    if (!newBankName.trim() || !newAccountNumber.trim()) return;

    const currentBanks = transferMethod.config.banks || [];
    const updatedBanks = [
      ...currentBanks,
      {
        name: newBankName.trim(),
        account_name: newAccountName.trim() || 'Store Account',
        account_number: newAccountNumber.trim(),
      },
    ];

    handleUpdateConfig(transferMethod.id, { ...transferMethod.config, banks: updatedBanks });
    setNewBankName('');
    setNewAccountName('');
    setNewAccountNumber('');
  };

  // Remove Bank Account
  const handleRemoveBank = (transferMethod: PaymentMethod, index: number) => {
    const currentBanks = transferMethod.config.banks || [];
    const updatedBanks = currentBanks.filter((_, i) => i !== index);
    handleUpdateConfig(transferMethod.id, { ...transferMethod.config, banks: updatedBanks });
  };

  const transferMethod = methods.find((m) => m.code === 'TRANSFER');
  const cardMethod = methods.find((m) => m.code === 'CARD');
  const qrMethod = methods.find((m) => m.code === 'QR');
  const cashMethod = methods.find((m) => m.code === 'CASH');

  return (
    <ManagerGuard
      pageTitle="Payment Channels Management"
      description="Configuring merchant tender methods, bank accounts, and merchant QR codes requires Manager authorization."
    >
      <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950">
          <div className="border-b border-neutral-800 pb-5">
            <h1 className="text-2xl font-black text-white tracking-tight">
              Payment Channels & Tenders
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              Configure available POS checkout payment methods, banking account details, QR displays, and accepted cards.
            </p>
          </div>

          {loading ? (
            <p className="text-xs text-neutral-500 text-center py-12">Loading payment channels...</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. CASH CHANNEL */}
              {cashMethod && (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">💵</span>
                      <div>
                        <h3 className="font-bold text-white text-base">Cash Tender</h3>
                        <p className="text-xs text-neutral-400">Physical register drawer checkout</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleEnabled(cashMethod)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                        cashMethod.is_enabled
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {cashMethod.is_enabled ? '● Active' : '○ Disabled'}
                    </button>
                  </div>
                  <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-400 space-y-1">
                    <p>• Automatically calculates change due and provides fast cash float denomination buttons.</p>
                    <p>• Triggers physical cash drawer kick upon ticket completion.</p>
                  </div>
                </div>
              )}

              {/* 2. CARD TERMINAL CHANNEL */}
              {cardMethod && (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">💳</span>
                      <div>
                        <h3 className="font-bold text-white text-base">Card Processing</h3>
                        <p className="text-xs text-neutral-400">Integrated & external EDC readers</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleEnabled(cardMethod)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                        cardMethod.is_enabled
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {cardMethod.is_enabled ? '● Active' : '○ Disabled'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                      Accepted Card Networks:
                    </span>
                    <div className="flex gap-2">
                      {['VISA', 'MASTERCARD', 'AMEX', 'DEBIT'].map((network) => {
                        const isSelected = (cardMethod.config.networks || []).includes(network);
                        return (
                          <button
                            key={network}
                            onClick={() => handleToggleCardNetwork(cardMethod, network)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow'
                                : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white'
                            }`}
                          >
                            {network}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. QR CODE / E-WALLET CHANNEL */}
              {qrMethod && (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📱</span>
                      <div>
                        <h3 className="font-bold text-white text-base">QR / E-Wallet</h3>
                        <p className="text-xs text-neutral-400">Dynamic or static merchant QR code</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleEnabled(qrMethod)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                        qrMethod.is_enabled
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {qrMethod.is_enabled ? '● Active' : '○ Disabled'}
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-neutral-300 font-medium mb-1">
                        Merchant QR Code Image URL
                      </label>
                      <input
                        type="text"
                        value={qrMethod.config.qr_image_url || ''}
                        onChange={(e) =>
                          handleUpdateConfig(qrMethod.id, {
                            ...qrMethod.config,
                            qr_image_url: e.target.value,
                          })
                        }
                        placeholder="https://... image link or data URL"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono text-[11px]"
                      />
                    </div>

                    <div>
                      <label className="block text-neutral-300 font-medium mb-1">
                        Customer Instructions Prompt
                      </label>
                      <input
                        type="text"
                        value={qrMethod.config.instructions || ''}
                        onChange={(e) =>
                          handleUpdateConfig(qrMethod.id, {
                            ...qrMethod.config,
                            instructions: e.target.value,
                          })
                        }
                        placeholder="Scan with your banking app or digital wallet"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 4. BANK TRANSFER CHANNEL */}
              {transferMethod && (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🏦</span>
                      <div>
                        <h3 className="font-bold text-white text-base">Bank Transfer</h3>
                        <p className="text-xs text-neutral-400">Direct instant bank wire / EFT</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleEnabled(transferMethod)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                        transferMethod.is_enabled
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {transferMethod.is_enabled ? '● Active' : '○ Disabled'}
                    </button>
                  </div>

                  {/* Registered Banks List */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                      Configured Bank Accounts:
                    </span>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {(transferMethod.config.banks || []).map((bank, idx) => (
                        <div
                          key={idx}
                          className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex justify-between items-center text-xs"
                        >
                          <div>
                            <span className="font-bold text-white">{bank.name}</span>
                            <span className="text-neutral-500 font-mono ml-2">
                              #{bank.account_number}
                            </span>
                            <p className="text-[10px] text-neutral-400">Name: {bank.account_name}</p>
                          </div>
                          <button
                            onClick={() => handleRemoveBank(transferMethod, idx)}
                            className="text-neutral-500 hover:text-rose-400 text-xs px-2 py-1 transition cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add Bank Form */}
                  <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2.5">
                    <span className="text-[10px] uppercase font-bold text-emerald-400">
                      + Add Target Bank Account
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <input
                        type="text"
                        placeholder="Bank Name (e.g. BIBD, Baiduri)"
                        value={newBankName}
                        onChange={(e) => setNewBankName(e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-white"
                      />
                      <input
                        type="text"
                        placeholder="Account Number"
                        value={newAccountNumber}
                        onChange={(e) => setNewAccountNumber(e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Account Holder Name (e.g. KitchOS Cafe)"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                      <button
                        onClick={() => handleAddBank(transferMethod)}
                        disabled={isSaving || !newBankName || !newAccountNumber}
                        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-neutral-950 text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </ManagerGuard>
  );
}