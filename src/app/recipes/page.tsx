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
  cost_per_unit: number;
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

  // Form State (Attaching ingredient)
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>('');
  const [quantityRequired, setQuantityRequired] = useState<string>('');
  const [savingLine, setSavingLine] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manual Selling Price Edit State
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [customSellingPrice, setCustomSellingPrice] = useState<string>('');
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);

  // Target Margin & Pricing Recommendation State
  const [targetMargin, setTargetMargin] = useState<number>(70); // Standard 70% F&B margin default

  // Edit ingredient cost inline
  const [editingCostItemId, setEditingCostItemId] = useState<string | null>(null);
  const [newUnitCost, setNewUnitCost] = useState<string>('');
  const [updatingCost, setUpdatingCost] = useState(false);

  // Quick Create New Raw Ingredient Modal State
  const [isNewIngredientOpen, setIsNewIngredientOpen] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngUnit, setNewIngUnit] = useState('g');
  const [newIngStock, setNewIngStock] = useState('1000');
  const [newIngCost, setNewIngCost] = useState('0.02');
  const [newIngAlert, setNewIngAlert] = useState('100');
  const [isCreatingIngredient, setIsCreatingIngredient] = useState(false);
  const [createIngError, setCreateIngError] = useState<string | null>(null);

  // Load products and inventory items
  const loadInitialData = useCallback(async () => {
    const [productsRes, inventoryRes] = await Promise.all([
      supabase.from('products').select('id, name, category, selling_price').eq('is_active', true).order('name'),
      supabase.from('inventory_items').select('id, name, unit_of_measure, quantity_in_stock, cost_per_unit').order('name'),
    ]);

    if (productsRes.data) {
      setProducts(productsRes.data);
      if (productsRes.data.length > 0 && !selectedProduct) {
        setSelectedProduct(productsRes.data[0]);
      }
    }
    if (inventoryRes.data) {
      setInventoryItems(
        inventoryRes.data.map((item: any) => ({
          ...item,
          cost_per_unit: Number(item.cost_per_unit || 0),
        }))
      );
    }
  }, [supabase, selectedProduct]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Fetch recipe lines whenever the selected product changes
  const fetchRecipe = useCallback(async (productId: string) => {
    setLoadingRecipe(true);
    setStatusMessage(null);
    setIsEditingPrice(false);
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
            quantity_in_stock,
            cost_per_unit
          )
        `)
        .eq('product_id', productId);

      if (error) throw error;

      const formatted = (data || []).map((row: any) => ({
        id: row.id,
        product_id: row.product_id,
        inventory_item_id: row.inventory_item_id,
        quantity_required: Number(row.quantity_required),
        inventory_item: {
          ...row.inventory_item,
          cost_per_unit: Number(row.inventory_item?.cost_per_unit || 0),
        },
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
      setCustomSellingPrice(Number(selectedProduct.selling_price).toFixed(2));
    }
  }, [selectedProduct, fetchRecipe]);

  // Max yield calculation
  const calculatedMaxYield = useMemo(() => {
    if (recipeLines.length === 0) return 'No recipe mapped';

    const portions = recipeLines.map((line) => {
      if (line.quantity_required <= 0) return 999;
      return Math.floor(line.inventory_item.quantity_in_stock / line.quantity_required);
    });

    const lowestLimit = Math.min(...portions);
    return lowestLimit > 0 ? `${lowestLimit} portion(s) available` : 'Depleted (0 portions)';
  }, [recipeLines]);

  // COGS and Margin Calculations
  const cogsAnalysis = useMemo(() => {
    if (!selectedProduct) return { totalCogs: 0, grossProfit: 0, marginPercent: 0, recommendedPrice: 0 };

    const totalCogs = recipeLines.reduce((sum, line) => {
      const lineCost = line.quantity_required * (line.inventory_item.cost_per_unit || 0);
      return sum + lineCost;
    }, 0);

    const price = Number(selectedProduct.selling_price) || 0;
    const grossProfit = price - totalCogs;
    const marginPercent = price > 0 ? (grossProfit / price) * 100 : 0;

    // Recommended Price Formula: COGS / (1 - TargetMargin / 100)
    const marginDecimal = Math.min(0.95, Math.max(0.05, targetMargin / 100));
    const recommendedPrice = totalCogs > 0 ? totalCogs / (1 - marginDecimal) : price;

    return { totalCogs, grossProfit, marginPercent, recommendedPrice };
  }, [selectedProduct, recipeLines, targetMargin]);

  // Filter available ingredients to prevent duplicates in dropdown
  const unassignedIngredients = useMemo(() => {
    const assignedIds = new Set(recipeLines.map((l) => l.inventory_item_id));
    return inventoryItems.filter((i) => !assignedIds.has(i.id));
  }, [inventoryItems, recipeLines]);

  // Handler: Update Selling Price (Manual or Recommended)
  const handleSaveSellingPrice = async (priceToApply: number) => {
    if (!selectedProduct) return;

    if (isNaN(priceToApply) || priceToApply <= 0) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid price greater than $0.00' });
      return;
    }

    setIsUpdatingPrice(true);
    setStatusMessage(null);

    const formattedPrice = parseFloat(priceToApply.toFixed(2));

    const { error } = await supabase
      .from('products')
      .update({ selling_price: formattedPrice })
      .eq('id', selectedProduct.id);

    if (error) {
      setStatusMessage({ type: 'error', text: `Failed to update price: ${error.message}` });
    } else {
      // Update local state
      const updatedProduct = { ...selectedProduct, selling_price: formattedPrice };
      setSelectedProduct(updatedProduct);
      setProducts((prev) =>
        prev.map((p) => (p.id === selectedProduct.id ? { ...p, selling_price: formattedPrice } : p))
      );
      setCustomSellingPrice(formattedPrice.toFixed(2));
      setIsEditingPrice(false);
      setStatusMessage({
        type: 'success',
        text: `Selling price for "${selectedProduct.name}" updated to $${formattedPrice.toFixed(2)}.`,
      });
    }

    setIsUpdatingPrice(false);
  };

  // Handler: Create Brand New Raw Ingredient
  const handleCreateNewIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngName.trim()) return;

    setIsCreatingIngredient(true);
    setCreateIngError(null);

    const stock = parseFloat(newIngStock) || 0;
    const cost = parseFloat(newIngCost) || 0;
    const alertThreshold = parseFloat(newIngAlert) || 10;

    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert({
          name: newIngName.trim(),
          unit_of_measure: newIngUnit.trim().toLowerCase(),
          quantity_in_stock: stock,
          cost_per_unit: cost,
          low_stock_alert: alertThreshold,
        })
        .select('id, name, unit_of_measure, quantity_in_stock, cost_per_unit')
        .single();

      if (error) throw error;

      const createdItem: InventoryItem = {
        id: data.id,
        name: data.name,
        unit_of_measure: data.unit_of_measure,
        quantity_in_stock: Number(data.quantity_in_stock),
        cost_per_unit: Number(data.cost_per_unit),
      };

      setInventoryItems((prev) => [...prev, createdItem].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedIngredientId(data.id);
      setIsNewIngredientOpen(false);

      setNewIngName('');
      setNewIngUnit('g');
      setNewIngStock('1000');
      setNewIngCost('0.02');
      setStatusMessage({ type: 'success', text: `Created ingredient "${data.name}". Selected in form below.` });
    } catch (err: any) {
      console.error('Error creating ingredient:', err);
      setCreateIngError(err.message || 'Failed to create ingredient.');
    } finally {
      setIsCreatingIngredient(false);
    }
  };

  // Handler: Attach Ingredient to Current Product Recipe
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

  // Handler: Remove Recipe Line
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

  // Handler: Inline Cost Edit
  const handleUpdateUnitCost = async (itemId: string) => {
    const parsedCost = parseFloat(newUnitCost);
    if (isNaN(parsedCost) || parsedCost < 0) {
      setStatusMessage({ type: 'error', text: 'Enter a valid cost.' });
      return;
    }

    setUpdatingCost(true);
    const { error } = await supabase
      .from('inventory_items')
      .update({ cost_per_unit: parsedCost })
      .eq('id', itemId);

    if (error) {
      setStatusMessage({ type: 'error', text: error.message });
    } else {
      setStatusMessage({ type: 'success', text: 'Ingredient cost updated.' });
      setEditingCostItemId(null);
      setNewUnitCost('');
      loadInitialData();
      if (selectedProduct) fetchRecipe(selectedProduct.id);
    }
    setUpdatingCost(false);
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
            <h1 className="text-xl font-bold tracking-tight">Recipe & Pricing</h1>
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
                  className={`w-full text-left p-4 transition-colors flex flex-col gap-1 cursor-pointer ${
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

        {/* Right Column: Recipe BOM Configurator, Price Fixer, & Margin Analytics */}
        <section className="flex-1 flex flex-col overflow-y-auto p-8 bg-neutral-950">
          {selectedProduct ? (
            <div className="max-w-4xl space-y-6">
              {/* Product Header & Yield Insight */}
              <div className="flex justify-between items-end border-b border-neutral-800 pb-5">
                <div>
                  <span className="text-xs uppercase tracking-wider text-emerald-400 font-bold">
                    Pricing & Bill of Materials
                  </span>
                  <h2 className="text-3xl font-extrabold text-white mt-1">{selectedProduct.name}</h2>
                  <p className="text-xs text-neutral-400 mt-1">
                    Manage food costs, fix selling price, and set profit targets.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-neutral-500 uppercase font-bold block">Current Stock Yield</span>
                  <span className="text-sm font-semibold text-emerald-400">{calculatedMaxYield}</span>
                </div>
              </div>

              {/* Target Margin Selector Toolbar */}
              <div className="flex items-center justify-between bg-neutral-900/40 border border-neutral-800 rounded-xl p-3 px-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Target Margin:
                  </span>
                  <div className="flex gap-1.5">
                    {[60, 65, 70, 75, 80].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setTargetMargin(pct)}
                        className={`text-xs px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                          targetMargin === pct
                            ? 'bg-emerald-500 text-neutral-950'
                            : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-400">Custom Target:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="5"
                      max="95"
                      value={targetMargin}
                      onChange={(e) => setTargetMargin(Math.max(1, Math.min(95, parseFloat(e.target.value) || 0)))}
                      className="w-14 bg-neutral-950 border border-neutral-800 rounded px-2 py-0.5 text-xs text-white font-mono text-center focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs font-mono text-neutral-500">%</span>
                  </div>
                </div>
              </div>

              {/* COGS & Profit Margin Dashboard Cards */}
              <div className="grid grid-cols-4 gap-4">
                {/* 1. Active Selling Price (Editable) */}
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">
                      Current Price
                    </span>
                    {!isEditingPrice && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomSellingPrice(selectedProduct.selling_price.toFixed(2));
                          setIsEditingPrice(true);
                        }}
                        className="text-[11px] text-neutral-500 hover:text-emerald-400 transition cursor-pointer"
                        title="Edit Selling Price"
                      >
                        ✎ Edit
                      </button>
                    )}
                  </div>

                  {isEditingPrice ? (
                    <div className="mt-1 space-y-2">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-sm text-neutral-500">$</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0.1"
                          autoFocus
                          value={customSellingPrice}
                          onChange={(e) => setCustomSellingPrice(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={isUpdatingPrice}
                          onClick={() => handleSaveSellingPrice(parseFloat(customSellingPrice))}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-[10px] font-bold py-1 rounded transition cursor-pointer"
                        >
                          {isUpdatingPrice ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingPrice(false)}
                          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] px-2 py-1 rounded transition cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="font-mono text-2xl font-black text-white">
                        ${selectedProduct.selling_price.toFixed(2)}
                      </p>
                      <span className="text-[10px] text-neutral-500">Live POS price</span>
                    </div>
                  )}
                </div>

                {/* 2. Recipe COGS */}
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block mb-1">
                    Food Cost (COGS)
                  </span>
                  <p className="font-mono text-2xl font-black text-amber-400">
                    ${cogsAnalysis.totalCogs.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-neutral-500">
                    {cogsAnalysis.totalCogs > 0
                      ? `${((cogsAnalysis.totalCogs / selectedProduct.selling_price) * 100).toFixed(1)}% of price`
                      : 'No ingredients'}
                  </span>
                </div>

                {/* 3. Recommended Price with 1-Click Apply */}
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">
                        Recommended
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">@{targetMargin}%</span>
                    </div>
                    <p className="font-mono text-2xl font-black text-emerald-400">
                      ${cogsAnalysis.recommendedPrice.toFixed(2)}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={
                      isUpdatingPrice ||
                      cogsAnalysis.totalCogs === 0 ||
                      Math.abs(selectedProduct.selling_price - cogsAnalysis.recommendedPrice) < 0.01
                    }
                    onClick={() => handleSaveSellingPrice(cogsAnalysis.recommendedPrice)}
                    className="mt-2 w-full text-[10px] font-bold uppercase tracking-wider py-1.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    Apply Recommended
                  </button>
                </div>

                {/* 4. Gross Margin % */}
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block mb-1">
                    Current Margin
                  </span>
                  <div className="flex items-baseline gap-2">
                    <p
                      className={`font-mono text-2xl font-black ${
                        cogsAnalysis.marginPercent >= targetMargin
                          ? 'text-emerald-400'
                          : cogsAnalysis.marginPercent >= 40
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {cogsAnalysis.marginPercent.toFixed(1)}%
                    </p>
                    <span className="text-[10px] text-neutral-500 font-medium">
                      {cogsAnalysis.marginPercent >= targetMargin ? 'Target Met' : 'Under Target'}
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    Profit: ${cogsAnalysis.grossProfit.toFixed(2)} / dish
                  </span>
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

              {/* Mapped Ingredients & Cost Table */}
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-800 bg-neutral-900/80 text-neutral-400 text-xs font-medium">
                    <tr>
                      <th className="py-3 px-5">Ingredient</th>
                      <th className="py-3 px-5 text-right">Portion</th>
                      <th className="py-3 px-5 text-right">Raw Unit Cost</th>
                      <th className="py-3 px-5 text-right">Line Cost</th>
                      <th className="py-3 px-5 text-right">Supply</th>
                      <th className="py-3 px-5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {loadingRecipe ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-neutral-500 text-xs">
                          Loading recipe lines...
                        </td>
                      </tr>
                    ) : recipeLines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-neutral-500 text-xs">
                          No ingredients mapped to this product yet.
                        </td>
                      </tr>
                    ) : (
                      recipeLines.map((line) => {
                        const lineCost = line.quantity_required * (line.inventory_item.cost_per_unit || 0);
                        const isEditingCost = editingCostItemId === line.inventory_item.id;

                        return (
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

                            {/* Raw Unit Cost */}
                            <td className="py-3.5 px-5 text-right font-mono text-xs">
                              {isEditingCost ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    autoFocus
                                    value={newUnitCost}
                                    onChange={(e) => setNewUnitCost(e.target.value)}
                                    placeholder={line.inventory_item.cost_per_unit.toString()}
                                    className="w-20 bg-neutral-950 border border-neutral-700 px-2 py-1 text-xs rounded text-white font-mono focus:border-emerald-500 focus:outline-none"
                                  />
                                  <button
                                    onClick={() => handleUpdateUnitCost(line.inventory_item.id)}
                                    disabled={updatingCost}
                                    className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-black px-2 py-1 rounded font-bold cursor-pointer"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => setEditingCostItemId(null)}
                                    className="text-[10px] text-neutral-400 hover:text-white px-1 cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingCostItemId(line.inventory_item.id);
                                    setNewUnitCost(line.inventory_item.cost_per_unit.toString());
                                  }}
                                  title="Click to edit raw unit cost"
                                  className="hover:underline text-neutral-300 font-mono group cursor-pointer"
                                >
                                  ${line.inventory_item.cost_per_unit.toFixed(3)}{' '}
                                  <span className="text-[10px] text-neutral-500 group-hover:text-emerald-400">
                                    ✎
                                  </span>
                                </button>
                              )}
                            </td>

                            {/* Calculated Line Cost */}
                            <td className="py-3.5 px-5 text-right font-mono font-bold text-xs text-amber-400">
                              ${lineCost.toFixed(3)}
                            </td>

                            {/* Current Supply */}
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
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add Ingredient Section */}
              <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    + Add Recipe Ingredient
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateIngError(null);
                      setIsNewIngredientOpen(true);
                    }}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 border border-emerald-800/50 hover:border-emerald-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    + Create New Raw Ingredient
                  </button>
                </div>

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
                          {item.name} (${Number(item.cost_per_unit).toFixed(3)} / {item.unit_of_measure})
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
                      min="0.0001"
                      required
                      placeholder="e.g. 1 or 18 or 150"
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
              <p>Select a product on the left to configure ingredients and analyze COGS.</p>
            </div>
          )}
        </section>
      </main>

      {/* QUICK CREATE NEW RAW INGREDIENT MODAL */}
      {isNewIngredientOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="border-b border-neutral-800 pb-3">
              <h3 className="text-lg font-bold text-white">Create New Raw Ingredient</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Add an ingredient to your inventory and set its unit cost.
              </p>
            </div>

            {createIngError && (
              <div className="p-3 bg-rose-950/40 border border-rose-900 text-rose-300 rounded-lg text-xs">
                {createIngError}
              </div>
            )}

            <form onSubmit={handleCreateNewIngredient} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Ingredient Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Espresso Beans, Fresh Milk, Condensed Milk"
                  value={newIngName}
                  onChange={(e) => setNewIngName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Unit of Measure
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. g, ml, pcs, shots"
                    value={newIngUnit}
                    onChange={(e) => setNewIngUnit(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Cost per Unit ($)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    placeholder="e.g. 0.025"
                    value={newIngCost}
                    onChange={(e) => setNewIngCost(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Initial Stock Count
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="e.g. 1000"
                    value={newIngStock}
                    onChange={(e) => setNewIngStock(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Low Stock Alert
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 100"
                    value={newIngAlert}
                    onChange={(e) => setNewIngAlert(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  disabled={isCreatingIngredient}
                  onClick={() => setIsNewIngredientOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800/60 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingIngredient}
                  className="px-4 py-2 text-xs font-bold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingIngredient ? 'Creating...' : 'Create & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}