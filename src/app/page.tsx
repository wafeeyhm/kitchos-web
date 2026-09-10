import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  
  // 1. Initialize Supabase on the server
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

  // 2. Securely check the current session
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  // 3. If no user is found, boot them back to the login page
  if (authError || !user) {
    redirect('/login')
  }

  // 4. Fetch the SaaS profile data we created with our SQL trigger
  const { data: profile } = await supabase
    .from('users')
    .select(`
      role, 
      tenants ( name, subscription_tier ), 
      branches ( name )
    `)
    .eq('id', user.id)
    .single()
    
  // Helper variables to bypass TypeScript errors before we generate our strict types
  const tenantData = profile?.tenants as any
  const branchData = profile?.branches as any

  return (
    <div className="min-h-screen bg-zinc-950 p-8 text-white font-sans">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">KitchOS Dashboard</h1>
            <p className="mt-1 text-zinc-400">Welcome to your kitchen operations.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Active User</h3>
            <p className="mt-2 text-xl font-bold truncate">{user.email}</p>
            <p className="mt-1 text-emerald-400 text-sm font-medium">Role: {profile?.role}</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tenant (Business)</h3>
            <p className="mt-2 text-xl font-bold">{tenantData?.name}</p>
            <p className="mt-1 text-zinc-400 text-sm">Tier: {tenantData?.subscription_tier}</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Current Branch</h3>
            <p className="mt-2 text-xl font-bold">{branchData?.name}</p>
            <p className="mt-1 text-zinc-400 text-sm">Main Operations</p>
          </div>
        </div>
      </div>
    </div>
  )
}