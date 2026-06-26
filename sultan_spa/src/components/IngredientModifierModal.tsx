import { useState, useEffect, useRef } from 'react';
import { X, Plus, Minus, Save, Loader2, Search, PackagePlus } from 'lucide-react';
import { toast } from 'react-toastify';

interface Ingredient {
  item_code: string;
  item_name: string;
  qty: number;
  uom: string;
  rate: number;
  selling_price?: number; // price for extras
  isExtra?: boolean;
}

interface SearchResult {
  item_code: string;
  item_name: string;
  uom: string;
  selling_price?: number;
}

interface Modification {
  item_code: string;
  action: 'add' | 'remove';
  qty: number;
  price?: number; // unit selling price for this mod
}

interface IngredientModifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemCode: string;
  itemName: string;
  onConfirm: (modifications: Modification[], notes: string, extraCost: number) => void;
  initialNotes?: string;
  initialMods?: string;
  posProfile?: string;
  priceList?: string;
}

export default function IngredientModifierModal({
  isOpen,
  onClose,
  itemCode,
  itemName,
  onConfirm,
  initialNotes = '',
  initialMods = '',
  posProfile = '',
  priceList = ''
}: IngredientModifierModalProps) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [modifiedQty, setModifiedQty] = useState<Record<string, number>>({});
  const [extraPrices, setExtraPrices] = useState<Record<string, number>>({}); // item_code -> selling price
  const [notes, setNotes] = useState(initialNotes);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen && itemCode) {
      fetchIngredients();
      setNotes(initialNotes);
    }
  }, [isOpen, itemCode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchIngredients = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/method/sultan.sultan.api.get_item_bom_ingredients?item_code=${encodeURIComponent(itemCode)}`);
      const data = await response.json();
      if (data.message) {
        const baseIngredients: Ingredient[] = data.message;

        // Parse previously saved modifications
        let savedMods: Modification[] = [];
        if (initialMods) {
          try { savedMods = JSON.parse(initialMods); } catch { savedMods = []; }
        }

        // Build qty map from BOM, then apply saved mods on top
        const defaults: Record<string, number> = {};
        baseIngredients.forEach((ing: Ingredient) => { defaults[ing.item_code] = ing.qty; });

        // Extras = items in savedMods with action 'add' that are NOT in BOM
        const bomCodes = new Set(baseIngredients.map(i => i.item_code));
        const extraIngredients: Ingredient[] = [];

        savedMods.forEach(mod => {
          if (mod.action === 'add') {
            if (bomCodes.has(mod.item_code)) {
              // Extra qty on existing BOM item
              defaults[mod.item_code] = (defaults[mod.item_code] || 0) + mod.qty;
            } else {
              // New extra item — we need to fetch item_name from search results or use item_code
              extraIngredients.push({
                item_code: mod.item_code,
                item_name: mod.item_code, // will be replaced below if name is available
                qty: 0,
                uom: '',
                rate: 0,
                isExtra: true,
              });
              defaults[mod.item_code] = mod.qty;
            }
          } else if (mod.action === 'remove') {
            if (bomCodes.has(mod.item_code)) {
              defaults[mod.item_code] = Math.max(0, (defaults[mod.item_code] || 0) - mod.qty);
            }
          }
        });

        setIngredients([...baseIngredients, ...extraIngredients]);
        setModifiedQty(defaults);

        // Fetch names for extra items if any
        if (extraIngredients.length > 0) {
          extraIngredients.forEach(async (extra) => {
            try {
              const res = await fetch(`/api/method/sultan.sultan.api.search_items?search_term=${encodeURIComponent(extra.item_code)}&limit=1`);
              const d = await res.json();
              const found = (d.message || []).find((i: SearchResult) => i.item_code === extra.item_code);
              if (found) {
                setIngredients(prev => prev.map(i =>
                  i.item_code === extra.item_code ? { ...i, item_name: found.item_name, uom: found.uom } : i
                ));
              }
            } catch { /* ignore */ }
          });
        }
      }
    } catch (error) {
      console.error('Failed to load ingredients:', error);
      toast.error('Failed to load item ingredients');
    } finally {
      setLoading(false);
    }
  };

  const fetchItemPrice = async (item_code: string): Promise<number> => {
    try {
      const url = `/api/method/sultan.sultan.api.get_item_price?item_code=${encodeURIComponent(item_code)}${priceList ? `&price_list=${encodeURIComponent(priceList)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      return data.message?.price_list_rate || data.message?.price || 0;
    } catch {
      return 0;
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setShowSearch(true);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!term.trim()) { setSearchResults([]); return; }
    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/method/sultan.sultan.api.search_items?search_term=${encodeURIComponent(term)}&limit=10`,
          { headers: { 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' } }
        );
        const data = await res.json();
        setSearchResults(data.message || []);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
  };

  const handleAddExtra = async (item: SearchResult) => {
    const alreadyExists = ingredients.find(i => i.item_code === item.item_code);
    if (alreadyExists) {
      setModifiedQty(prev => ({ ...prev, [item.item_code]: (prev[item.item_code] || 0) + 1 }));
      toast.info(`${item.item_name} already in list — quantity increased`);
    } else {
      // Fetch selling price
      const sellingPrice = await fetchItemPrice(item.item_code);
      setIngredients(prev => [...prev, { item_code: item.item_code, item_name: item.item_name, qty: 0, uom: item.uom, rate: 0, selling_price: sellingPrice, isExtra: true }]);
      setModifiedQty(prev => ({ ...prev, [item.item_code]: 1 }));
      setExtraPrices(prev => ({ ...prev, [item.item_code]: sellingPrice }));
      if (sellingPrice > 0) {
        toast.success(`${item.item_name} added — +${sellingPrice.toFixed(2)} per unit`);
      } else {
        toast.success(`${item.item_name} added`);
      }
    }
    setSearchTerm('');
    setSearchResults([]);
    setShowSearch(false);
  };

  const handleAdjust = (ingredientCode: string, amount: number) => {
    setModifiedQty(prev => ({ ...prev, [ingredientCode]: Math.max(0, (prev[ingredientCode] || 0) + amount) }));
  };

  const handleSave = () => {
    const finalModifications: Modification[] = [];
    let extraCost = 0;
    ingredients.forEach(ing => {
      const baseQty = ing.qty;
      const userQty = modifiedQty[ing.item_code] ?? baseQty;
      if (ing.isExtra) {
        if (userQty > 0) {
          const unitPrice = extraPrices[ing.item_code] || ing.selling_price || 0;
          finalModifications.push({ item_code: ing.item_code, action: 'add', qty: userQty, price: unitPrice });
          extraCost += unitPrice * userQty;
        }
      } else {
        if (userQty === 0) finalModifications.push({ item_code: ing.item_code, action: 'remove', qty: baseQty });
        else if (userQty > baseQty) finalModifications.push({ item_code: ing.item_code, action: 'add', qty: userQty - baseQty });
        else if (userQty < baseQty) finalModifications.push({ item_code: ing.item_code, action: 'remove', qty: baseQty - userQty });
      }
    });
    onConfirm(finalModifications, notes, extraCost);
    onClose();
  };

  if (!isOpen) return null;

  const originalIngredients = ingredients.filter(i => !i.isExtra);
  const extraIngredients = ingredients.filter(i => i.isExtra);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-gray-50 dark:bg-muted/20">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Modify Ingredients</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{itemName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search extra ingredients */}
        <div className="px-5 pt-4 pb-2 border-b border-gray-100 dark:border-gray-800" ref={searchRef}>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            <PackagePlus className="w-3.5 h-3.5 inline mr-1" />
            Add Extra Ingredient
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => handleSearch(e.target.value)}
              onFocus={() => searchTerm && setShowSearch(true)}
              placeholder="Search items to add..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition"
            />
            {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}

            {showSearch && searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map(item => (
                  <button key={item.item_code} onMouseDown={() => handleAddExtra(item)} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-between group">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-700">{item.item_name}</div>
                      <div className="text-xs text-gray-400">{item.item_code} · {item.uom}</div>
                    </div>
                    <Plus className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
            {showSearch && searchTerm && !searchLoading && searchResults.length === 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-500">
                No results found
              </div>
            )}
          </div>
        </div>

        {/* Ingredient list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mr-2" /> Loading ingredients...
            </div>
          ) : (
            <>
              {originalIngredients.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Original Ingredients</p>
                  <div className="space-y-2">
                    {originalIngredients.map((ing) => {
                      const currentQty = modifiedQty[ing.item_code] ?? ing.qty;
                      const isAdded = currentQty > ing.qty;
                      const isRemoved = currentQty < ing.qty;
                      return (
                        <div key={ing.item_code} className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${isAdded ? 'bg-green-50/60 border-green-200' : isRemoved ? 'bg-red-50/60 border-red-200' : 'border-border bg-white dark:bg-background'}`}>
                          <div>
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{ing.item_name || ing.item_code}</div>
                            <div className="text-xs text-gray-500">
                              Standard: {ing.qty} {ing.uom}
                              {isAdded && <span className="ml-2 text-green-600 font-semibold">+{(currentQty - ing.qty).toFixed(2)}</span>}
                              {isRemoved && currentQty === 0 && <span className="ml-2 text-red-600 font-semibold">Removed</span>}
                              {isRemoved && currentQty > 0 && <span className="ml-2 text-orange-500 font-semibold">-{(ing.qty - currentQty).toFixed(2)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleAdjust(ing.item_code, -0.5)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors">
                              <Minus className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
                            </button>
                            <span className="min-w-[52px] text-center font-semibold text-sm">{currentQty.toFixed(2)}</span>
                            <button onClick={() => handleAdjust(ing.item_code, 0.5)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors">
                              <Plus className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {extraIngredients.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-2 mt-4">Extra Additions</p>
                  <div className="space-y-2">
                    {extraIngredients.map((ing) => {
                      const currentQty = modifiedQty[ing.item_code] ?? 1;
                      const unitPrice = extraPrices[ing.item_code] || ing.selling_price || 0;
                      return (
                        <div key={ing.item_code} className="flex items-center justify-between p-3.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
                          <div>
                            <div className="font-medium text-sm text-blue-800 dark:text-blue-200">{ing.item_name || ing.item_code}</div>
                            <div className="text-xs text-blue-500">
                              {ing.uom} · Extra
                              {unitPrice > 0 && (
                                <span className="ml-2 font-semibold">
                                  +{unitPrice.toFixed(2)} × {currentQty} = <span className="text-blue-700 dark:text-blue-300">{(unitPrice * currentQty).toFixed(2)}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const next = Math.max(0, (modifiedQty[ing.item_code] || 1) - 1);
                                if (next === 0) {
                                  setIngredients(prev => prev.filter(i => i.item_code !== ing.item_code));
                                  setModifiedQty(prev => { const n = { ...prev }; delete n[ing.item_code]; return n; });
                                  setExtraPrices(prev => { const n = { ...prev }; delete n[ing.item_code]; return n; });
                                } else {
                                  setModifiedQty(prev => ({ ...prev, [ing.item_code]: next }));
                                }
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-blue-200 hover:bg-red-50 hover:border-red-200 transition-colors"
                            >
                              <Minus className="w-3.5 h-3.5 text-gray-600" />
                            </button>
                            <span className="min-w-[52px] text-center font-semibold text-sm text-blue-800 dark:text-blue-200">{currentQty}</span>
                            <button
                              onClick={() => setModifiedQty(prev => ({ ...prev, [ing.item_code]: (prev[ing.item_code] || 1) + 1 }))}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 hover:bg-blue-200 border border-blue-200 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5 text-blue-600" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Total extra cost */}
                  {(() => {
                    const totalExtra = extraIngredients.reduce((sum, ing) => {
                      const qty = modifiedQty[ing.item_code] || 0;
                      const price = extraPrices[ing.item_code] || ing.selling_price || 0;
                      return sum + qty * price;
                    }, 0);
                    return totalExtra > 0 ? (
                      <div className="mt-2 flex justify-end">
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-full">
                          Extra total: +{totalExtra.toFixed(2)}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {originalIngredients.length === 0 && extraIngredients.length === 0 && (
                <div className="text-center text-gray-500 py-10 text-sm">
                  No ingredients found. Use the search above to add extras.
                </div>
              )}
            </>
          )}

          {/* Notes / Description */}
          <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Kitchen Notes / Description
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="E.g., No onions, extra spicy, well done..."
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none text-sm transition"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border bg-gray-50 dark:bg-muted/20 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all inline-flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save Customization
          </button>
        </div>
      </div>
    </div>
  );
}
