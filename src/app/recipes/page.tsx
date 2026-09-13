'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';

interface Product {
  id: string;
  name: string;
  category: string;
  selling_price: number;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  current_stock: number;
}

interface RecipeBomItem {
  id: string;
  product_id: string;
  inventory_item_id: string;
  quantity_required: number;
}

export default function RecipesPage() {
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [bomList, setBomList] = useState<RecipeBomItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for Adding Ingredient to Recipe
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [isSavingBom, setIsSavingBom] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Safe Fetch Data with Column-Agnostic Fallbacks
  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      // 1. Fetch products
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('id, name, category, selling_price')
        .eq('is_active', true)
        .order('name');

      if (prodErr) throw new Error(`Products error: ${prodErr.message}`);
      const prods = (prodData as Product[]) || [];
      setProducts(prods);

      // 2. Fetch inventory items using select('*') to prevent missing column errors
      const { data: invData, error: invErr } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name');

      if (invErr) throw new Error(`Inventory error: ${invErr.message}`);

      // Map with fallbacks for column variations (unit vs unit_of_measure vs uom)
      const mappedInventory: InventoryItem[] = (invData || []).map((i: any) => ({
        id: i.id,
        name: i.name || 'Unnamed Ingredient',
        unit: i.unit || i.unit_of_measure || i.uom || 'unit',
        cost_per_unit: Number(i.cost_per_unit ?? i.cost_price ?? i.unit_cost ?? 0),
        current_stock: Number(i.current_stock ?? i.stock_quantity ?? i.quantity ?? 0),
      }));

      setInventory(mappedInventory);

      // 3. Fetch recipe BOM links
      const { data: bomData, error: bomErr } = await supabase
        .from('recipe_bom')
        .select('id, product_id, inventory_item_id, quantity_required');

      if (bomErr) throw new Error(`Recipe BOM error: ${bomErr.message}`);
      setBomList((bomData as RecipeBomItem[]) || []);

      // Auto-select first product if none selected
      if (prods.length > 0 && !selectedProduct) {
        setSelectedProduct(prods[0]);
      }
    } catch (err: any) {
      console.error('RecipesPage fetch error:', err);
      setFetchError(err.message || 'Failed to connect to database. Please check network.');
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedProduct]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Active product's recipe ingredients
  const currentRecipe = useMemo(() => {
    if (!selectedProduct) return [];
    return bomList
      .filter((b) => b.product_id === selectedProduct.id)
      .map((b) => {
        const item = inventory.find((i) => i.id === b.inventory_item_id);
        const unitCost = item ? Number(item.cost_per_unit) : 0;
        const lineCost = unitCost * Number(b.quantity_required);

        return {
          bom_id: b.id,
          inventory_item_id: b.inventory_item_id,
          name: item?.name || 'Unknown Ingredient',
          unit: item?.unit || 'unit',
          unit_cost: unitCost,
          quantity_required: Number(b.quantity_required),
          line_cost: lineCost,
        };
      });
  }, [selectedProduct, bomList, inventory]);

  // Total COGS Calculation
  const totalCogs = useMemo(() => {
    return currentRecipe.reduce((sum, item) => sum + item.line_cost, 0);
  }, [currentRecipe]);

  // Gross Margin Calculation
  const marginMetrics = useMemo(() => {
    if (!selectedProduct || selectedProduct.selling_price <= 0) {
      return { grossProfit: 0, marginPercent: 0 };
    }
    const grossProfit = selectedProduct.selling_price - totalCogs;
    const marginPercent = (grossProfit / selectedProduct.selling_price) * 100;
    return { grossProfit, marginPercent };
  }, [selectedProduct, totalCogs]);

  // Add / Link Ingredient to Recipe
  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    if (!selectedInventoryId) {
      setFormError('Please select an ingredient from inventory.');
      return;
    }

    const qty = parseFloat(quantityInput);
    if (isNaN(qty) || qty <= 0) {
      setFormError('Please enter a valid quantity required.');
      return;
    }

    setIsSavingBom(true);
    setFormError(null);

    try {
      const { error } = await supabase.from('recipe_bom').upsert(
        {
          product_id: selectedProduct.id,
          inventory_item_id: selectedInventoryId,
          quantity_required: qty,
        },
        { onConflict: 'product_id,inventory_item_id' }
      );

      if (error) throw error;

      // Refresh BOM
      const { data: updatedBom } = await supabase
        .from('recipe_bom')
        .select('id, product_id, inventory_item_id, quantity_required');

      setBomList((updatedBom as RecipeBomItem[]) || []);
      setSelectedInventoryId('');
      setQuantityInput('1');
    } catch (err: any) {
      setFormError(err.message || 'Failed to link ingredient to recipe.');
    } finally {
      setIsSavingBom(false);
    }
  };

  // Remove Ingredient from Recipe
  const handleRemoveIngredient = async (bomId: string) => {
    try {
      const { error } = await supabase.from('recipe_bom').delete().eq('id', bomId);
      if (error) throw error;

      setBomList((prev) => prev.filter((b) => b.id !== bomId));
    } catch (err: any) {
      alert(`Could not remove ingredient: ${err.message}`);
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ManagerGuard
      pageTitle="Recipe Costing & COGS Management"
      description="Configuring Bill of Materials (BOM), ingredient unit costs, and profit margins requires Manager authorization."
    >
      <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex overflow-hidden">
          {/* Left Column: Menu Items List */}
          <section className="w-80 border-r border-neutral-800 bg-neutral-900/30 flex flex-col flex-shrink-0">
            <div className="h-16 px-6 border-b border-neutral-800 flex items-center justify-between flex-shrink-0">
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Menu Recipes</h1>
                <p className="text-[10px] text-neutral-400">Select dish to configure BOM</p>
              </div>
              <button
                onClick={() => fetchData()}
                className="text-neutral-400 hover:text-white text-xs p-1.5 transition cursor-pointer"
                title="Refresh catalog"
              >
                ↻
              </button>
            </div>

            <div className="p-3 border-b border-neutral-800 bg-neutral-950/40">
              <input
                type="text"
                placeholder="Search dish or beverage..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading ? (
                <p className="text-xs text-neutral-500 text-center py-8">Loading catalog...</p>
              ) : filteredProducts.length === 0 ? (
                <p className="text-xs text-neutral-500 text-center py-8">No products found.</p>
              ) : (
                filteredProducts.map((p) => {
                  const isSelected = selectedProduct?.id === p.id;
                  const ingredientCount = bomList.filter((b) => b.product_id === p.id).length;

                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProduct(p)}
                      className={`p-3 rounded-2xl border transition cursor-pointer space-y-1.5 ${
                        isSelected
                          ? 'bg-neutral-800 border-neutral-700 text-white shadow-lg'
                          : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-400 hover:bg-neutral-800/40 hover:text-white'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold text-xs text-white truncate max-w-[170px]">
                          {p.name}
                        </h3>
                        <span className="font-mono text-xs font-bold text-emerald-400">
                          ${Number(p.selling_price).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-neutral-500 font-mono">{p.category}</span>
                        <span
                          className={`font-semibold px-2 py-0.5 rounded-full border ${
                            ingredientCount > 0
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
                              : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                          }`}
                        >
                          {ingredientCount > 0 ? `${ingredientCount} ingredients` : 'No BOM'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Right Column: Recipe BOM & COGS Breakdown */}
          {selectedProduct ? (
            <section className="flex-1 flex flex-col overflow-hidden bg-neutral-950">
              {/* Header & Metrics */}
              <div className="p-6 border-b border-neutral-800 bg-neutral-900/20 space-y-4 flex-shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-md">
                        {selectedProduct.category}
                      </span>
                      <span className="text-xs text-neutral-400">Bill of Materials (BOM)</span>
                    </div>
                    <h2 className="text-2xl font-black text-white mt-1">{selectedProduct.name}</h2>
                  </div>

                  {fetchError && (
                    <div className="p-2.5 bg-rose-950/60 border border-rose-900 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                      <span>⚠️ {fetchError}</span>
                      <button
                        onClick={() => fetchData()}
                        className="underline font-bold hover:text-white ml-2"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>

                {/* 3 Metric Cards: Selling Price, Cost of Goods (COGS), Margin */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                      Selling Price
                    </span>
                    <p className="font-mono text-2xl font-black text-white mt-1">
                      ${Number(selectedProduct.selling_price).toFixed(2)}
                    </p>
                  </div>

                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                      Recipe Cost (COGS)
                    </span>
                    <p className="font-mono text-2xl font-black text-amber-400 mt-1">
                      ${totalCogs.toFixed(2)}
                    </p>
                  </div>

                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                      Gross Profit Margin
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span
                        className={`font-mono text-2xl font-black ${
                          marginMetrics.marginPercent >= 65
                            ? 'text-emerald-400'
                            : marginMetrics.marginPercent >= 40
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {marginMetrics.marginPercent.toFixed(1)}%
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">
                        (${marginMetrics.grossProfit.toFixed(2)} profit)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ingredients Table */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm">
                  <div className="p-4 border-b border-neutral-800 bg-neutral-900/60 flex justify-between items-center">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Required Ingredients
                    </h3>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {currentRecipe.length} line items
                    </span>
                  </div>

                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-neutral-800 bg-neutral-900/40 text-neutral-400 font-medium">
                      <tr>
                        <th className="py-3 px-4">Ingredient Name</th>
                        <th className="py-3 px-4 text-center">Unit</th>
                        <th className="py-3 px-4 text-right">Unit Cost</th>
                        <th className="py-3 px-4 text-center">Quantity Required</th>
                        <th className="py-3 px-4 text-right">Line Cost ($)</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {currentRecipe.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-neutral-500 text-xs">
                            No ingredients assigned to this recipe yet. Add an ingredient below.
                          </td>
                        </tr>
                      ) : (
                        currentRecipe.map((item) => (
                          <tr key={item.bom_id} className="hover:bg-neutral-800/20 transition-colors">
                            <td className="py-3 px-4 font-bold text-white">{item.name}</td>
                            <td className="py-3 px-4 text-center font-mono text-neutral-400">
                              {item.unit}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-neutral-400">
                              ${item.unit_cost.toFixed(4)}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-white">
                              {item.quantity_required}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                              ${item.line_cost.toFixed(4)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleRemoveIngredient(item.bom_id)}
                                className="text-neutral-500 hover:text-rose-400 transition cursor-pointer px-2 py-1"
                                title="Remove ingredient from recipe"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Form: Add Ingredient to Current Recipe */}
                <form
                  onSubmit={handleAddIngredient}
                  className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 space-y-3"
                >
                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                    + Add Ingredient to Recipe
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <label className="block text-neutral-400 mb-1">Select Raw Material / Ingredient *</label>
                      <select
                        value={selectedInventoryId}
                        onChange={(e) => setSelectedInventoryId(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="">-- Choose from inventory stock --</option>
                        {inventory.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} (${Number(inv.cost_per_unit).toFixed(2)} / {inv.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-neutral-400 mb-1">Quantity Required *</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0.0001"
                        required
                        placeholder="e.g. 0.25"
                        value={quantityInput}
                        onChange={(e) => setQuantityInput(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 text-white font-mono rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {formError && (
                    <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 p-2 rounded-xl">
                      {formError}
                    </p>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isSavingBom || !selectedInventoryId}
                      className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-neutral-950 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                    >
                      {isSavingBom ? 'Saving...' : 'Add to BOM'}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs">
              Select a product from the left menu to view and configure its recipe.
            </div>
          )}
        </main>
      </div>
    </ManagerGuard>
  );
}