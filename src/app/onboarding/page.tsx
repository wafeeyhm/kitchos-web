'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { STARTER_KITS, StarterKitInfo } from '@/data/starterKits';

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  // Wizard Step State (1: Brand -> 2: Branch -> 3: Security PIN -> 4: Starter Kit -> 5: Launch)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form Fields State
  // Step 1: Brand & Identity
  const [orgName, setOrgName] = useState('Artisan Roast & Bakery');
  const [ownerName, setOwnerName] = useState('Hj Danial');
  const [ownerPhone, setOwnerPhone] = useState('+673 888 1234');
  const [currency, setCurrency] = useState('BND ($)');

  // Step 2: Primary Outlet
  const [branchName, setBranchName] = useState('Kiulap Flagship Outlet');
  const [branchCode, setBranchCode] = useState('KIULAP');
  const [branchAddress, setBranchAddress] = useState('Unit 4, Ground Floor, Regent Square, Kiulap');

  // Step 3: Master PIN
  const [ownerPin, setOwnerPin] = useState('9999');
  const [confirmPin, setConfirmPin] = useState('9999');

  // Step 4: Starter Kit
  const [selectedKit, setSelectedKit] = useState<StarterKitInfo>(STARTER_KITS[0]);

  // Loading & Error States
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisioningStatus, setProvisioningStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-generate uppercase Branch Code from branch name
  const handleBranchNameChange = (val: string) => {
    setBranchName(val);
    const words = val.trim().split(/\s+/);
    if (words.length > 0 && words[0].length >= 3) {
      setBranchCode(words[0].toUpperCase().slice(0, 8));
    }
  };

  // Step Nav Validation
  const handleNextStep = () => {
    setErrorMessage(null);

    if (currentStep === 1) {
      if (!orgName.trim() || !ownerName.trim()) {
        setErrorMessage('Please enter your business brand name and owner full name.');
        return;
      }
    } else if (currentStep === 2) {
      if (!branchName.trim() || !branchCode.trim()) {
        setErrorMessage('Please provide a name and unique code for your primary outlet.');
        return;
      }
    } else if (currentStep === 3) {
      if (ownerPin.length !== 4 || !/^\d+$/.test(ownerPin)) {
        setErrorMessage('Master Owner PIN must be exactly 4 digits.');
        return;
      }
      if (ownerPin !== confirmPin) {
        setErrorMessage('The confirmation PIN does not match. Please re-enter.');
        return;
      }
    }

    setCurrentStep((prev) => Math.min(5, prev + 1));
  };

  // Final Launch & Provisioning
  const handleLaunchKitchOS = async () => {
    setIsProvisioning(true);
    setErrorMessage(null);

    try {
      setProvisioningStatus('Initializing organization and store branches...');
      await new Promise((r) => setTimeout(r, 600));

      setProvisioningStatus(`Injecting ${selectedKit.title} catalog, recipes & inventory BOMs...`);
      const { data, error } = await supabase.rpc('complete_owner_onboarding', {
        p_kit_type: selectedKit.id,
        p_org_name: orgName.trim(),
        p_owner_name: ownerName.trim(),
        p_owner_pin: ownerPin.trim(),
        p_branch_name: branchName.trim(),
        p_branch_code: branchCode.trim().toUpperCase(),
        p_branch_address: branchAddress.trim() || null,
        p_branch_phone: ownerPhone.trim() || null,
        p_currency: currency,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'Provisioning failed.');

      setProvisioningStatus('Opening initial register cash drawer shift ($100.00)...');
      await new Promise((r) => setTimeout(r, 600));

      setProvisioningStatus('Authorizing session credentials and locking in permissions...');
      // Caching active owner and branch locally
      if (typeof window !== 'undefined') {
        const ownerStaffObj = {
          id: data.owner_id,
          name: data.owner_name,
          role: 'OWNER',
        };
        localStorage.setItem('kitchos_active_staff', JSON.stringify(ownerStaffObj));
        localStorage.setItem('kitchos_active_branch_id', data.branch_id);
        localStorage.removeItem('kitchos_terminal_locked');
      }

      setProvisioningStatus('Store ready! Launching your POS Terminal...');
      await new Promise((r) => setTimeout(r, 500));

      router.push('/pos');
    } catch (err: any) {
      console.error('Onboarding provisioning error:', err);
      setErrorMessage(err.message || 'Failed to complete onboarding.');
      setIsProvisioning(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-neutral-950 font-sans text-neutral-100 flex flex-col justify-between select-none">
      {/* Top Header */}
      <header className="h-20 border-b border-neutral-800/80 px-8 flex items-center justify-between bg-neutral-900/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center font-black text-neutral-950 text-base shadow-lg shadow-emerald-950/50">
            K
          </div>
          <div>
            <span className="font-extrabold text-white text-lg tracking-tight leading-none block">
              KitchOS
            </span>
            <span className="text-[10px] text-neutral-400 font-mono tracking-widest uppercase">
              Owner Onboarding Setup
            </span>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="hidden sm:flex items-center gap-2">
          {[
            { step: 1, label: 'Brand' },
            { step: 2, label: 'Outlet' },
            { step: 3, label: 'Security' },
            { step: 4, label: 'Starter Kit' },
            { step: 5, label: 'Launch' },
          ].map((s) => (
            <div key={s.step} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                  currentStep === s.step
                    ? 'bg-emerald-500 text-neutral-950 shadow-md shadow-emerald-950/40'
                    : currentStep > s.step
                    ? 'bg-neutral-800 text-emerald-400'
                    : 'bg-neutral-900 text-neutral-500'
                }`}
              >
                <span>{currentStep > s.step ? '✓' : s.step}</span>
                <span className="text-[11px]">{s.label}</span>
              </div>
              {s.step < 5 && <span className="text-neutral-700 text-xs">›</span>}
            </div>
          ))}
        </div>
      </header>

      {/* Main Form Container */}
      <main className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-2xl w-full bg-neutral-900/60 border border-neutral-800 rounded-3xl p-8 shadow-2xl backdrop-blur-sm space-y-6">
          {/* STEP 1: BRAND & IDENTITY */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 rounded-md">
                  Step 1 of 4
                </span>
                <h2 className="text-2xl font-black text-white tracking-tight mt-2">
                  Tell us about your restaurant brand
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  This identity will appear on printed customer thermal slips, kitchen tickets, and the Customer-Facing Display.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="sm:col-span-2">
                  <label className="block text-neutral-300 font-medium mb-1.5">
                    Restaurant / Organization Name *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Artisan Roast & Bakery, The Burger Hub"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 text-sm font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">
                    Owner / Managing Director Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Hj Danial, Sarah Jenkins"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">
                    Contact Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +673 888 1234"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-neutral-300 font-medium mb-1.5">
                    Operating Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 cursor-pointer font-bold"
                  >
                    <option value="BND ($)">Brunei Dollar (BND $)</option>
                    <option value="SGD ($)">Singapore Dollar (SGD $)</option>
                    <option value="MYR (RM)">Malaysian Ringgit (MYR RM)</option>
                    <option value="USD ($)">US Dollar (USD $)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PRIMARY OUTLET */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 rounded-md">
                  Step 2 of 4
                </span>
                <h2 className="text-2xl font-black text-white tracking-tight mt-2">
                  Set up your primary store location
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  KitchOS is multi-outlet ready. Let's create your first physical store branch.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">
                    Branch / Outlet Name *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Kiulap Flagship, Gadong Bistro"
                    value={branchName}
                    onChange={(e) => handleBranchNameChange(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">
                    Outlet Code (Unique ID) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    placeholder="e.g. KIULAP, GADONG"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 font-mono font-bold uppercase"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-neutral-300 font-medium mb-1.5">
                    Physical Store Address
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Unit 4, Ground Floor, Regent Square, Spg 150, Kiulap"
                    value={branchAddress}
                    onChange={(e) => setBranchAddress(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: MASTER SECURITY PIN */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-rose-400 bg-rose-950/80 border border-rose-800/60 px-2.5 py-0.5 rounded-md">
                  Step 3 of 4 • High Security
                </span>
                <h2 className="text-2xl font-black text-white tracking-tight mt-2">
                  Create your Master Owner PIN
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  This 4-digit PIN authorizes critical actions: approving ticket voids, opening/closing the till, modifying recipes, and accessing store reports.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">
                    Create 4-Digit Master PIN *
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    autoFocus
                    required
                    placeholder="••••"
                    value={ownerPin}
                    onChange={(e) => setOwnerPin(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white font-mono text-center tracking-widest text-xl font-bold focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">
                    Confirm 4-Digit Master PIN *
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    placeholder="••••"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white font-mono text-center tracking-widest text-xl font-bold focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800/80 space-y-1 text-xs">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <span>💡</span> Staff Separation Notice
                </span>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Your cashiers and baristas will be assigned standard staff PINs (e.g. Alex Cashier: <strong className="text-white">1234</strong>). They will never be able to void tickets or view your profit margins without entering this Master PIN.
                </p>
              </div>
            </div>
          )}

          {/* STEP 4: STARTER KIT SELECTION */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 rounded-md">
                  Step 4 of 4
                </span>
                <h2 className="text-2xl font-black text-white tracking-tight mt-2">
                  Choose your business starter kit
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  We'll pre-calibrate your catalog, recipe COGS, inventory ingredients, and payment methods to match your operational model.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {STARTER_KITS.map((kit) => {
                  const isSelected = selectedKit.id === kit.id;
                  return (
                    <div
                      key={kit.id}
                      onClick={() => setSelectedKit(kit)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                        isSelected
                          ? 'bg-neutral-800/90 border-emerald-500 ring-1 ring-emerald-500 text-white shadow-xl'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{kit.icon}</span>
                          <div>
                            <span className="text-[10px] font-bold uppercase text-emerald-400 block">
                              {kit.badge}
                            </span>
                            <h3 className="font-bold text-sm text-white">{kit.title}</h3>
                          </div>
                        </div>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center text-xs font-black">
                            ✓
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-neutral-300 leading-snug line-clamp-2">
                        {kit.tagline}
                      </p>

                      <div className="pt-2 border-t border-neutral-800/60 flex items-center justify-between text-[10px] font-mono text-neutral-400">
                        <span>Includes {kit.sampleProducts.length} dishes</span>
                        <span>Full BOM Costing</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 5: REVIEW & LAUNCH */}
          {currentStep === 5 && (
            <div className="space-y-5">
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 rounded-md">
                  Ready to Launch
                </span>
                <h2 className="text-2xl font-black text-white tracking-tight mt-2">
                  Review & Initialize Your Store
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  Everything is configured. Clicking launch will initialize your database and launch your terminal.
                </p>
              </div>

              {/* Review Card */}
              <div className="p-5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-neutral-800/60">
                  <span className="text-neutral-400">Restaurant Brand:</span>
                  <span className="font-bold text-white">{orgName}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-neutral-800/60">
                  <span className="text-neutral-400">Primary Branch:</span>
                  <span className="font-bold text-white">
                    {branchName} ({branchCode})
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-neutral-800/60">
                  <span className="text-neutral-400">Master Owner Operator:</span>
                  <span className="font-bold text-emerald-400">
                    {ownerName} (PIN: ••••)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-400">Industry Starter Kit:</span>
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <span>{selectedKit.icon}</span>
                    <span>{selectedKit.title}</span>
                  </span>
                </div>
              </div>

              {/* Provisioning Loader Display */}
              {isProvisioning && (
                <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-800/60 flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs font-mono font-bold text-emerald-300">
                    {provisioningStatus}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/50 border border-rose-900 rounded-xl text-rose-300 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Wizard Footer Controls */}
          <div className="flex justify-between items-center pt-4 border-t border-neutral-800">
            {currentStep > 1 && !isProvisioning ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                ← Back
              </button>
            ) : (
              <div />
            )}

            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 rounded-xl text-xs font-extrabold tracking-wider transition cursor-pointer shadow-lg shadow-emerald-950/50"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                disabled={isProvisioning}
                onClick={handleLaunchKitchOS}
                className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-neutral-950 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-xl shadow-emerald-950/60"
              >
                {isProvisioning ? 'Provisioning...' : 'Launch KitchOS Terminal 🚀'}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-14 border-t border-neutral-800/80 px-8 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
        <span>KitchOS SaaS Enterprise • Onboarding Engine</span>
        <span>Secure PostgreSQL Multitenant Architecture</span>
      </footer>
    </div>
  );
}