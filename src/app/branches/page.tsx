'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';
import { useBranch, Branch } from '@/context/BranchContext';
import { logAuditEvent } from '@/utils/audit';

interface Product {
  id: string;
  name: string;
  category: string | null;
  selling_price: number;
}

interface BranchProduct {
  id: string;
  branch_id: string;
  product_id: string;
  is_available: boolean;
  price_override: number | null;
}

export default function BranchesPage() {
  const supabase = createClient();
  const { branches, refreshBranches, currentBranch, setCurrentBranch, loadingBranches } = useBranch();

  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // Branch Modal State
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  // Per-Branch Menu State
  const [products, setProducts] = useState<Product[]>([]);
  const [branchProducts, setBranchProducts] = useState<BranchProduct[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [searchMenuQuery, setSearchMenuQuery] = useState('');

  // Automatically select the active or first branch once branches load
  useEffect(() => {
    if (branches.length > 0) {
      if (!selectedBranch) {
        setSelectedBranch(currentBranch || branches[0]);
      } else {
        const stillExists = branches.find((b) => b.id === selectedBranch.id);
        if (!stillExists) {
          setSelectedBranch(branches[0]);
        }
      }
    }
  }, [branches, currentBranch, selectedBranch]);

  // Load products and overrides for the selected branch
  const fetchBranchMenu = useCallback(async () => {
    if (!selectedBranch?.id) return;

    setLoadingMenu(true);
    try {
      const [prodRes, bpRes] = await Promise.all([
        supabase.from('products').select('id, name, category, selling_price').order('name'),
        supabase.from('branch_products').select('*').eq('branch_id', selectedBranch.id),
      ]);

      if (prodRes.data) {
        setProducts(
          prodRes.data.map((p: any) => ({
            id: p.id,
            name: p.name || 'Unnamed Item',
            category: p.category || 'General',
            selling_price: Number(p.selling_price || 0),
          }))
        );
      }
      if (bpRes.data) {
        setBranchProducts(bpRes.data);
      }
    } catch (err: any) {
      console.error('Error loading branch menu:', err.message);
    } finally {
      setLoadingMenu(false);
    }
  }, [selectedBranch?.id, supabase]);

  useEffect(() => {
    fetchBranchMenu();
  }, [fetchBranchMenu]);

  // Modal Handlers
  const handleOpenAddBranch = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchCode('');
    setBranchAddress('');
    setBranchPhone('');
    setBranchError(null);
    setIsBranchModalOpen(true);
  };

  const handleOpenEditBranch = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchName(branch.name);
    setBranchCode(branch.code);
    setBranchAddress(branch.address || '');
    setBranchPhone(branch.phone || '');
    setBranchError(null);
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim() || !branchCode.trim()) {
      setBranchError('Branch name and unique code are required.');
      return;
    }

    setIsSavingBranch(true);
    setBranchError(null);

    try {
      if (editingBranch) {
        const { error } = await supabase
          .from('branches')
          .update({
            name: branchName.trim(),
            code: branchCode.trim().toUpperCase(),
            address: branchAddress.trim() || null,
            phone: branchPhone.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingBranch.id);

        if (error) throw error;

        // Log audit event for branch edit
        await logAuditEvent({
          branchId: editingBranch.id,
          actionType: 'BRANCH_UPDATE',
          severity: 'WARN',
          entityName: 'branches',
          entityId: editingBranch.id,
          summary: `Branch profile updated for ${branchCode.trim().toUpperCase()}`,
          details: {
            branch_id: editingBranch.id,
            name: branchName.trim(),
            code: branchCode.trim().toUpperCase(),
            phone: branchPhone.trim(),
            address: branchAddress.trim(),
          },
        });
      } else {
        const { data: newB, error } = await supabase
          .from('branches')
          .insert({
            name: branchName.trim(),
            code: branchCode.trim().toUpperCase(),
            address: branchAddress.trim() || null,
            phone: branchPhone.trim() || null,
          })
          .select('*')
          .single();

        if (error) throw error;

        // Auto-seed all active products into new branch
        const { data: allProds } = await supabase.from('products').select('id');
        if (allProds && allProds.length > 0) {
          const links = allProds.map((p) => ({
            branch_id: newB.id,
            product_id: p.id,
            is_available: true,
          }));
          await supabase.from('branch_products').insert(links);
        }

        // Log audit event for branch creation
        await logAuditEvent({
          branchId: newB.id,
          actionType: 'BRANCH_UPDATE',
          severity: 'WARN',
          entityName: 'branches',
          entityId: newB.id,
          summary: `New branch outlet created: ${newB.name} (${newB.code})`,
          details: {
            branch_id: newB.id,
            name: newB.name,
            code: newB.code,
          },
        });
      }

      await refreshBranches();
      setIsBranchModalOpen(false);
    } catch (err: any) {
      setBranchError(err.message || 'Failed to save branch.');
    } finally {
      setIsSavingBranch(false);
    }
  };

  // Toggle item availability at selected branch
  const handleToggleProductAvailability = async (productId: string, currentAvailability: boolean) => {
    if (!selectedBranch) return;

    setBranchProducts((prev) => {
      const existing = prev.find((bp) => bp.product_id === productId);
      if (existing) {
        return prev.map((bp) =>
          bp.product_id === productId ? { ...bp, is_available: !currentAvailability } : bp
        );
      } else {
        return [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            branch_id: selectedBranch.id,
            product_id: productId,
            is_available: !currentAvailability,
            price_override: null,
          },
        ];
      }
    });

    try {
      const { error } = await supabase.from('branch_products').upsert(
        {
          branch_id: selectedBranch.id,
          product_id: productId,
          is_available: !currentAvailability,
        },
        { onConflict: 'branch_id,product_id' }
      );

      if (error) throw error;

      // Log audit event for menu availability change
      const targetProd = products.find((p) => p.id === productId);
      await logAuditEvent({
        branchId: selectedBranch.id,
        actionType: 'MENU_UPDATE',
        severity: 'INFO',
        entityName: 'branch_products',
        entityId: productId,
        summary: `Menu item "${targetProd?.name || productId.slice(0, 8)}" set to ${
          !currentAvailability ? 'AVAILABLE' : 'DISABLED'
        } at ${selectedBranch.code}`,
        details: {
          branch_code: selectedBranch.code,
          product_id: productId,
          product_name: targetProd?.name,
          is_available: !currentAvailability,
        },
      });
    } catch (err: any) {
      console.error('Error updating availability:', err);
      fetchBranchMenu();
    }
  };

  // Update branch price override
  const handleUpdatePriceOverride = async (productId: string, newPriceStr: string) => {
    if (!selectedBranch) return;
    const priceVal = newPriceStr ? parseFloat(newPriceStr) : null;

    try {
      const { error } = await supabase.from('branch_products').upsert(
        {
          branch_id: selectedBranch.id,
          product_id: productId,
          is_available: true,
          price_override: priceVal,
        },
        { onConflict: 'branch_id,product_id' }
      );

      if (error) throw error;

      // Log audit event for price override
      const targetProd = products.find((p) => p.id === productId);
      await logAuditEvent({
        branchId: selectedBranch.id,
        actionType: 'PRICE_OVERRIDE',
        severity: 'WARN',
        entityName: 'branch_products',
        entityId: productId,
        summary: `Price override set to $${priceVal ?? 'Standard Base'} for "${
          targetProd?.name || productId.slice(0, 8)
        }" at ${selectedBranch.code}`,
        details: {
          branch_code: selectedBranch.code,
          product_id: productId,
          product_name: targetProd?.name,
          standard_price: targetProd?.selling_price,
          new_price_override: priceVal,
        },
      });

      fetchBranchMenu();
    } catch (err: any) {
      alert(`Could not save price override: ${err.message}`);
    }
  };

  // Null-safe product filter
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = searchMenuQuery.toLowerCase();
      const nameMatch = (p.name || '').toLowerCase().includes(q);
      const catMatch = (p.category || '').toLowerCase().includes(q);
      return nameMatch || catMatch;
    });
  }, [products, searchMenuQuery]);

  return (
    <ManagerGuard
      pageTitle="Branch & Outlet Management"
      description="Configuring store branches, outlet contact information, and branch-specific menu availability requires Manager authorization."
    >
      <div className="flex h-screen w-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex overflow-hidden">
          {/* Left Column: Branches List */}
          <section className="w-80 border-r border-neutral-800 bg-neutral-900/30 flex flex-col flex-shrink-0">
            <div className="h-16 px-6 border-b border-neutral-800 flex items-center justify-between flex-shrink-0">
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Store Branches</h1>
                <p className="text-[10px] text-neutral-400">Manage retail locations</p>
              </div>
              <button
                onClick={handleOpenAddBranch}
                className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold px-3 py-1.5 rounded-xl transition cursor-pointer"
              >
                + Add
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loadingBranches ? (
                <div className="p-6 text-center text-xs text-neutral-500">Loading branches...</div>
              ) : branches.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-500">
                  No branches found. Click "+ Add" to create one.
                </div>
              ) : (
                branches.map((b) => {
                  const isSelected = selectedBranch?.id === b.id;
                  const isCurrent = currentBranch?.id === b.id;

                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBranch(b)}
                      className={`p-3.5 rounded-2xl border transition cursor-pointer space-y-2 ${
                        isSelected
                          ? 'bg-neutral-800 border-neutral-700 text-white shadow-lg'
                          : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-400 hover:bg-neutral-800/40 hover:text-white'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-sm text-white">{b.name}</h3>
                          <span className="text-[10px] font-mono text-emerald-400 font-semibold uppercase">
                            Code: {b.code}
                          </span>
                        </div>
                        {isCurrent && (
                          <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-bold">
                            ● Active Terminal
                          </span>
                        )}
                      </div>

                      {b.address && (
                        <p className="text-[11px] text-neutral-400 truncate">📍 {b.address}</p>
                      )}

                      <div className="flex justify-between items-center pt-2 border-t border-neutral-800/60">
                        <span className="text-[10px] text-neutral-500 font-mono">
                          {b.phone || 'No phone recorded'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditBranch(b);
                          }}
                          className="text-[10px] text-neutral-400 hover:text-white underline cursor-pointer"
                        >
                          Edit Details
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Right Column: Menu Availability & Price Overrides */}
          {selectedBranch ? (
            <section className="flex-1 flex flex-col overflow-hidden bg-neutral-950">
              {/* Header */}
              <div className="p-6 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-md">
                      Branch Menu Matrix
                    </span>
                    <span className="text-xs text-neutral-400 font-mono">#{selectedBranch.code}</span>
                  </div>
                  <h2 className="text-2xl font-black text-white mt-1">
                    {selectedBranch.name} Menu Configuration
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Toggle which dishes and beverages are available at this branch, or customize price overrides.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-64">
                    <input
                      type="text"
                      placeholder="Filter menu items..."
                      value={searchMenuQuery}
                      onChange={(e) => setSearchMenuQuery(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    onClick={() => setCurrentBranch(selectedBranch)}
                    className="bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white px-3.5 py-2 rounded-xl transition cursor-pointer"
                    title="Switch active station to this branch"
                  >
                    Switch Terminal to This Branch
                  </button>
                </div>
              </div>

              {/* Menu Availability Table */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-neutral-800 bg-neutral-900/80 text-neutral-400 font-medium">
                      <tr>
                        <th className="py-3.5 px-5">Menu Item</th>
                        <th className="py-3.5 px-5">Category</th>
                        <th className="py-3.5 px-5 text-right">Standard Price</th>
                        <th className="py-3.5 px-5 text-center">Branch Price Override ($)</th>
                        <th className="py-3.5 px-5 text-center">Availability at {selectedBranch.code}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {loadingMenu ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-neutral-500">
                            Loading branch availability...
                          </td>
                        </tr>
                      ) : filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-neutral-500">
                            No menu items found.
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((product) => {
                          const override = branchProducts.find(
                            (bp) => bp.product_id === product.id
                          );
                          const isAvailable = override ? override.is_available : true;
                          const customPrice = override?.price_override ?? '';

                          return (
                            <tr
                              key={product.id}
                              className={`hover:bg-neutral-800/20 transition-colors ${
                                !isAvailable ? 'opacity-40 bg-neutral-950/40' : ''
                              }`}
                            >
                              <td className="py-3.5 px-5 font-bold text-white">{product.name}</td>
                              <td className="py-3.5 px-5 text-neutral-400 font-mono">
                                {product.category}
                              </td>
                              <td className="py-3.5 px-5 text-right font-mono font-bold text-neutral-300">
                                ${Number(product.selling_price).toFixed(2)}
                              </td>
                              <td className="py-3.5 px-5 text-center">
                                <input
                                  type="number"
                                  step="0.05"
                                  min="0"
                                  placeholder={Number(product.selling_price).toFixed(2)}
                                  defaultValue={customPrice !== null ? customPrice : ''}
                                  onBlur={(e) =>
                                    handleUpdatePriceOverride(product.id, e.target.value)
                                  }
                                  className="w-24 bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-emerald-500"
                                />
                              </td>
                              <td className="py-3.5 px-5 text-center">
                                <button
                                  onClick={() =>
                                    handleToggleProductAvailability(product.id, isAvailable)
                                  }
                                  className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition cursor-pointer border ${
                                    isAvailable
                                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                                      : 'bg-rose-950/80 text-rose-400 border-rose-800/60'
                                  }`}
                                >
                                  {isAvailable ? '● Available' : '○ Disabled'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs">
              Select a branch from the left panel to configure its menu settings.
            </div>
          )}

          {/* MODAL: ADD / EDIT BRANCH */}
          {isBranchModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {editingBranch ? 'Edit Branch Outlet' : 'Add New Branch Outlet'}
                    </h3>
                    <p className="text-xs text-neutral-400">Configure store location profile</p>
                  </div>
                  <button
                    onClick={() => setIsBranchModalOpen(false)}
                    className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveBranch} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">Branch Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kiulap Flagship, Gadong Branch"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">
                      Branch Code (Unique) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. KIULAP, GADONG, AIRPORT"
                      value={branchCode}
                      onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">
                      Store Phone Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. +673 223 8811"
                      value={branchPhone}
                      onChange={(e) => setBranchPhone(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">Physical Address</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Unit 12, Ground Floor, Abdul Razak Complex..."
                      value={branchAddress}
                      onChange={(e) => setBranchAddress(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {branchError && (
                    <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 p-2 rounded-xl">
                      {branchError}
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setIsBranchModalOpen(false)}
                      className="px-4 py-2 text-neutral-400 hover:text-white bg-neutral-800 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingBranch}
                      className="px-4 py-2 font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition cursor-pointer"
                    >
                      {isSavingBranch ? 'Saving...' : editingBranch ? 'Update Branch' : 'Create Branch'}
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