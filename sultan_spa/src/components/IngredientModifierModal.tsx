import { useState, useEffect } from 'react';
import { X, Plus, Minus, Save, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';

interface Ingredient {
  item_code: string;
  item_name: string;
  qty: number;
  uom: string;
  rate: number;
}

interface Modification {
  item_code: string;
  action: 'add' | 'remove';
  qty: number;
}

interface IngredientModifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemCode: string;
  itemName: string;
  onConfirm: (modifications: Modification[], notes: string) => void;
  initialNotes?: string;
}

export default function IngredientModifierModal({
  isOpen,
  onClose,
  itemCode,
  itemName,
  onConfirm,
  initialNotes = ''
}: IngredientModifierModalProps) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [modifiedQty, setModifiedQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState(initialNotes);

  useEffect(() => {
    if (isOpen && itemCode) {
      fetchIngredients();
    }
  }, [isOpen, itemCode]);

  const fetchIngredients = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/method/sultan.sultan.api.get_item_bom_ingredients?item_code=${encodeURIComponent(itemCode)}`);
      const data = await response.json();
      if (data.message) {
        setIngredients(data.message);
        // Set baseline quantities
        const defaults: Record<string, number> = {};
        data.message.forEach((ing: Ingredient) => {
          defaults[ing.item_code] = ing.qty;
        });
        setModifiedQty(defaults);
      }
    } catch (error) {
      console.error('Failed to load ingredients:', error);
      toast.error('Failed to load item ingredients');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = (ingredientCode: string, amount: number) => {
    setModifiedQty(prev => {
      const current = prev[ingredientCode] || 0;
      const next = Math.max(0, current + amount);
      return { ...prev, [ingredientCode]: next };
    });
  };

  const handleSave = () => {
    const finalModifications: Modification[] = [];
    
    ingredients.forEach(ing => {
      const baseQty = ing.qty;
      const userQty = modifiedQty[ing.item_code];
      
      if (userQty === 0) {
        finalModifications.push({ item_code: ing.item_code, action: 'remove', qty: baseQty });
      } else if (userQty > baseQty) {
        finalModifications.push({ item_code: ing.item_code, action: 'add', qty: userQty - baseQty });
      } else if (userQty < baseQty) {
        // Treated as relative remove in logic
         finalModifications.push({ item_code: ing.item_code, action: 'remove', qty: baseQty - userQty });
      }
    });

    onConfirm(finalModifications, notes);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-border max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border bg-gray-50 dark:bg-muted/20">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Modify Ingredients</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{itemName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mr-2" /> Loading ingredients...
            </div>
          ) : ingredients.length === 0 ? (
            <div className="text-center text-gray-500 py-12">No modifiable ingredients found.</div>
          ) : (
            <div className="space-y-4">
              {ingredients.map((ing) => {
                const currentQty = modifiedQty[ing.item_code] ?? ing.qty;
                const isAdded = currentQty > ing.qty;
                const isRemoved = currentQty < ing.qty;

                return (
                  <div key={ing.item_code} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${isAdded ? 'bg-ziditech-50/50 dark:bg-ziditech-900/20 border-ziditech-200 dark:border-ziditech-800' : isRemoved ? 'bg-red-50/50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'border-border bg-white dark:bg-background'}`}>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{ing.item_name || ing.item_code}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Standard: {ing.qty} {ing.uom}</div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleAdjust(ing.item_code, -0.5)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                      >
                        <Minus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      </button>
                      
                      <span className="min-w-[60px] text-center font-semibold text-foreground">
                        {currentQty.toFixed(2)}
                      </span>

                      <button 
                        onClick={() => handleAdjust(ing.item_code, 0.5)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                      >
                        <Plus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Custom Notes Section */}
          <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Kitchen Notes / Remarks
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="E.g., No onions, extra spicy, well done..."
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-ziditech-500 focus:border-transparent resize-none"
              rows={3}
            />
          </div>
        </div>

        <div className="p-6 border-t border-border bg-gray-50 dark:bg-muted/20 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-white dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2.5 bg-ziditech-600 text-white rounded-xl font-medium hover:bg-ziditech-700 transition-all inline-flex items-center"
          >
            <Save className="w-4 h-4 mr-2" /> Save Customization
          </button>
        </div>
      </div>
    </div>
  );
}
