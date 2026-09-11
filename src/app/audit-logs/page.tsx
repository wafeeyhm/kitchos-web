'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

type AuditLog = {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  user_email: string | null
  details: Record<string, unknown>
  created_at: string
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAction, setFilterAction] = useState('ALL')
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  const supabase = createClient()
  const router = useRouter()

  const fetchLogs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'owner') {
      router.push('/pos')
      return
    }

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data) {
      setLogs(data)
    }
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.user_email && log.user_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      log.entity_type.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesAction = filterAction === 'ALL' || log.action === filterAction
    return matchesSearch && matchesAction
  })

  const uniqueActions = ['ALL', ...Array.from(new Set(logs.map((l) => l.action)))]

  const getActionBadgeColor = (action: string) => {
    if (action.includes('CREATED')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    if (action.includes('CHANGED') || action.includes('UPDATED')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    if (action.includes('DELETED')) return 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 font-sans text-emerald-400">
        Loading Audit Trail...
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-zinc-950 font-sans text-white overflow-hidden">
      <Sidebar />

      <main className="flex flex-1 flex-col overflow-y-auto p-8 relative">
        <div className="mx-auto w-full max-w-6xl">
          <header className="mb-6 border-b border-zinc-800 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Audit Logs</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Tamper-evident activity trail for staff actions, security events, and entity changes.
              </p>
            </div>
            <button
              onClick={() => { setLoading(true); fetchLogs(); }}
              className="cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition"
            >
              Refresh Logs
            </button>
          </header>

          {/* Filters Bar */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by action, email, or entity..."
              className="md:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm text-zinc-300 focus:border-emerald-500 focus:outline-none"
            >
              {uniqueActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 shadow-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-800/40 text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">Actor</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Target Entity</th>
                  <th className="p-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-zinc-500">
                      No audit events found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="transition hover:bg-zinc-800/20">
                      <td className="p-4 text-xs font-mono text-zinc-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-zinc-200 block text-xs">
                          {log.user_email || 'System / Service'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${getActionBadgeColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-zinc-300 capitalize">
                        {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)}...)` : ''}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="cursor-pointer rounded-lg bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition"
                        >
                          View Payload
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETAILS MODAL */}
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
                <h3 className="text-lg font-bold text-white">Log Event Details</h3>
                <span className={`rounded border px-2 py-0.5 text-xs font-bold ${getActionBadgeColor(selectedLog.action)}`}>
                  {selectedLog.action}
                </span>
              </div>

              <div className="space-y-3 text-xs mb-6">
                <div>
                  <span className="text-zinc-500 font-semibold uppercase block">Timestamp</span>
                  <span className="text-zinc-300">{new Date(selectedLog.created_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-zinc-500 font-semibold uppercase block">Actor</span>
                  <span className="text-zinc-300">{selectedLog.user_email || 'System'}</span>
                </div>
                <div>
                  <span className="text-zinc-500 font-semibold uppercase block">Entity</span>
                  <span className="text-zinc-300 capitalize">{selectedLog.entity_type} {selectedLog.entity_id ? `(${selectedLog.entity_id})` : ''}</span>
                </div>
                <div>
                  <span className="text-zinc-500 font-semibold uppercase block mb-1">Payload / Changes</span>
                  <pre className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-emerald-400 overflow-x-auto text-[11px]">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="w-full cursor-pointer rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}