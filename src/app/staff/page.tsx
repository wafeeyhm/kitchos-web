'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';

interface StaffMember {
  id: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'KITCHEN';
  is_active: boolean;
  created_at: string;
}

export default function StaffManagementPage() {
  const supabase = createClient();

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MANAGER' | 'CASHIER' | 'KITCHEN'>('CASHIER');
  const [pin, setPin] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, role, is_active, created_at')
        .order('role')
        .order('name');

      if (error) throw error;
      setStaffList((data as any) || []);
    } catch (err: any) {
      console.error('Error fetching staff members:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleOpenAdd = () => {
    setEditingStaff(null);
    setName('');
    setRole('CASHIER');
    setPin('');
    setIsActive(true);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (staff: StaffMember) => {
    setEditingStaff(staff);
    setName(staff.name);
    setRole(staff.role);
    setPin(''); // Blank unless updating
    setIsActive(staff.is_active);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Staff name is required.');
      return;
    }

    if (!editingStaff && (!pin || pin.length !== 4)) {
      setErrorMsg('A 4-digit PIN is required for new staff.');
      return;
    }

    if (pin && (pin.length !== 4 || !/^\d+$/.test(pin))) {
      setErrorMsg('PIN must be exactly 4 numeric digits.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.rpc('admin_save_staff', {
        p_id: editingStaff ? editingStaff.id : null,
        p_name: name.trim(),
        p_role: role,
        p_pin: pin.trim() || null,
        p_is_active: isActive,
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      setIsModalOpen(false);
      fetchStaff();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save staff member.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async (staffId: string) => {
    if (!confirm('Deactivate this staff member? They will no longer be able to log in.')) return;

    try {
      const { data, error } = await supabase.rpc('admin_deactivate_staff', {
        p_id: staffId,
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      fetchStaff();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <ManagerGuard
      pageTitle="Staff & Access Management"
      description="Creating staff accounts, setting roles, and resetting PINs requires Manager or Admin authorization."
    >
      <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Staff & Access Directory</h1>
              <p className="text-xs text-neutral-400 mt-1">
                Manage cashier, kitchen cook, and manager profiles, role permissions, and 4-digit terminal PINs.
              </p>
            </div>

            <button
              onClick={handleOpenAdd}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-extrabold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              + Add Staff Member
            </button>
          </div>

          {/* Staff Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {loading ? (
              <p className="text-xs text-neutral-500 col-span-full text-center py-12">
                Loading staff profiles...
              </p>
            ) : staffList.length === 0 ? (
              <p className="text-xs text-neutral-500 col-span-full text-center py-12">
                No staff profiles found.
              </p>
            ) : (
              staffList.map((staff) => (
                <div
                  key={staff.id}
                  className={`bg-neutral-900/70 border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition ${
                    staff.is_active ? 'border-neutral-800/80' : 'border-neutral-900 opacity-50'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <span
                        className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${
                          staff.role === 'ADMIN' || staff.role === 'MANAGER'
                            ? 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                            : staff.role === 'KITCHEN'
                            ? 'bg-blue-950/60 text-blue-400 border-blue-800/60'
                            : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                        }`}
                      >
                        {staff.role}
                      </span>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          staff.is_active
                            ? 'bg-neutral-800 text-neutral-300'
                            : 'bg-rose-950/60 text-rose-400'
                        }`}
                      >
                        {staff.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-white">{staff.name}</h3>
                    <p className="text-[10px] text-neutral-500 font-mono">
                      Joined: {new Date(staff.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-neutral-800/70 flex justify-between items-center">
                    <button
                      onClick={() => handleOpenEdit(staff)}
                      className="bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      Edit / Reset PIN
                    </button>

                    {staff.is_active && (
                      <button
                        onClick={() => handleDeactivate(staff.id)}
                        className="text-neutral-500 hover:text-rose-400 text-xs px-2 py-1 transition cursor-pointer"
                        title="Deactivate staff account"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ADD / EDIT STAFF MODAL */}
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {editingStaff ? 'Edit Staff Profile' : 'Add Staff Member'}
                    </h3>
                    <p className="text-xs text-neutral-400">Manage station access & PIN credentials</p>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveStaff} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex Tan, Chef Gordon"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">Role & Permissions *</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as any)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="CASHIER">CASHIER (POS Terminal, Shift Float, Orders)</option>
                      <option value="KITCHEN">KITCHEN (KDS Kitchen Board, Recipe Specs)</option>
                      <option value="MANAGER">MANAGER (All Station + Manager Overrides)</option>
                      <option value="ADMIN">ADMIN (Full Access & Master Controls)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">
                      {editingStaff ? 'Reset 4-Digit PIN (Leave blank to keep current)' : '4-Digit Station PIN *'}
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder={editingStaff ? '•••• (Unchanged)' : 'e.g. 1234'}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {editingStaff && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="staffIsActive"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 cursor-pointer"
                      />
                      <label htmlFor="staffIsActive" className="text-xs text-neutral-300 cursor-pointer">
                        Account Active (Permitted to sign in)
                      </label>
                    </div>
                  )}

                  {errorMsg && (
                    <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 p-2 rounded-xl">
                      {errorMsg}
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 text-neutral-400 hover:text-white bg-neutral-800 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition cursor-pointer"
                    >
                      {isSaving ? 'Saving...' : editingStaff ? 'Update Staff' : 'Create Staff'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </ManagerGuard>
  );
}