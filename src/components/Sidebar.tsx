'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBranch } from '@/context/BranchContext';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: string;
  isExternalWindow?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/',
    icon: '📊',
  },
  {
    name: 'POS Terminal',
    href: '/pos',
    icon: '🖥️',
  },
  {
    name: 'Kitchen (KDS)',
    href: '/kds',
    icon: '🍳',
    badge: 'Live',
  },
  {
    name: 'Customer Display',
    href: '/display',
    icon: '🪞',
    isExternalWindow: true,
    badge: 'CFD',
  },
  {
    name: 'Branch Outlets',
    href: '/branches',
    icon: '🏢',
  },
  {
    name: 'Menu & Catalog',
    href: '/menu',
    icon: '📋',
  },
  {
    name: 'Sales & Orders',
    href: '/sales',
    icon: '🧾',
  },
  {
    name: 'Purchases & Vendors',
    href: '/purchases',
    icon: '🚚',
  },
  {
    name: 'Recipes & COGS',
    href: '/recipes',
    icon: '📖',
  },
  {
    name: 'Inventory & Waste',
    href: '/inventory',
    icon: '📦',
  },
  {
    name: 'Staff Directory',
    href: '/staff',
    icon: '👥',
  },
  {
    name: 'Payment Channels',
    href: '/payments',
    icon: '💳',
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { branches, currentBranch, setCurrentBranch } = useBranch();

  const handleOpenCfdWindow = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    window.open(href, 'KitchOS_CFD', 'width=1024,height=768,menubar=no,toolbar=no,location=no');
  };

  return (
    <aside className="w-64 h-screen bg-neutral-950 border-r border-neutral-800 flex flex-col justify-between select-none">
      <div>
        <div className="h-16 px-6 border-b border-neutral-800 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center font-black text-neutral-950 text-sm shadow-md shadow-emerald-950/50 group-hover:scale-105 transition-transform">
              K
            </div>
            <div>
              <span className="font-extrabold text-white text-base tracking-tight leading-none block">
                KitchOS
              </span>
              <span className="text-[10px] text-neutral-500 font-mono tracking-wider uppercase">
                Hospitality POS
              </span>
            </div>
          </Link>

          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" title="System Online" />
        </div>

        <nav className="p-3.5 space-y-1 overflow-y-auto max-h-[calc(100vh-12rem)]">
          {NAV_ITEMS.map((item) => {
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
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60"
                  title="Launch Customer Display in secondary window"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base group-hover:scale-110 transition-transform">
                      {item.icon}
                    </span>
                    <span>{item.name}</span>
                  </div>

                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border bg-neutral-900 text-neutral-400 border-neutral-800">
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
                    ? 'bg-neutral-900 text-white border border-neutral-800 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
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
                      isActive
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                        : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : isActive ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* FOOTER: BRANCH SWITCHER */}
      <div className="p-3.5 border-t border-neutral-800 bg-neutral-950">
        <div className="p-3 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider flex items-center gap-1.5">
              <span>📍</span>
              <span>Active Branch:</span>
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <select
            value={currentBranch?.id || ''}
            onChange={(e) => {
              const selected = branches.find((b) => b.id === e.target.value);
              if (selected) setCurrentBranch(selected);
            }}
            className="w-full bg-neutral-950 border border-neutral-800 text-xs font-bold text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>

          {currentBranch && (
            <p className="text-[10px] text-neutral-500 truncate font-mono">
              {currentBranch.phone || currentBranch.address || 'Standard Store Outlet'}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}