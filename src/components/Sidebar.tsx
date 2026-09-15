'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useBranch } from '@/context/BranchContext';
import { createClient } from '@/utils/supabase/client';
import { terminateTerminalSession } from '@/utils/session';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: string;
  isExternalWindow?: boolean;
  managerOnly?: boolean;
  section: 'OPERATIONS' | 'MANAGEMENT';
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

const NAV_ITEMS: NavItem[] = [
  // FRONT OF HOUSE (Visible to Everyone)
  { name: 'POS Terminal', href: '/pos', icon: '🖥️', section: 'OPERATIONS' },
  { name: 'Kitchen (KDS)', href: '/kds', icon: '🍳', badge: 'Live', section: 'OPERATIONS' },
  { name: 'Customer Display', href: '/display', icon: '🪞', isExternalWindow: true, badge: 'CFD', section: 'OPERATIONS' },

  // STORE MANAGEMENT (Manager & Owner Only)
  { name: 'Dashboard', href: '/', icon: '📊', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Branch Outlets', href: '/branches', icon: '🏢', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Audit Ledger', href: '/audit', icon: '🛡️', badge: 'Sec', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Menu & Catalog', href: '/menu', icon: '📋', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Sales & Orders', href: '/sales', icon: '🧾', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Purchases & Vendors', href: '/purchases', icon: '🚚', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Recipes & COGS', href: '/recipes', icon: '📖', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Inventory & Waste', href: '/inventory', icon: '📦', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Staff Directory', href: '/staff', icon: '👥', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Payment Channels', href: '/payments', icon: '💳', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Starter Kits (Reset)', href: '/settings/starter-kits', icon: '⚡', badge: 'Seed', managerOnly: true, section: 'MANAGEMENT' },
  { name: 'Brand Theme', href: '/settings/theme', icon: '🎨', managerOnly: true, section: 'MANAGEMENT' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { branches, currentBranch, setCurrentBranch } = useBranch();

  const [activeStaff, setActiveStaff] = useState<StaffMember | null>(null);
  const [isSignoutModalOpen, setIsSignoutModalOpen] = useState(false);
  const [managerPin, setManagerPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const syncActiveStaff = () => {
    const saved = localStorage.getItem('kitchos_active_staff');
    if (saved) {
      try {
        setActiveStaff(JSON.parse(saved));
      } catch (e) {}
    } else {
      supabase
        .from('staff_members')
        .select('id, name, role')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setActiveStaff(data);
            localStorage.setItem('kitchos_active_staff', JSON.stringify(data));
          }
        });
    }
  };

  useEffect(() => {
    syncActiveStaff();

    const handleStaffChange = () => syncActiveStaff();
    window.addEventListener('kitchos_staff_changed', handleStaffChange);
    window.addEventListener('storage', handleStaffChange);

    return () => {
      window.removeEventListener('kitchos_staff_changed', handleStaffChange);
      window.removeEventListener('storage', handleStaffChange);
    };
  }, [supabase]);

  const isManager = useMemo(() => {
    if (!activeStaff) return false;
    const roleUpper = (activeStaff.role || '').toUpperCase();
    return ['MANAGER', 'OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(roleUpper);
  }, [activeStaff]);

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.managerOnly && !isManager) return false;
      return true;
    });
  }, [isManager]);

  const operationsItems = useMemo(
    () => visibleNavItems.filter((item) => item.section === 'OPERATIONS'),
    [visibleNavItems]
  );

  const managementItems = useMemo(
    () => visibleNavItems.filter((item) => item.section === 'MANAGEMENT'),
    [visibleNavItems]
  );

  const handleOpenCfdWindow = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    window.open(href, 'KitchOS_CFD', 'width=1024,height=768,menubar=no,toolbar=no,location=no');
  };

  const handleQuickLock = () => {
    localStorage.setItem('kitchos_terminal_locked', 'true');
    window.dispatchEvent(new Event('kitchos_lock_terminal'));
    if (pathname !== '/pos') {
      router.push('/pos');
    }
  };

  const handleConfirmSignOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (managerPin.length !== 4) {
      setPinError('Please enter a 4-digit Manager PIN.');
      return;
    }

    setIsSigningOut(true);
    setPinError(null);

    try {
      const { data: pinRes, error: pinErr } = await supabase.rpc('verify_manager_pin', {
        p_pin: managerPin.trim(),
      });

      if (pinErr) throw pinErr;
      if (!pinRes || !pinRes.valid) {
        setPinError('Invalid Manager PIN.');
        setIsSigningOut(false);
        return;
      }

      await terminateTerminalSession(pinRes.manager_name || 'Manager');
    } catch (err: any) {
      setPinError(err.message || 'Authorization failed.');
      setIsSigningOut(false);
    }
  };

  const renderNavLinks = (items: NavItem[]) => {
    return items.map((item) => {
      const isActive =
        item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href);

      if (item.isExternalWindow) {
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={(e) => handleOpenCfdWindow(e, item.href)}
            className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group text-theme-secondary hover:text-theme-primary hover:bg-surface-elevated"
          >
            <div className="flex items-center gap-3">
              <span className="text-base group-hover:scale-110 transition-transform">
                {item.icon}
              </span>
              <span>{item.name}</span>
            </div>

            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-theme bg-surface text-theme-muted">
              ↗ Pop-out
            </span>
          </a>
        );
      }

      return (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
            isActive
              ? 'bg-surface-elevated text-theme-primary border border-theme shadow-sm'
              : 'text-theme-secondary hover:text-theme-primary hover:bg-surface-elevated'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-base group-hover:scale-110 transition-transform">
              {item.icon}
            </span>
            <span>{item.name}</span>
          </div>

          {item.badge ? (
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
                item.badge === 'Sec'
                  ? 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                  : isActive
                  ? 'bg-brand-light text-brand border-brand-light font-black'
                  : 'bg-surface text-theme-muted border-theme'
              }`}
            >
              {item.badge}
            </span>
          ) : isActive ? (
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          ) : null}
        </Link>
      );
    });
  };

  return (
    <>
      <aside className="w-64 h-screen bg-surface border-r border-theme flex flex-col justify-between select-none flex-shrink-0">
        <div>
          {/* Top Brand Header */}
          <div className="h-16 px-6 border-b border-theme flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-brand text-brand-contrast flex items-center justify-center font-black text-sm shadow-md group-hover:scale-105 transition-transform">
                K
              </div>
              <div>
                <span className="font-extrabold text-theme-primary text-base tracking-tight leading-none block">
                  KitchOS
                </span>
                <span className="text-[10px] text-theme-muted font-mono tracking-wider uppercase">
                  Hospitality POS
                </span>
              </div>
            </Link>

            <span className="h-2 w-2 rounded-full bg-brand animate-pulse" title="System Online" />
          </div>

          {/* Nav Items */}
          <nav className="p-3.5 space-y-4 overflow-y-auto max-h-[calc(100vh-17rem)]">
            <div>
              <span className="px-3 text-[10px] font-black uppercase tracking-wider text-theme-muted block mb-1.5">
                Front of House
              </span>
              <div className="space-y-1">{renderNavLinks(operationsItems)}</div>
            </div>

            {isManager && managementItems.length > 0 && (
              <div className="pt-2 border-t border-theme-subtle">
                <span className="px-3 text-[10px] font-black uppercase tracking-wider text-brand block mb-1.5">
                  Store Management
                </span>
                <div className="space-y-1">{renderNavLinks(managementItems)}</div>
              </div>
            )}

            {!isManager && (
              <div className="p-3 rounded-2xl bg-surface-elevated border border-theme text-[11px] text-theme-secondary space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-500 text-xs">
                  <span>🔒</span>
                  <span>Cashier Mode</span>
                </div>
                <p className="text-[10px] text-theme-muted leading-snug">
                  Management controls hidden. Tap lock to switch to Manager PIN.
                </p>
              </div>
            )}
          </nav>
        </div>

        {/* Sidebar Footer: Active Branch & Active User */}
        <div className="p-3 border-t border-theme bg-surface space-y-2.5">
          {/* Branch Switcher Card */}
          <div className="p-2.5 rounded-2xl bg-surface-elevated border border-theme space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-theme-muted tracking-wider flex items-center gap-1">
                <span>📍</span>
                <span>Active Branch:</span>
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
            </div>

            {isManager ? (
              <select
                value={currentBranch?.id || ''}
                onChange={(e) => {
                  const selected = branches.find((b) => b.id === e.target.value);
                  if (selected) setCurrentBranch(selected);
                }}
                className="w-full bg-surface border border-theme text-xs font-bold text-theme-primary rounded-xl px-2 py-1 focus:outline-none focus:border-brand cursor-pointer"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-2.5 py-1 bg-surface border border-theme rounded-xl text-xs font-bold text-theme-primary truncate">
                {currentBranch?.name || 'Main Branch'}
              </div>
            )}
          </div>

          {/* Staff Card & Quick Lock */}
          <div className="p-2.5 rounded-2xl bg-surface-elevated border border-theme flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-brand-light text-brand border border-brand-light flex items-center justify-center text-xs font-bold flex-shrink-0">
                {activeStaff?.name?.charAt(0) || '👤'}
              </div>
              <div className="truncate">
                <span className="text-xs font-bold text-theme-primary block truncate leading-tight">
                  {activeStaff?.name || 'Staff Station'}
                </span>
                <span className="text-[9px] font-mono uppercase font-bold text-brand">
                  {activeStaff?.role || 'Active'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={handleQuickLock}
                className="p-1.5 bg-surface hover:bg-surface-elevated text-theme-secondary hover:text-theme-primary rounded-lg border border-theme transition cursor-pointer"
                title="Quick Lock Station"
              >
                🔒
              </button>
              <button
                type="button"
                onClick={() => {
                  setManagerPin('');
                  setPinError(null);
                  setIsSignoutModalOpen(true);
                }}
                className="p-1.5 bg-surface hover:bg-rose-950 text-theme-secondary hover:text-rose-400 rounded-lg border border-theme transition cursor-pointer"
                title="Sign Out Terminal"
              >
                🚪
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Sign-Out Confirmation Modal */}
      {isSignoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-surface border border-theme rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-theme pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider block">
                  Manager Security Guard
                </span>
                <h3 className="text-base font-bold text-theme-primary mt-0.5">
                  Sign Out Terminal Account
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSignoutModalOpen(false)}
                className="text-theme-muted hover:text-theme-primary text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmSignOut} className="space-y-3 text-xs">
              <div>
                <label className="block text-theme-secondary font-medium mb-1">
                  Enter Manager PIN *
                </label>
                <input
                  type="password"
                  maxLength={4}
                  autoFocus
                  required
                  placeholder="••••"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  className="w-full bg-surface-elevated border border-theme rounded-xl px-3 py-2.5 text-theme-primary font-mono text-center tracking-widest text-base focus:outline-none focus:border-rose-500"
                />
              </div>

              {pinError && (
                <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 p-2 rounded-xl">
                  {pinError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-theme">
                <button
                  type="button"
                  onClick={() => setIsSignoutModalOpen(false)}
                  className="px-3.5 py-2 text-theme-secondary hover:text-theme-primary bg-surface-elevated rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSigningOut || managerPin.length !== 4}
                  className="px-4 py-2 font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 rounded-xl transition cursor-pointer"
                >
                  {isSigningOut ? 'Signing out...' : 'Confirm Sign Out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}