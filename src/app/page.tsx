import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  const { data: profile, error: profileError } = await supabase
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

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 p-8 font-sans text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        
        {/* Main Dashboard Content */}
        <div>
          <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">KitchOS Dashboard</h1>
              <p className="mt-1 text-zinc-400">Welcome to your kitchen operations.</p>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Active User</h3>
              <p className="mt-2 truncate text-xl font-bold">{user.email}</p>
              <p className="mt-1 text-sm font-medium text-emerald-400">Role: {profile?.role}</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Tenant (Business)</h3>
              <p className="mt-2 text-xl font-bold">{tenantData?.name}</p>
              <p className="mt-1 text-sm text-zinc-400">Tier: {tenantData?.subscription_tier}</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Current Branch</h3>
              <p className="mt-2 text-xl font-bold">{branchData?.name}</p>
              <p className="mt-1 text-sm text-zinc-400">Main Operations</p>
            </div>
          </div>
        </div>

        {/* Debug Console - mt-auto pushes this to the very bottom */}
        <div className="mt-auto pt-12">
          <div className="rounded-xl border border-zinc-800 bg-black p-6 shadow-lg">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-rose-400">System Diagnostic Data</h3>
            {profileError && (
              <div className="mb-4 text-sm text-rose-500">
                <strong>Error:</strong> {profileError.message}
              </div>
            )}
            <pre className="overflow-auto whitespace-pre-wrap text-xs text-emerald-400">
              {JSON.stringify(profile, null, 2)}
            </pre>
          </div>
        </div>
        
      </div>
    </div>
  )
}