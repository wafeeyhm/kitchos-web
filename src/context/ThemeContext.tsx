'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from '@/utils/supabase/client';

export type BgMode = 'DARK' | 'LIGHT';

export interface ThemePreset {
  id: string;
  name: string;
  badge: string;
  color: string;
  hover: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'EMERALD',
    name: 'Emerald Mint',
    badge: 'Artisan Cafe',
    color: '#10b981',
    hover: '#059669',
  },
  {
    id: 'MOCHA',
    name: 'Warm Mocha & Amber',
    badge: 'Specialty Roastery',
    color: '#f59e0b',
    hover: '#d97706',
  },
  {
    id: 'CRIMSON',
    name: 'Crimson Ruby',
    badge: 'Bistro & Grill',
    color: '#ef4444',
    hover: '#dc2626',
  },
  {
    id: 'VIOLET',
    name: 'Cyber Violet',
    badge: 'Esports Lounge',
    color: '#8b5cf6',
    hover: '#7c3aed',
  },
  {
    id: 'OCEAN',
    name: 'Ocean Blue',
    badge: 'Food Hall & Bar',
    color: '#3b82f6',
    hover: '#2563eb',
  },
];

interface ThemeContextType {
  activeColor: string;
  activePresetId: string;
  bgMode: BgMode;
  setBrandTheme: (presetId: string, customHex?: string) => Promise<void>;
  setBgMode: (mode: BgMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Calculate readable text contrast (Black or White) based on color luminance
function getContrastTextColor(hexColor: string): string {
  const clean = hexColor.replace('#', '');
  if (clean.length !== 6) return '#ffffff';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma > 160 ? '#09090b' : '#ffffff';
}

function applyThemeDom(color: string, hover: string, mode: BgMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.setAttribute('data-theme', mode);
  root.style.setProperty('--brand-primary', color);
  root.style.setProperty('--brand-hover', hover);
  root.style.setProperty('--brand-light', `${color}26`);
  root.style.setProperty('--brand-border', `${color}66`);
  root.style.setProperty('--brand-contrast', getContrastTextColor(color));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [activeColor, setActiveColor] = useState('#10b981');
  const [activePresetId, setActivePresetId] = useState('EMERALD');
  const [bgMode, setBgModeState] = useState<BgMode>('DARK');

  useEffect(() => {
    // 1. Hydrate from localStorage
    const cachedColor = localStorage.getItem('kitchos_brand_color');
    const cachedPreset = localStorage.getItem('kitchos_brand_preset') || 'EMERALD';
    const cachedMode = (localStorage.getItem('kitchos_bg_mode') as BgMode) || 'DARK';

    if (cachedColor) {
      setActiveColor(cachedColor);
      setActivePresetId(cachedPreset);
      setBgModeState(cachedMode);
      applyThemeDom(cachedColor, cachedColor, cachedMode);
    } else {
      applyThemeDom('#10b981', '#059669', 'DARK');
    }

    // 2. Fetch latest saved settings from Supabase
    supabase
      .from('store_settings')
      .select('brand_color, brand_hover_color, theme_preset, bg_mode')
      .eq('id', 'default')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const color = data.brand_color || '#10b981';
          const hover = data.brand_hover_color || '#059669';
          const preset = data.theme_preset || 'EMERALD';
          const mode = (data.bg_mode as BgMode) || 'DARK';

          setActiveColor(color);
          setActivePresetId(preset);
          setBgModeState(mode);

          localStorage.setItem('kitchos_brand_color', color);
          localStorage.setItem('kitchos_brand_preset', preset);
          localStorage.setItem('kitchos_bg_mode', mode);

          applyThemeDom(color, hover, mode);
        }
      });
  }, [supabase]);

  const setBrandTheme = async (presetId: string, customHex?: string) => {
    let primary = customHex || '#10b981';
    let hover = customHex || '#059669';

    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (preset && !customHex) {
      primary = preset.color;
      hover = preset.hover;
    }

    setActiveColor(primary);
    setActivePresetId(presetId);
    localStorage.setItem('kitchos_brand_color', primary);
    localStorage.setItem('kitchos_brand_preset', presetId);

    applyThemeDom(primary, hover, bgMode);

    await supabase.from('store_settings').upsert({
      id: 'default',
      theme_preset: presetId,
      brand_color: primary,
      brand_hover_color: hover,
      bg_mode: bgMode,
      updated_at: new Date().toISOString(),
    });
  };

  const setBgMode = async (mode: BgMode) => {
    setBgModeState(mode);
    localStorage.setItem('kitchos_bg_mode', mode);

    applyThemeDom(activeColor, activeColor, mode);

    await supabase.from('store_settings').upsert({
      id: 'default',
      bg_mode: mode,
      updated_at: new Date().toISOString(),
    });
  };

  return (
    <ThemeContext.Provider
      value={{
        activeColor,
        activePresetId,
        bgMode,
        setBrandTheme,
        setBgMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}