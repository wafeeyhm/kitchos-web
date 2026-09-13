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
  display_order: number;
  config: {
    networks?: string[];
    providers?: QrProvider[];
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

  // QR Provider Form State
  const [newQrName, setNewQrName] = useState('');
  const [newQrUrl, setNewQrUrl] = useState('');
  const [newQrInstructions, setNewQrInstructions] = useState('');
  const [newQrMerchantId, setNewQrMerchantId] = useState('');

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

  // Add Bank
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

  // Remove Bank
  const handleRemoveBank = (transferMethod: PaymentMethod, index: number) => {
    const currentBanks = transferMethod.config.banks || [];
    const updatedBanks = currentBanks.filter((_, i) => i !== index);
    handleUpdateConfig(transferMethod.id, { ...transferMethod.config, banks: updatedBanks });
  };

  // Add QR Provider
  const handleAddQrProvider = (qrMethod: PaymentMethod) => {
    if (!newQrName.trim()) return;

    const current = qrMethod.config.providers || [];
    const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
      newQrName.trim()
    )}-PAY`;

    const updated = [
      ...current,
      {
        name: newQrName.trim(),
        qr_image_url: newQrUrl.trim() || fallbackUrl,
        instructions: newQrInstructions.trim() || `Scan with ${newQrName.trim()} app`,
        merchant_id: newQrMerchantId.trim() || undefined,
      },
    ];

    handleUpdateConfig(qrMethod.id, { ...qrMethod.config, providers: updated });
    setNewQrName('');
    setNewQrUrl('');
    setNewQrInstructions('');
    setNewQrMerchantId('');
  };

  // Remove QR Provider
  const handleRemoveQrProvider = (qrMethod: PaymentMethod, index: number) => {
    const current = qrMethod.config.providers || [];
    const updated = current.filter((_, i) => i !== index);
    handleUpdateConfig(qrMethod.id, { ...qrMethod.config, providers: updated });
  };

  const transferMethod = methods.find((m) => m.code === 'TRANSFER');
  const cardMethod = methods.find((m) => m.code === 'CARD');
  const qrMethod = methods.find((m) => m.code === 'QR');
  const cashMethod = methods.find((m) => m.code === 'CASH');

  return (
    <ManagerGuard
      pageTitle="Payment Channels Management"
      description="Configuring merchant payment channels, QR providers, and bank accounts requires Manager authorization."
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
              Configure multi-provider QR codes (BIBD QuickPay, Baiduri Qpay, TAIB, Pocket, Ding!), card networks, and bank transfer routing.
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
                        <p className="text-xs text-neutral-400">Physical drawer register checkout</p>
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
                    <p>• Calculates change due with fast cash denomination shortcuts ($5, $10, $20, $50).</p>
                    <p>• Automatically records cashier floating and drawer reconciliations in Shift reports.</p>
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
                        <h3 className="font-bold text-white text-base">Card Processing (EDC)</h3>
                        <p className="text-xs text-neutral-400">Requires Terminal Approval / Trace Code</p>
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

              {/* 3. MULTI-PROVIDER BRUNEI QR CODES */}
              {qrMethod && (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-6 space-y-4 lg:col-span-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📱</span>
                      <div>
                        <h3 className="font-bold text-white text-base">
                          Multi-Provider QR Payments (Brunei)
                        </h3>
                        <p className="text-xs text-neutral-400">
                          BIBD QuickPay, Baiduri Qpay, TAIB, Pocket, Progresif Ding!
                        </p>
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

                  {/* Registered QR Providers List */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                      Active QR Merchant Codes (Cashier & Customer Display):
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {(qrMethod.config.providers || []).map((p, idx) => (
                        <div
                          key={idx}
                          className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex gap-3 items-center justify-between"
                        >
                          <div className="w-12 h-12 bg-white rounded-lg p-1 flex-shrink-0 flex items-center justify-center">
                            <img
                              src={p.qr_image_url}
                              alt={p.name}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-xs text-white truncate">{p.name}</h4>
                            <p className="text-[10px] text-neutral-400 truncate">
                              {p.merchant_id || 'Static QR'}
                            </p>
                            <p className="text-[9px] text-neutral-500 truncate">{p.instructions}</p>
                          </div>
                          <button
                            onClick={() => handleRemoveQrProvider(qrMethod, idx)}
                            className="text-neutral-500 hover:text-rose-400 text-xs px-2 py-1 transition cursor-pointer"
                            title="Remove QR code"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add QR Provider Form */}
                  <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3">
                    <span className="text-[10px] uppercase font-bold text-emerald-400">
                      + Add New QR Payment Provider / Custom QR
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                      <input
                        type="text"
                        placeholder="Provider Name (e.g. BIBD QuickPay)"
                        value={newQrName}
                        onChange={(e) => setNewQrName(e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white"
                      />
                      <input
                        type="text"
                        placeholder="Merchant ID (optional)"
                        value={newQrMerchantId}
                        onChange={(e) => setNewQrMerchantId(e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                      />
                      <input
                        type="text"
                        placeholder="QR Image URL (leave blank for generator)"
                        value={newQrUrl}
                        onChange={(e) => setNewQrUrl(e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono text-[11px]"
                      />
                      <input
                        type="text"
                        placeholder="Customer Instructions"
                        value={newQrInstructions}
                        onChange={(e) => setNewQrInstructions(e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>

                    <div className="flex justify-between items-center pt-1">
                      <div className="flex gap-2">
                        {['BIBD QuickPay', 'Baiduri Qpay', 'TAIB', 'Pocket', 'Ding!'].map(
                          (preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setNewQrName(preset);
                                setNewQrInstructions(`Scan with ${preset} mobile app`);
                              }}
                              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[10px] text-neutral-400 hover:text-white px-2 py-1 rounded-lg transition cursor-pointer"
                            >
                              + {preset}
                            </button>
                          )
                        )}
                      </div>

                      <button
                        onClick={() => handleAddQrProvider(qrMethod)}
                        disabled={isSaving || !newQrName.trim()}
                        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-neutral-950 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                      >
                        Add QR Provider
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. BANK TRANSFER CHANNEL */}
              {transferMethod && (
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-6 space-y-4 lg:col-span-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🏦</span>
                      <div>
                        <h3 className="font-bold text-white text-base">Direct Bank Wire / Transfer</h3>
                        <p className="text-xs text-neutral-400">
                          BIBD, Baiduri Bank, TAIB accounts with copyable IBAN / Account #
                        </p>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(transferMethod.config.banks || []).map((bank, idx) => (
                      <div
                        key={idx}
                        className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex justify-between items-center text-xs"
                      >
                        <div>
                          <span className="font-bold text-white">{bank.name}</span>
                          <p className="font-mono text-emerald-400 text-[11px] mt-0.5">
                            #{bank.account_number}
                          </p>
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

                  {/* Add Bank Form */}
                  <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-2.5">
                    <span className="text-[10px] uppercase font-bold text-emerald-400">
                      + Add Target Bank Account
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <input
                        type="text"
                        placeholder="Bank Name (e.g. BIBD, Baiduri)"
                        value={newBankName}
                        onChange={(e) => setNewBankName(e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white"
                      />
                      <input
                        type="text"
                        placeholder="Account Number (e.g. 00-001-01-123456-7)"
                        value={newAccountNumber}
                        onChange={(e) => setNewAccountNumber(e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Account Holder Name (e.g. KitchOS Cafe)"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => handleAddBank(transferMethod)}
                        disabled={isSaving || !newBankName.trim() || !newAccountNumber.trim()}
                        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-neutral-950 text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
                      >
                        Add Bank Account
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