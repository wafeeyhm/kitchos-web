'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: string;
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
    name: 'Sales & Orders',
    href: '/sales',
    icon: '🧾',
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
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-screen bg-neutral-950 border-r border-neutral-800 flex flex-col justify-between select-none">
      {/* Brand Header */}
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

        {/* Navigation Items */}
        <nav className="p-3.5 space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);

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

      {/* Footer Profile / Quick Info */}
      <div className="p-4 border-t border-neutral-800 bg-neutral-950">
        <div className="p-3 rounded-xl bg-neutral-900/50 border border-neutral-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-300">
              M
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate">Main Station</p>
              <p className="text-[10px] text-neutral-500 truncate font-mono">Store #01 • Online</p>
            </div>
          </div>
          <span className="text-emerald-400 text-xs font-bold">●</span>
        </div>
      </div>
    </aside>
  );
}