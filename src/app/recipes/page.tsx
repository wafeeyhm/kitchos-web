'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';

interface InventoryItem {
  id: string;
  name: string;
  unit_of_measure: string;
  package_unit?: string;
  package_size?: number;
  purchase_price?: number;
  cost_per_unit: number;
}

interface BomItem {
  id: string;
  inventory_item_id: string;
  quantity_required: number;
  inventory_item?: InventoryItem;
}

interface Product {
  id: string;
  name: string;
  category: string;
  selling_price: number;
  is_active: boolean;
  recipe_bom?: BomItem[];
}

export default function RecipesPage() {
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  // BOM Form State
  const [bomItems, setBomItems] = useState<BomItem[]>([]);
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [qtyRequired, setQtyRequired] = useState('1');
  const [isSavingBom, setIsSavingBom] = useState(false);

  // Price & Target Margin Calculator
  const [targetMargin, setTargetMargin] = useState<number>(70);
  const [newSellingPrice, setNewSellingPrice] = useState<string>('');
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);

  // Packaging-to-Portion Raw Ingredient Modal State
  const [isNewIngredientOpen, setIsNewIngredientOpen] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngPackageUnit, setNewIngPackageUnit] = useState('Bag');
  const [newIngPurchasePrice, setNewIngPurchasePrice] = useState('18.00');
  const [newIngPackageSize, setNewIngPackageSize] = useState('1000');
  const [newIngUnit, setNewIngUnit] = useState('g');
  const [isSavingIngredient, setIsSavingIngredient] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [prodRes, invRes, bomRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('recipe_bom').select('id, product_id, inventory_item_id, quantity_required'),
      ]);

      if (invRes.data) setInventory(invRes.data);

      if (prodRes.data && invRes.data) {
        const invMap = new Map(invRes.data.map((i: any) => [i.id, i]));
        const bomMap = new Map<string, BomItem[]>();

        if (bomRes.data) {
          bomRes.data.forEach((b: any) => {
            const list = bomMap.get(b.product_id) || [];
            list.push({
              id: b.id,
              inventory_item_id: b.inventory_item_id,
              quantity_required: Number(b.quantity_required),
              inventory_item: invMap.get(b.inventory_item_id),
            });
            bomMap.set(b.product_id, list);
          });
        }

        const formattedProducts = prodRes.data.map((p: any) => ({
          ...p,
          selling_price: Number(p.selling_price || 0),
          recipe_bom: bomMap.get(p.id) || [],
        }));

        setProducts(formattedProducts);
        if (formattedProducts.length > 0 && !selectedProduct) {
          setSelectedProduct(formattedProducts[0]);
          setNewSellingPrice(formattedProducts[0].selling_price.toString());
        } else if (selectedProduct) {
          const updatedCurrent = formattedProducts.find((p) => p.id === selectedProduct.id);
          if (updatedCurrent) {
            setSelectedProduct(updatedCurrent);
            setNewSellingPrice(updatedCurrent.selling_price.toString());
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching recipes:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedProduct?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedProduct) {
      setBomItems(selectedProduct.recipe_bom || []);
      setNewSellingPrice(selectedProduct.selling_price.toString());
    }
  }, [selectedProduct]);

  // Live Unit Cost calculation for the inline ingredient modal
  const computedModalUnitCost = useMemo(() => {
    const price = parseFloat(newIngPurchasePrice) || 0;
    const size = parseFloat(newIngPackageSize) || 1;
    return size > 0 ? price / size : 0;
  }, [newIngPurchasePrice, newIngPackageSize]);

  // Current Recipe COGS
  const currentCogs = useMemo(() => {
    return bomItems.reduce((sum, item) => {
      const unitCost = Number(item.inventory_item?.cost_per_unit || 0);
      return sum + item.quantity_required * unitCost;
    }, 0);
  }, [bomItems]);

  const currentPrice = selectedProduct?.selling_price || 0;
  const currentGrossProfit = currentPrice - currentCogs;
  const currentMarginPercent = currentPrice > 0 ? (currentGrossProfit / currentPrice) * 100 : 0;

  // Target Margin Recommendation
  const recommendedPrice = useMemo(() => {
    const marginDecimal = targetMargin / 100;
    if (marginDecimal >= 1) return currentCogs * 2;
    return currentCogs / (1 - marginDecimal);
  }, [currentCogs, targetMargin]);

  // Add BOM Ingredient Line
  const handleAddBomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !selectedIngredientId) return;

    setIsSavingBom(true);
    try {
      const { error } = await supabase.from('recipe_bom').insert({
        product_id: selectedProduct.id,
        inventory_item_id: selectedIngredientId,
        quantity_required: parseFloat(qtyRequired) || 1,
      });

      if (error) throw error;
      setQtyRequired('1');
      fetchData();
    } catch (err: any) {
      alert(`Failed to add ingredient: ${err.message}`);
    } finally {
      setIsSavingBom(false);
    }
  };

  // Remove BOM Line
  const handleRemoveBomItem = async (bomId: string) => {
    try {
      const { error } = await supabase.from('recipe_bom').delete().eq('id', bomId);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Failed to remove item: ${err.message}`);
    }
  };

  // Update Selling Price
  const handleUpdatePrice = async () => {
    if (!selectedProduct) return;
    const priceVal = parseFloat(newSellingPrice);
    if (isNaN(priceVal) || priceVal < 0) return;

    setIsUpdatingPrice(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ selling_price: priceVal })
        .eq('id', selectedProduct.id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Failed to update price: ${err.message}`);
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  // Create Ingredient with Bulk Packaging -> Portion Unit Cost Auto-Calculation
  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngName.trim()) return;

    setIsSavingIngredient(true);
    try {
      const price = parseFloat(newIngPurchasePrice) || 0;
      const size = parseFloat(newIngPackageSize) || 1;
      const calculatedUnitCost = size > 0 ? price / size : 0;

      const { data, error } = await supabase
        .from('inventory_items')
        .insert({
          name: newIngName.trim(),
          package_unit: newIngPackageUnit.trim(),
          purchase_price: price,
          package_size: size,
          unit_of_measure: newIngUnit,
          cost_per_unit: calculatedUnitCost,
          quantity_in_stock: size,
          low_stock_alert: Math.round(size * 0.15) || 10,
        })
        .select('id')
        .single();

      if (error) throw error;

      setIsNewIngredientOpen(false);
      setNewIngName('');
      setSelectedIngredientId(data.id);
      fetchData();
    } catch (err: any) {
      alert(`Failed to create ingredient: ${err.message}`);
    } finally {
      setIsSavingIngredient(false);
    }
  };

  return (
    <ManagerGuard
      pageTitle="Recipes & COGS Costing"
      description="Recipe formulations, target profit margins, and ingredient pricing are restricted to Managers."
    >
      <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex overflow-hidden">
          {/* Left Column: Dish Selector List */}
          <section className="w-80 border-r border-neutral-800 bg-neutral-900/30 flex flex-col flex-shrink-0">
            <div className="h-16 px-6 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Menu Recipes</h1>
                <p className="text-[10px] text-neutral-400">Select dish to configure BOM specs</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {loading ? (
                <p className="text-xs text-neutral-500 text-center py-8">Loading dishes...</p>
              ) : (
                products.map((p) => {
                  const isSelected = selectedProduct?.id === p.id;
                  const cogs = (p.recipe_bom || []).reduce(
                    (sum, item) =>
                      sum +
                      item.quantity_required * Number(item.inventory_item?.cost_per_unit || 0),
                    0
                  );
                  const margin =
                    p.selling_price > 0 ? ((p.selling_price - cogs) / p.selling_price) * 100 : 0;

                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProduct(p)}
                      className={`w-full text-left p-3 rounded-xl border transition cursor-pointer flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-neutral-800 border-neutral-700 text-white shadow'
                          : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-300 hover:bg-neutral-800/50 hover:text-white'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-xs truncate pr-2">{p.name}</span>
                        <span className="font-mono text-xs font-bold text-emerald-400">
                          ${p.selling_price.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-neutral-400 font-mono">
                        <span>COGS: ${cogs.toFixed(2)}</span>
                        <span
                          className={
                            margin < 60 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'
                          }
                        >
                          {margin.toFixed(0)}% margin
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Right Column: Recipe BOM & Margin Intelligence */}
          {selectedProduct ? (
            <section className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
                <div>
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    {selectedProduct.category} Recipe Specification
                  </span>
                  <h2 className="text-2xl font-black text-white mt-0.5">{selectedProduct.name}</h2>
                </div>

                <div className="flex items-center gap-3">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 flex items-center gap-3">
                    <span className="text-xs text-neutral-400">Selling Price:</span>
                    <input
                      type="number"
                      step="0.05"
                      value={newSellingPrice}
                      onChange={(e) => setNewSellingPrice(e.target.value)}
                      className="w-20 bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1 font-mono text-sm font-bold text-white text-right focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={handleUpdatePrice}
                      disabled={isUpdatingPrice}
                      className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>

              {/* Financial Breakdown Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Recipe COGS
                  </span>
                  <p className="font-mono text-2xl font-black text-white">${currentCogs.toFixed(2)}</p>
                  <span className="text-[10px] text-neutral-500">Total raw ingredient cost</span>
                </div>

                <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Gross Profit
                  </span>
                  <p className="font-mono text-2xl font-black text-emerald-400">
                    ${currentGrossProfit.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-neutral-500">Price minus COGS</span>
                </div>

                <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Gross Margin %
                  </span>
                  <p
                    className={`font-mono text-2xl font-black ${
                      currentMarginPercent < 60 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {currentMarginPercent.toFixed(1)}%
                  </p>
                  <span className="text-[10px] text-neutral-500">
                    {currentMarginPercent < 60 ? '⚠️ Below 60% target' : '✅ Optimal margin'}
                  </span>
                </div>

                <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Target Margin
                    </span>
                    <select
                      value={targetMargin}
                      onChange={(e) => setTargetMargin(Number(e.target.value))}
                      className="bg-neutral-950 border border-neutral-800 text-[10px] text-emerald-400 rounded px-1.5 py-0.5 font-bold cursor-pointer"
                    >
                      <option value={60}>60%</option>
                      <option value={70}>70%</option>
                      <option value={75}>75%</option>
                      <option value={80}>80%</option>
                    </select>
                  </div>
                  <p className="font-mono text-2xl font-black text-amber-300">
                    ${recommendedPrice.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-neutral-500">Recommended menu price</span>
                </div>
              </div>

              {/* BOM Formulation Table */}
              <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Bill of Materials (BOM) & Portion Depletion Specs
                  </h3>
                  <button
                    onClick={() => {
                      setNewIngName('');
                      setNewIngPurchasePrice('18.00');
                      setNewIngPackageSize('1000');
                      setNewIngPackageUnit('Bag');
                      setNewIngUnit('g');
                      setIsNewIngredientOpen(true);
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                  >
                    + Create Raw Ingredient
                  </button>
                </div>

                {/* Add Ingredient Form */}
                <form
                  onSubmit={handleAddBomItem}
                  className="flex gap-3 bg-neutral-950 p-3 rounded-xl border border-neutral-800"
                >
                  <div className="flex-1">
                    <select
                      value={selectedIngredientId}
                      onChange={(e) => setSelectedIngredientId(e.target.value)}
                      required
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="">Select Raw Ingredient from Inventory...</option>
                      {inventory.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name} (${Number(inv.cost_per_unit || 0).toFixed(4)} / {inv.unit_of_measure})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-32">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      required
                      placeholder="Qty required"
                      value={qtyRequired}
                      onChange={(e) => setQtyRequired(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingBom}
                    className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs px-4 py-2 rounded-lg transition cursor-pointer"
                  >
                    Add to BOM
                  </button>
                </form>

                {/* BOM Items Table */}
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-800 text-neutral-400 font-medium">
                    <tr>
                      <th className="py-3 px-4">Raw Material / Ingredient</th>
                      <th className="py-3 px-4 text-center">Quantity Required</th>
                      <th className="py-3 px-4 text-right">Unit Cost</th>
                      <th className="py-3 px-4 text-right">Line Cost</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {bomItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-neutral-500">
                          No ingredients mapped to this recipe yet.
                        </td>
                      </tr>
                    ) : (
                      bomItems.map((item) => {
                        const unitCost = Number(item.inventory_item?.cost_per_unit || 0);
                        const lineCost = item.quantity_required * unitCost;

                        return (
                          <tr key={item.id} className="hover:bg-neutral-800/20">
                            <td className="py-3 px-4 font-semibold text-white">
                              {item.inventory_item?.name || 'Unknown Item'}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-neutral-300">
                              {item.quantity_required} {item.inventory_item?.unit_of_measure}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-neutral-400">
                              ${unitCost.toFixed(4)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                              ${lineCost.toFixed(4)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleRemoveBomItem(item.id)}
                                className="text-neutral-500 hover:text-rose-400 text-xs px-2 py-1 transition cursor-pointer"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs">
              Select a recipe from the sidebar to begin.
            </div>
          )}

          {/* BULK PACKAGING TO PORTION AUTO-COGS MODAL */}
          {isNewIngredientOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">Create Raw Ingredient</h3>
                    <p className="text-xs text-neutral-400">
                      Specify wholesale purchase packaging to auto-derive recipe portion costs
                    </p>
                  </div>
                  <button
                    onClick={() => setIsNewIngredientOpen(false)}
                    className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateIngredient} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">
                      Ingredient Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Arabica Espresso Beans, Whole Milk"
                      value={newIngName}
                      onChange={(e) => setNewIngName(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-2.5">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                      Wholesale Packaging to Portion Conversion
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-neutral-400 mb-1">Package Unit Name</label>
                        <input
                          type="text"
                          placeholder="e.g. 1kg Bag, Carton"
                          value={newIngPackageUnit}
                          onChange={(e) => setNewIngPackageUnit(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-neutral-400 mb-1">Wholesale Purchase Price ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={newIngPurchasePrice}
                          onChange={(e) => setNewIngPurchasePrice(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-neutral-400 mb-1">Package Net Quantity</label>
                        <input
                          type="number"
                          step="any"
                          min="0.1"
                          required
                          placeholder="1000"
                          value={newIngPackageSize}
                          onChange={(e) => setNewIngPackageSize(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-neutral-400 mb-1">Recipe Portion Unit</label>
                        <select
                          value={newIngUnit}
                          onChange={(e) => setNewIngUnit(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-white"
                        >
                          <option value="g">Grams (g)</option>
                          <option value="ml">Milliliters (ml)</option>
                          <option value="pcs">Pieces (pcs)</option>
                          <option value="shots">Shots</option>
                          <option value="kg">Kilograms (kg)</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-neutral-900 flex justify-between items-center text-neutral-400">
                      <span>Derived Portion Cost:</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        ${computedModalUnitCost.toFixed(4)} / {newIngUnit}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setIsNewIngredientOpen(false)}
                      className="px-3.5 py-2 text-neutral-400 hover:text-white bg-neutral-800 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingIngredient}
                      className="px-4 py-2 font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition cursor-pointer"
                    >
                      {isSavingIngredient ? 'Saving...' : 'Save & Link to Recipe'}
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