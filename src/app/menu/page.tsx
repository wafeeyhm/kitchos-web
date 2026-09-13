'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';
import { useBranch, Branch } from '@/context/BranchContext';

interface Product {
  id: string;
  name: string;
  category: string;
  selling_price: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface BranchAssignment {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  is_available: boolean;
  price_override: string;
}

export default function MenuCatalogPage() {
  const supabase = createClient();
  const { branches, loadingBranches } = useBranch();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Branch Products Map: { [productId]: BranchAssignment[] }
  const [productBranchMap, setProductBranchMap] = useState<Record<string, BranchAssignment[]>>({});

  // Product Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Food');
  const [customCategory, setCustomCategory] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Per-branch assignments state inside modal
  const [branchAssignments, setBranchAssignments] = useState<Record<string, { is_available: boolean; price_override: string }>>({});

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch Products and their Branch Mappings
  const fetchProductsAndBranchData = useCallback(async () => {
    try {
      setLoading(true);
      const [prodRes, bpRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('branch_products').select('branch_id, product_id, is_available, price_override'),
      ]);

      if (prodRes.error) throw prodRes.error;

      const prods = (prodRes.data as any) || [];
      setProducts(prods);

      // Build product-to-branch lookup
      const bpList = bpRes.data || [];
      const map: Record<string, BranchAssignment[]> = {};

      prods.forEach((p: Product) => {
        map[p.id] = branches.map((b) => {
          const match = bpList.find((bp: any) => bp.product_id === p.id && bp.branch_id === b.id);
          return {
            branch_id: b.id,
            branch_name: b.name,
            branch_code: b.code,
            is_available: match ? match.is_available : true,
            price_override: match && match.price_override !== null ? match.price_override.toString() : '',
          };
        });
      });

      setProductBranchMap(map);
    } catch (err: any) {
      console.error('Error fetching menu items & branch links:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, branches]);

  useEffect(() => {
    if (branches.length > 0) {
      fetchProductsAndBranchData();
    }
  }, [fetchProductsAndBranchData, branches.length]);

  // Categories list for filter bar
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ['ALL', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = categoryFilter === 'ALL' || p.category === categoryFilter;
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [products, categoryFilter, searchQuery]);

  // Open "Add Menu Product"
  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setCategory('Food');
    setCustomCategory('');
    setSellingPrice('');
    setDescription('');
    setIsActive(true);

    // Default all active branches to available
    const initialAssignments: Record<string, { is_available: boolean; price_override: string }> = {};
    branches.forEach((b) => {
      initialAssignments[b.id] = { is_available: true, price_override: '' };
    });
    setBranchAssignments(initialAssignments);

    setErrorMsg(null);
    setIsModalOpen(true);
  };

  // Open "Edit Menu Product"
  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);

    const standardCategories = ['Food', 'Beverages', 'Pastries', 'Desserts', 'Merchandise'];
    if (standardCategories.includes(product.category)) {
      setCategory(product.category);
      setCustomCategory('');
    } else {
      setCategory('Custom');
      setCustomCategory(product.category);
    }

    setSellingPrice(product.selling_price.toString());
    setDescription(product.description || '');
    setIsActive(product.is_active);

    // Populate current assignments from lookup
    const existing = productBranchMap[product.id] || [];
    const assignments: Record<string, { is_available: boolean; price_override: string }> = {};

    branches.forEach((b) => {
      const found = existing.find((e) => e.branch_id === b.id);
      assignments[b.id] = {
        is_available: found ? found.is_available : true,
        price_override: found?.price_override || '',
      };
    });

    setBranchAssignments(assignments);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  // Toggle branch availability inside modal
  const handleToggleBranchInModal = (branchId: string) => {
    setBranchAssignments((prev) => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        is_available: !prev[branchId]?.is_available,
      },
    }));
  };

  // Set branch price override inside modal
  const handlePriceOverrideChange = (branchId: string, val: string) => {
    setBranchAssignments((prev) => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        price_override: val,
      },
    }));
  };

  // Save Product and Upsert Branch Assignments
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Product name is required.');
      return;
    }

    const price = parseFloat(sellingPrice);
    if (isNaN(price) || price < 0) {
      setErrorMsg('Please enter a valid base selling price.');
      return;
    }

    const finalCategory = category === 'Custom' ? customCategory.trim() || 'General' : category;

    setIsSaving(true);
    setErrorMsg(null);

    try {
      let savedProductId = editingProduct?.id;

      if (editingProduct) {
        // 1. Update product
        const { error } = await supabase
          .from('products')
          .update({
            name: name.trim(),
            category: finalCategory,
            selling_price: price,
            description: description.trim() || null,
            is_active: isActive,
          })
          .eq('id', editingProduct.id);

        if (error) throw error;
      } else {
        // 1. Create product
        const { data: newProd, error } = await supabase
          .from('products')
          .insert({
            name: name.trim(),
            category: finalCategory,
            selling_price: price,
            description: description.trim() || null,
            is_active: isActive,
          })
          .select('id')
          .single();

        if (error) throw error;
        savedProductId = newProd.id;
      }

      // 2. Sync branch assignments into branch_products
      if (savedProductId) {
        const branchUpserts = branches.map((b) => {
          const assign = branchAssignments[b.id];
          const overrideVal =
            assign?.price_override && !isNaN(parseFloat(assign.price_override))
              ? parseFloat(assign.price_override)
              : null;

          return {
            branch_id: b.id,
            product_id: savedProductId,
            is_available: assign ? assign.is_available : true,
            price_override: overrideVal,
          };
        });

        const { error: bpErr } = await supabase
          .from('branch_products')
          .upsert(branchUpserts, { onConflict: 'branch_id,product_id' });

        if (bpErr) throw bpErr;
      }

      setIsModalOpen(false);
      fetchProductsAndBranchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save menu product.');
    } finally {
      setIsSaving(false);
    }
  };

  // Fast toggle product active status
  const handleToggleStatus = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);

      if (error) throw error;
      fetchProductsAndBranchData();
    } catch (err: any) {
      alert(`Could not update status: ${err.message}`);
    }
  };

  return (
    <ManagerGuard
      pageTitle="Menu & Product Catalog"
      description="Creating, re-pricing, and managing restaurant menu items across branches requires Manager authorization."
    >
      <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950">
          {/* Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Menu & Product Catalog</h1>
              <p className="text-xs text-neutral-400 mt-1">
                Configure your dishes, categories, base pricing, and assign availability per branch outlet.
              </p>
            </div>

            <button
              onClick={handleOpenAdd}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-extrabold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              + Add Menu Product
            </button>
          </div>

          {/* Filters Bar */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    categoryFilter === cat
                      ? 'bg-neutral-800 text-white shadow'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-72">
              <input
                type="text"
                placeholder="Search dish, beverage or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {loading ? (
              <p className="text-xs text-neutral-500 col-span-full text-center py-12">
                Loading menu catalog...
              </p>
            ) : filteredProducts.length === 0 ? (
              <p className="text-xs text-neutral-500 col-span-full text-center py-12">
                No products found. Click "+ Add Menu Product" to get started.
              </p>
            ) : (
              filteredProducts.map((product) => {
                const branchList = productBranchMap[product.id] || [];
                const availableBranches = branchList.filter((b) => b.is_available);
                const allBranchesAvailable =
                  branches.length > 0 && availableBranches.length === branches.length;

                return (
                  <div
                    key={product.id}
                    className={`bg-neutral-900/70 border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition ${
                      product.is_active
                        ? 'border-neutral-800/80 hover:border-neutral-700'
                        : 'border-neutral-900 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-md">
                          {product.category}
                        </span>
                        <button
                          onClick={() => handleToggleStatus(product)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer ${
                            product.is_active
                              ? 'bg-neutral-800 text-neutral-300 border-neutral-700'
                              : 'bg-rose-950/40 text-rose-400 border-rose-900/60'
                          }`}
                        >
                          {product.is_active ? 'Active' : 'Hidden'}
                        </button>
                      </div>

                      <h3 className="font-bold text-base text-white">{product.name}</h3>
                      {product.description && (
                        <p className="text-xs text-neutral-400 mt-1 line-clamp-2">
                          {product.description}
                        </p>
                      )}

                      {/* BRANCH OUTLET AVAILABILITY BADGES */}
                      <div className="mt-3 pt-3 border-t border-neutral-800/60 space-y-1">
                        <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider block">
                          Available Outlets:
                        </span>

                        {availableBranches.length === 0 ? (
                          <span className="inline-block text-[10px] text-rose-400 bg-rose-950/60 border border-rose-900/60 px-2 py-0.5 rounded-md font-bold">
                            Not available at any branch
                          </span>
                        ) : allBranchesAvailable ? (
                          <span className="inline-block text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-md font-bold">
                            ✓ All {branches.length} Branches
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {availableBranches.map((ab) => (
                              <span
                                key={ab.branch_id}
                                className="text-[10px] text-neutral-300 bg-neutral-800/90 border border-neutral-700 px-1.5 py-0.5 rounded font-mono"
                                title={
                                  ab.price_override
                                    ? `${ab.branch_name} (Override: $${ab.price_override})`
                                    : ab.branch_name
                                }
                              >
                                {ab.branch_code}
                                {ab.price_override && (
                                  <span className="text-emerald-400 font-bold ml-1">
                                    ${ab.price_override}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-neutral-800/60 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-neutral-500 block">Base Price</span>
                        <span className="font-mono text-lg font-black text-emerald-400">
                          ${Number(product.selling_price).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Link
                          href="/recipes"
                          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                          title="Configure COGS & recipe BOM"
                        >
                          📖 BOM
                        </Link>
                        <button
                          onClick={() => handleOpenEdit(product)}
                          className="bg-neutral-800 hover:bg-neutral-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                        >
                          Edit & Outlets
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* MODAL: ADD / EDIT PRODUCT WITH PER-BRANCH ASSIGNMENT */}
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {editingProduct ? 'Edit Menu Product' : 'Add New Menu Product'}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Configure details and select which branch outlets serve this dish.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">Product Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Spanish Latte, Truffle Fries"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-neutral-300 font-medium mb-1">Category</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="Food">Food (Hot Kitchen)</option>
                        <option value="Beverages">Beverages (Bar / Barista)</option>
                        <option value="Pastries">Pastries</option>
                        <option value="Desserts">Desserts</option>
                        <option value="Merchandise">Merchandise</option>
                        <option value="Custom">+ Custom Category</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-neutral-300 font-medium mb-1">
                        Base Selling Price ($) *
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        required
                        placeholder="4.50"
                        value={sellingPrice}
                        onChange={(e) => setSellingPrice(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {category === 'Custom' && (
                    <div>
                      <label className="block text-neutral-300 font-medium mb-1">
                        Custom Category Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Kombucha, Daily Specials"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">
                      Description / Kitchen Preparation Notes
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Optional customer description or recipe notes..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* BRANCH OUTLET ASSIGNMENTS SECTION */}
                  <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
                          Branch Availability & Price Overrides
                        </span>
                        <p className="text-[11px] text-neutral-500">
                          Select which branches sell this item and optionally override the price.
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const updated: any = { ...branchAssignments };
                            branches.forEach((b) => {
                              updated[b.id] = { ...updated[b.id], is_available: true };
                            });
                            setBranchAssignments(updated);
                          }}
                          className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-neutral-700">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated: any = { ...branchAssignments };
                            branches.forEach((b) => {
                              updated[b.id] = { ...updated[b.id], is_available: false };
                            });
                            setBranchAssignments(updated);
                          }}
                          className="text-[10px] text-neutral-400 hover:underline cursor-pointer"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {branches.map((branch) => {
                        const assign = branchAssignments[branch.id] || {
                          is_available: true,
                          price_override: '',
                        };

                        return (
                          <div
                            key={branch.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                              assign.is_available
                                ? 'bg-neutral-900/80 border-neutral-800'
                                : 'bg-neutral-950 border-neutral-900 opacity-50'
                            }`}
                          >
                            <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={assign.is_available}
                                onChange={() => handleToggleBranchInModal(branch.id)}
                                className="w-4 h-4 rounded border-neutral-700 bg-neutral-950 text-emerald-500 cursor-pointer"
                              />
                              <div className="truncate">
                                <span className="font-bold text-white text-xs block truncate">
                                  {branch.name}
                                </span>
                                <span className="text-[10px] text-neutral-500 font-mono">
                                  Code: {branch.code}
                                </span>
                              </div>
                            </label>

                            {assign.is_available && (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-[10px] text-neutral-400">Override $:</span>
                                <input
                                  type="number"
                                  step="0.05"
                                  min="0"
                                  placeholder={sellingPrice || 'Base'}
                                  value={assign.price_override}
                                  onChange={(e) =>
                                    handlePriceOverrideChange(branch.id, e.target.value)
                                  }
                                  className="w-20 bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-emerald-500"
                                  title="Leave blank to use standard base price"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="isActiveProduct"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 cursor-pointer"
                    />
                    <label htmlFor="isActiveProduct" className="text-xs text-neutral-300 cursor-pointer">
                      Visible in Global Active Menu Catalog
                    </label>
                  </div>

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
                      {isSaving ? 'Saving...' : editingProduct ? 'Update Product' : 'Create Product'}
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