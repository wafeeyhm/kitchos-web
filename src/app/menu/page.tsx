'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';

interface Product {
  id: string;
  name: string;
  category: string;
  selling_price: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export default function MenuCatalogPage() {
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Product Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Food');
  const [customCategory, setCustomCategory] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (error) throw error;
      setProducts((data as any) || []);
    } catch (err: any) {
      console.error('Error fetching menu items:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Unique categories for filter bar
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

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setCategory('Food');
    setCustomCategory('');
    setSellingPrice('');
    setDescription('');
    setIsActive(true);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

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
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Product name is required.');
      return;
    }

    const price = parseFloat(sellingPrice);
    if (isNaN(price) || price < 0) {
      setErrorMsg('Please enter a valid selling price.');
      return;
    }

    const finalCategory = category === 'Custom' ? customCategory.trim() || 'General' : category;

    setIsSaving(true);
    setErrorMsg(null);

    try {
      if (editingProduct) {
        // Update product
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
        // Create new product
        const { error } = await supabase.from('products').insert({
          name: name.trim(),
          category: finalCategory,
          selling_price: price,
          description: description.trim() || null,
          is_active: isActive,
        });

        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save product.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);

      if (error) throw error;
      fetchProducts();
    } catch (err: any) {
      alert(`Could not update status: ${err.message}`);
    }
  };

  return (
    <ManagerGuard
      pageTitle="Menu & Product Catalog"
      description="Creating, re-pricing, and managing restaurant menu products requires Manager authorization."
    >
      <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Menu & Product Catalog</h1>
              <p className="text-xs text-neutral-400 mt-1">
                Configure your active POS menu items, categories, pricing, and link ingredient recipes.
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
            <div className="flex gap-2 overflow-x-auto">
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
                placeholder="Search dish or beverage..."
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
                No products found. Click "+ Add Menu Product" to add your first item.
              </p>
            ) : (
              filteredProducts.map((product) => (
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
                  </div>

                  <div className="pt-3 border-t border-neutral-800/60 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-neutral-500 block">Selling Price</span>
                      <span className="font-mono text-lg font-black text-emerald-400">
                        ${Number(product.selling_price).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link
                        href="/recipes"
                        className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                        title="Configure ingredients and recipe BOM"
                      >
                        📖 Recipe
                      </Link>
                      <button
                        onClick={() => handleOpenEdit(product)}
                        className="bg-neutral-800 hover:bg-neutral-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ADD / EDIT PRODUCT MODAL */}
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {editingProduct ? 'Edit Menu Product' : 'Add New Menu Product'}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Product appears immediately on `/pos` and `/kds`.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveProduct} className="space-y-3.5 text-xs">
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
                        Selling Price ($) *
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
                      Description / Kitchen Prep Notes
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Optional notes or customer-facing description..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
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
                      Visible on Active POS Terminal Menu
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