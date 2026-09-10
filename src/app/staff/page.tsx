'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

type StaffMember = {
  id: string
  email: string | null
  role: string
  created_at: string
}

export default function StaffManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  // New Staff Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('cashier')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const supabase = createClient()
  const router = useRouter()

  const fetchStaff = useCallback(async () => {
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

    const { data } = await supabase
      .from('users')
      .select('id, email, role, created_at')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: true })

    if (data) {
      setStaff(data)
    }
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setErrorMessage(result.error || 'Failed to add staff member')
      } else {
        setIsModalOpen(false)
        setNewEmail('')
        setNewPassword('')
        setNewRole('cashier')
        fetchStaff()
      }
    } catch {
      setErrorMessage('Network error while provisioning staff.')
    }
    setIsSubmitting(false)
  }

  const handleRoleChange = async (userId: string, updatedRole: string) => {
    const { error } = await supabase
      .from('users')
      .update({ role: updatedRole })
      .eq('id', userId)

    if (error) {
      alert('Error updating user role.')
    } else {
      fetchStaff()
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-emerald-400">Loading Staff...</div>

  return (
    <div className="flex h-screen bg-zinc-950 font-sans text-white overflow-hidden">
      <Sidebar />
      
      <div className="flex flex-1 flex-col overflow-y-auto p-8 relative">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-8 flex items-center justify-between border-b border-zinc-800 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Staff Management</h1>
              <p className="mt-1 text-zinc-400">Onboard cashiers, managers, and manage access roles.</p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-zinc-950 shadow-lg transition hover:bg-emerald-400"
            >
              + Add Staff Member
            </button>
          </header>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-800/50 text-zinc-400">
                <tr>
                  <th className="p-4 font-semibold">User Email / ID</th>
                  <th className="p-4 font-semibold">Joined Date</th>
                  <th className="p-4 font-semibold">Current Role</th>
                  <th className="p-4 font-semibold text-right">Change Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {staff.map((member) => (
                  <tr key={member.id} className="transition hover:bg-zinc-800/20">
                    <td className="p-4">
                      <span className="block font-medium text-zinc-200">{member.email || 'No email attached'}</span>
                      <span className="font-mono text-xs text-zinc-500">{member.id.slice(0, 12)}...</span>
                    </td>
                    <td className="p-4 text-zinc-400">{new Date(member.created_at).toLocaleDateString()}</td>
                    <td className="p-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                        member.role === 'owner' 
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                          : member.role === 'manager'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                      }`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {member.role === 'owner' ? (
                        <span className="text-xs text-zinc-500 italic pr-2">Primary Owner</span>
                      ) : (
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value)}
                          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-200 focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="cashier">Cashier</option>
                          <option value="manager">Manager</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ADD STAFF MODAL */}
        {isModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
              <h2 className="text-2xl font-bold mb-1">Add Staff Member</h2>
              <p className="text-sm text-zinc-400 mb-6">Create login credentials for a new team member.</p>

              {errorMessage && (
                <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleCreateStaff} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="cashier@example.com"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Temporary Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white focus:border-emerald-500 focus:outline-none text-sm"
                  >
                    <option value="cashier">Cashier (POS Only)</option>
                    <option value="manager">Manager (Inventory, Menu, Sales)</option>
                  </select>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => { setIsModalOpen(false); setErrorMessage(''); }}
                    className="flex-1 rounded-xl bg-zinc-800 py-3 font-semibold text-zinc-300 hover:bg-zinc-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 rounded-xl bg-emerald-500 py-3 font-semibold text-zinc-950 hover:bg-emerald-400 transition disabled:opacity-50"
                  >
                    {isSubmitting ? 'Adding...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}