'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

const allNavItems = [
  { name: 'Dashboard', href: '/', roles: ['owner', 'manager'] },
  { name: 'POS Terminal', href: '/pos', roles: ['owner', 'manager', 'cashier'] },
  { name: 'Inventory Manager', href: '/inventory', roles: ['owner', 'manager'] },
  { name: 'Recipe Builder', href: '/recipes', roles: ['owner', 'manager'] }, // <-- New route added here
  { name: 'Sales History', href: '/sales', roles: ['owner', 'manager'] },
  { name: 'Menu & BOM', href: '/menu', roles: ['owner', 'manager'] },
  { name: 'Staff Management', href: '/staff', roles: ['owner'] },
  { name: 'Audit Logs', href: '/audit-logs', roles: ['owner'] },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [role, setRole] = useState<string>('cashier')
  const [loading, setLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function fetchUserRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile) {
          setRole(profile.role)
        }
      }
      setLoading(false)
    }
    fetchUserRole()
  }, [supabase])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const filteredItems = allNavItems.filter((item) => item.roles.includes(role))

  return (
    <aside className="flex w-64 flex-col border-r border-zinc-800 bg-zinc-900 p-6 flex-shrink-0">
      <div className="mb-8">
        <h2 className="text-xl font-extrabold tracking-tight text-white">KitchOS</h2>
        <p className="text-xs text-zinc-400 capitalize">Role: {loading ? '...' : role}</p>
      </div>

      <nav className="flex-1 space-y-2">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-xl px-4 py-3 text-sm font-semibold transition ${
                isActive
                  ? 'bg-emerald-500 text-zinc-950 shadow-lg'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-zinc-800 pt-4 space-y-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Workspace</span>
          <p className="mt-1 text-sm font-medium text-zinc-300 truncate">Main Branch</p>
        </div>

        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="w-full flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-2.5 text-xs font-semibold text-zinc-400 transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50 cursor-pointer"
        >
          {isLoggingOut ? 'Signing out...' : 'Log Out'}
        </button>
      </div>
    </aside>
  )
}