'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';
import { useTheme, THEME_PRESETS, BgMode } from '@/context/ThemeContext';

export default function ThemeSettingsPage() {
  const { activeColor, activePresetId, bgMode, setBrandTheme, setBgMode } = useTheme();
  const [customHex, setCustomHex] = useState(activeColor);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSelectPreset = async (presetId: string) => {
    await setBrandTheme(presetId);
    const p = THEME_PRESETS.find((preset) => preset.id === presetId);
    if (p) setCustomHex(p.color);
    triggerSuccess();
  };

  const handleApplyCustomHex = async () => {
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(customHex)) {
      alert('Please enter a valid hex color code (e.g. #8b5cf6).');
      return;
    }
    await setBrandTheme('CUSTOM', customHex);
    triggerSuccess();
  };

  const handleSwitchBgMode = async (mode: BgMode) => {
    await setBgMode(mode);
    triggerSuccess();
  };

  const triggerSuccess = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2200);
  };

  return (
    <ManagerGuard
      pageTitle="Brand Theming & Appearance"
      description="Customizing terminal colors, dark/light canvas mode, and brand aesthetics requires Manager authorization."
    >
      <div className="flex h-screen bg-base text-theme-primary font-sans overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-base">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-theme pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-brand bg-brand-light border border-brand-light px-2.5 py-0.5 rounded-md">
                  White-Label & Brand Identity
                </span>
                <span className="text-xs text-theme-muted font-mono">Live Styling Engine</span>
              </div>
              <h1 className="text-2xl font-black text-theme-primary tracking-tight mt-1">
                Appearance, Background & Brand Theme
              </h1>
              <p className="text-xs text-theme-secondary mt-0.5">
                Switch between Dark and Light canvas backgrounds, and configure your restaurant's accent color palette across all stations.
              </p>
            </div>

            {savedSuccess && (
              <span className="text-xs font-bold text-brand-contrast bg-brand px-3.5 py-1.5 rounded-xl shadow-lg">
                ✓ Theme Updated Globally
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Background Canvas & Color Pickers */}
            <div className="lg:col-span-2 space-y-6">
              {/* 1. Background Theme Canvas (Dark vs Light) */}
              <div className="bg-surface border border-theme rounded-3xl p-6 space-y-4 shadow-sm">
                <div>
                  <h2 className="text-sm font-bold text-theme-primary uppercase tracking-wider">
                    1. Background Canvas Theme
                  </h2>
                  <p className="text-xs text-theme-muted mt-0.5">
                    Select the base interface mood for low-light bar environments or bright retail counters.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Dark Mode Card */}
                  <div
                    onClick={() => handleSwitchBgMode('DARK')}
                    className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                      bgMode === 'DARK'
                        ? 'bg-surface-elevated border-brand ring-1 ring-brand shadow-lg'
                        : 'bg-surface border-theme hover:border-brand-light'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-lg">
                        🌙
                      </div>
                      <div>
                        <h3 className="font-bold text-xs text-theme-primary">Dark Canvas</h3>
                        <span className="text-[10px] text-theme-muted">
                          Deep black F&B ambiance
                        </span>
                      </div>
                    </div>

                    {bgMode === 'DARK' && (
                      <span className="text-xs font-black text-brand">● Active</span>
                    )}
                  </div>

                  {/* Light Mode Card */}
                  <div
                    onClick={() => handleSwitchBgMode('LIGHT')}
                    className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                      bgMode === 'LIGHT'
                        ? 'bg-surface-elevated border-brand ring-1 ring-brand shadow-lg'
                        : 'bg-surface border-theme hover:border-brand-light'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-lg shadow-sm">
                        ☀️
                      </div>
                      <div>
                        <h3 className="font-bold text-xs text-theme-primary">Light Canvas</h3>
                        <span className="text-[10px] text-theme-muted">
                          Crisp daylight cafe aesthetic
                        </span>
                      </div>
                    </div>

                    {bgMode === 'LIGHT' && (
                      <span className="text-xs font-black text-brand">● Active</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Curated Brand Palettes */}
              <div className="bg-surface border border-theme rounded-3xl p-6 space-y-4 shadow-sm">
                <div>
                  <h2 className="text-sm font-bold text-theme-primary uppercase tracking-wider">
                    2. Curated Brand Accent Palettes
                  </h2>
                  <p className="text-xs text-theme-muted mt-0.5">
                    Colors applied to buttons, active tags, prices, and customer screen highlights.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {THEME_PRESETS.map((preset) => {
                    const isSelected = activePresetId === preset.id;
                    return (
                      <div
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset.id)}
                        className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-surface-elevated border-brand ring-1 ring-brand shadow-lg'
                            : 'bg-surface border-theme hover:border-brand-light'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-7 h-7 rounded-xl shadow-md flex-shrink-0"
                            style={{ backgroundColor: preset.color }}
                          />
                          <div>
                            <span className="text-[10px] uppercase font-bold text-theme-muted block">
                              {preset.badge}
                            </span>
                            <h3 className="font-bold text-xs text-theme-primary">{preset.name}</h3>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="text-xs font-black text-brand">● Active</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Custom Hex Picker */}
              <div className="bg-surface border border-theme rounded-3xl p-6 space-y-4 shadow-sm">
                <div>
                  <h2 className="text-sm font-bold text-theme-primary uppercase tracking-wider">
                    3. Custom Brand Hex Color
                  </h2>
                  <p className="text-xs text-theme-muted mt-0.5">
                    Input any hex color code to match your existing signage and logo.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="color"
                    value={customHex}
                    onChange={(e) => setCustomHex(e.target.value)}
                    className="w-10 h-10 rounded-xl bg-transparent border border-theme cursor-pointer p-0.5"
                  />

                  <input
                    type="text"
                    maxLength={7}
                    value={customHex}
                    onChange={(e) => setCustomHex(e.target.value)}
                    className="w-36 bg-surface-elevated border border-theme rounded-xl px-3.5 py-2 text-xs font-mono text-theme-primary uppercase tracking-wider focus:outline-none focus:border-brand"
                  />

                  <button
                    type="button"
                    onClick={handleApplyCustomHex}
                    className="px-5 py-2 rounded-xl bg-brand text-brand-contrast font-bold text-xs tracking-wider uppercase transition cursor-pointer shadow-md hover:opacity-90"
                  >
                    Apply Custom Color
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Live Responsive Preview Card */}
            <div className="space-y-4">
              <div className="bg-surface border border-theme rounded-3xl p-6 space-y-4 shadow-sm sticky top-8">
                <h3 className="text-xs font-bold uppercase tracking-wider text-theme-muted">
                  Live Register Preview
                </h3>

                <div className="p-5 bg-base border border-theme rounded-2xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-theme">
                    <span className="text-xs font-bold text-theme-primary">
                      {bgMode === 'DARK' ? '🌙 Dark Mode' : '☀️ Light Mode'}
                    </span>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-brand-light text-brand border border-brand-light">
                      Active Theme
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="p-3 bg-surface border border-theme rounded-xl flex justify-between items-center">
                      <span className="font-semibold text-theme-primary">Spanish Latte</span>
                      <span className="font-mono font-bold text-brand">$5.00</span>
                    </div>

                    <div className="p-3 bg-surface border border-theme rounded-xl flex justify-between items-center">
                      <span className="font-semibold text-theme-primary">
                        Truffle Shoestring Fries
                      </span>
                      <span className="font-mono font-bold text-brand">$5.50</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="w-full py-3 rounded-xl bg-brand text-brand-contrast font-extrabold text-xs shadow-lg uppercase tracking-wider hover:opacity-95 transition"
                  >
                    Checkout Ticket ($10.50)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ManagerGuard>
  );
}