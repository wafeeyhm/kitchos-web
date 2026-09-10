import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Sidebar from '@/components/Sidebar'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select(`
      role, 
      tenants ( name, subscription_tier ), 
      branches ( name )
    `)
    .eq('id', user.id)
    .single()
    
  const tenantData = Array.isArray(profile?.tenants) ? profile.tenants[0] : profile?.tenants
  const branchData = Array.isArray(profile?.branches) ? profile.branches[0] : profile?.branches

  // Fetch Live Analytics Metrics
  const { data: salesData } = await supabase
    .from('sales')
    .select('total_amount')
    
  const totalRevenue = salesData?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0
  const totalOrders = salesData?.length || 0

  const { count: lowStockCount } = await supabase
    .from('inventory_items')
    .select('*', { count: 'exact', head: true })
    .lt('quantity_in_stock', 50)

  const { count: productCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })

  return (
    <div className="flex h-screen bg-zinc-950 font-sans text-white overflow-hidden">
      <Sidebar />
      
      <div className="flex flex-1 flex-col overflow-y-auto p-8">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
          
          <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Analytics Dashboard</h1>
              <p className="mt-1 text-zinc-400">Live operational overview for {tenantData?.name || 'Your Business'}.</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-right shadow-lg">
              <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold block">Branch</span>
              <span className="text-sm font-bold text-emerald-400">{branchData?.name || 'Main Branch'}</span>
            </div>
          </header>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4 mb-8">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Revenue</h3>
              <p className="mt-2 text-3xl font-extrabold text-emerald-400">${totalRevenue.toFixed(2)}</p>
              <p className="mt-1 text-xs text-zinc-500">Lifetime accumulated</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Orders</h3>
              <p className="mt-2 text-3xl font-extrabold text-white">{totalOrders}</p>
              <p className="mt-1 text-xs text-zinc-500">Completed checkouts</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Low Stock Alerts</h3>
              <p className={`mt-2 text-3xl font-extrabold ${(lowStockCount || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {lowStockCount || 0}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Ingredients below threshold</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Active Menu Items</h3>
              <p className="mt-2 text-3xl font-extrabold text-white">{productCount || 0}</p>
              <p className="mt-1 text-xs text-zinc-500">Sellable dishes</p>
            </div>
          </div>

          {/* Workspace Details Section */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Workspace Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">Account Email</span>
                  <span className="font-medium text-zinc-200">{user.email}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">User Role</span>
                  <span className="font-semibold text-emerald-400">{profile?.role}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">Subscription Tier</span>
                  <span className="font-semibold text-zinc-200">{tenantData?.subscription_tier}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Quick Navigation</h3>
                <p className="text-sm text-zinc-300 mb-4">Jump directly to key operational modules across your kitchen branches.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <a href="/pos" className="rounded-xl bg-zinc-800 p-3 text-center text-sm font-semibold text-zinc-200 hover:bg-emerald-500 hover:text-zinc-950 transition">Open POS</a>
                <a href="/inventory" className="rounded-xl bg-zinc-800 p-3 text-center text-sm font-semibold text-zinc-200 hover:bg-zinc-700 transition">Manage Stock</a>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}