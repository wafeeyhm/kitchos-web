'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';

interface Product {
  id: string;
  name: string;
  category: string;
  selling_price: number;
}

interface InventoryItem {
  id: string;
  name: string;
  unit_of_measure: string;
  quantity_in_stock: number;
}

interface RecipeLine {
  id: string;
  product_id: string;
  inventory_item_id: string;
  quantity_required: number;
  inventory_item: InventoryItem;
}

export default function RecipesPage() {
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([]);

  // Form State
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>('');
  const [quantityRequired, setQuantityRequired] = useState<string>('');
  const [savingLine, setSavingLine] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch all active products and raw inventory items
  const loadInitialData = useCallback(async () => {
    const [productsRes, inventoryRes] = await Promise.all([
      supabase.from('products').select('id, name, category, selling_price').eq('is_active', true).order('name'),
      supabase.from('inventory_items').select('id, name, unit_of_measure, quantity_in_stock').order('name'),
    ]);

    if (productsRes.data) {
      setProducts(productsRes.data);
      if (productsRes.data.length > 0 && !selectedProduct) {
        setSelectedProduct(productsRes.data[0]);
      }
    }
    if (inventoryRes.data) {
      setInventoryItems(inventoryRes.data);
    }
  }, [supabase, selectedProduct]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Fetch recipe lines whenever the selected product changes
  const fetchRecipe = useCallback(async (productId: string) => {
    setLoadingRecipe(true);
    setStatusMessage(null);
    try {
      const { data, error } = await supabase
        .from('recipe_bom')
        .select(`
          id,
          product_id,
          inventory_item_id,
          quantity_required,
          inventory_item:inventory_items (
            id,
            name,
            unit_of_measure,
            quantity_in_stock
          )
        `)
        .eq('product_id', productId);

      if (error) throw error;

      const formatted = (data || []).map((row: any) => ({
        id: row.id,
        product_id: row.product_id,
        inventory_item_id: row.inventory_item_id,
        quantity_required: Number(row.quantity_required),
        inventory_item: row.inventory_item,
      }));

      setRecipeLines(formatted);
    } catch (err: any) {
      console.error('Error fetching recipe:', err.message);
    } finally {
      setLoadingRecipe(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (selectedProduct) {
      fetchRecipe(selectedProduct.id);
    }
  }, [selectedProduct, fetchRecipe]);

  // Calculate batch yield limit based on currently mapped ingredients
  const calculatedMaxYield = useMemo(() => {
    if (recipeLines.length === 0) return 'No recipe mapped';

    const portions = recipeLines.map((line) => {
      if (line.quantity_required <= 0) return 999;
      return Math.floor(line.inventory_item.quantity_in_stock / line.quantity_required);
    });

    const lowestLimit = Math.min(...portions);
    return lowestLimit > 0 ? `${lowestLimit} portion(s) possible` : 'Depleted (0 portions)';
  }, [recipeLines]);

  // Filter available ingredients to prevent duplicate rows in form
  const unassignedIngredients = useMemo(() => {
    const assignedIds = new Set(recipeLines.map((l) => l.inventory_item_id));
    return inventoryItems.filter((i) => !assignedIds.has(i.id));
  }, [inventoryItems, recipeLines]);

  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !selectedIngredientId) return;

    const qty = parseFloat(quantityRequired);
    if (isNaN(qty) || qty <= 0) {
      setStatusMessage({ type: 'error', text: 'Enter a valid positive quantity.' });
      return;
    }

    setSavingLine(true);
    setStatusMessage(null);

    const { error } = await supabase.from('recipe_bom').insert({
      product_id: selectedProduct.id,
      inventory_item_id: selectedIngredientId,
      quantity_required: qty,
    });

    if (error) {
      setStatusMessage({ type: 'error', text: error.message });
      setSavingLine(false);
      return;
    }

    setStatusMessage({ type: 'success', text: 'Ingredient added to recipe.' });
    setSelectedIngredientId('');
    setQuantityRequired('');
    setSavingLine(false);
    fetchRecipe(selectedProduct.id);
  };

  const handleRemoveIngredient = async (lineId: string) => {
    if (!selectedProduct) return;

    const { error } = await supabase.from('recipe_bom').delete().eq('id', lineId);

    if (error) {
      setStatusMessage({ type: 'error', text: error.message });
      return;
    }

    setRecipeLines((prev) => prev.filter((line) => line.id !== lineId));
    setStatusMessage({ type: 'success', text: 'Ingredient removed.' });
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
      <div className="h-full flex-shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Column: Product Selector */}
        <section className="w-80 border-r border-neutral-800 bg-neutral-900/40 flex flex-col flex-shrink-0">
          <div className="p-5 border-b border-neutral-800 space-y-3">
            <h1 className="text-xl font-bold tracking-tight">Recipe Builder</h1>
            <input
              type="text"
              placeholder="Search dishes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/60">
            {filteredProducts.map((prod) => {
              const isSelected = selectedProduct?.id === prod.id;
              return (
                <button
                  key={prod.id}
                  onClick={() => setSelectedProduct(prod)}
                  className={`w-full text-left p-4 transition-colors flex flex-col gap-1 ${
                    isSelected
                      ? 'bg-neutral-800 border-l-4 border-emerald-500'
                      : 'hover:bg-neutral-900/60'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">
                      {prod.category}
                    </span>
                    <span className="font-mono text-xs font-semibold text-emerald-400">
                      ${prod.selling_price.toFixed(2)}
                    </span>
                  </div>
                  <h3 className={`text-sm font-medium ${isSelected ? 'text-white font-bold' : 'text-neutral-300'}`}>
                    {prod.name}
                  </h3>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right Column: Recipe BOM Configurator */}
        <section className="flex-1 flex flex-col overflow-y-auto p-8 bg-neutral-950">
          {selectedProduct ? (
            <div className="max-w-3xl space-y-6">
              {/* Product Header & Yield Insight */}
              <div className="flex justify-between items-end border-b border-neutral-800 pb-5">
                <div>
                  <span className="text-xs uppercase tracking-wider text-emerald-400 font-bold">
                    Bill of Materials (BOM)
                  </span>
                  <h2 className="text-3xl font-extrabold text-white mt-1">{selectedProduct.name}</h2>
                  <p className="text-xs text-neutral-400 mt-1">
                    Define ingredients and portion sizes deducted automatically on POS checkout.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-neutral-500 uppercase font-bold block">Current Stock Yield</span>
                  <span className="text-sm font-semibold text-emerald-400">{calculatedMaxYield}</span>
                </div>
              </div>

              {statusMessage && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium border ${
                    statusMessage.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800 text-rose-300'
                  }`}
                >
                  {statusMessage.text}
                </div>
              )}

              {/* Mapped Ingredients Table */}
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 bg-neutral-900/80 text-neutral-400 text-xs">
                    <tr>
                      <th className="py-3 px-5">Ingredient</th>
                      <th className="py-3 px-5 text-right">Required Portion</th>
                      <th className="py-3 px-5 text-right">Current Supply</th>
                      <th className="py-3 px-5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {loadingRecipe ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-neutral-500 text-xs">
                          Loading recipe lines...
                        </td>
                      </tr>
                    ) : recipeLines.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-neutral-500 text-xs">
                          No ingredients mapped to this product yet.
                        </td>
                      </tr>
                    ) : (
                      recipeLines.map((line) => (
                        <tr key={line.id} className="hover:bg-neutral-800/30 transition-colors">
                          <td className="py-3.5 px-5 font-medium text-white text-xs">
                            {line.inventory_item.name}
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono font-bold text-xs text-white">
                            {line.quantity_required}{' '}
                            <span className="text-neutral-400 uppercase text-[10px]">
                              {line.inventory_item.unit_of_measure}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono text-xs text-neutral-400">
                            {line.inventory_item.quantity_in_stock} {line.inventory_item.unit_of_measure}
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <button
                              onClick={() => handleRemoveIngredient(line.id)}
                              className="text-xs font-semibold text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add Ingredient Form */}
              <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  + Add Recipe Ingredient
                </h4>
                <form onSubmit={handleAddIngredient} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                      Raw Ingredient
                    </label>
                    <select
                      value={selectedIngredientId}
                      onChange={(e) => setSelectedIngredientId(e.target.value)}
                      required
                      className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white focus:outline-none transition-colors"
                    >
                      <option value="">Select ingredient...</option>
                      {unassignedIngredients.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.unit_of_measure})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                      Portion per Sale
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      required
                      placeholder="e.g. 1 or 0.05"
                      value={quantityRequired}
                      onChange={(e) => setQuantityRequired(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white focus:outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={savingLine || !selectedIngredientId}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-zinc-950 font-bold text-xs py-2 px-4 rounded-lg transition-colors cursor-pointer"
                    >
                      {savingLine ? 'Saving...' : 'Attach to Recipe'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500 text-sm">
              <p>Select a product on the left to configure its recipe.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}