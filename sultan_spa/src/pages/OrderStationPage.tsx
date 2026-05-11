import { useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import MenuGrid from '../components/MenuGrid';
import LoadingSpinner from '../components/LoadingSpinner';
import IngredientModifierModal from '../components/IngredientModifierModal';
import { useCartStore } from '../stores/cartStore';
import type { MenuItem } from '../../types';
import { toast } from 'react-toastify';
import { ChefHat, LayoutGrid, CheckCircle2 } from 'lucide-react';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';

export default function OrderStationPage() {
  const {
    products,
    isLoading,
    isSearching,
    searchProducts,
    searchQuery,
    hasMore,
    loadMoreProducts,
    totalCount
  } = useProducts();

  const { addToCart, addWorkOrderRef } = useCartStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchStr, setSearchStr] = useState('');
  const [selectedItemForMods, setSelectedItemForMods] = useState<MenuItem | null>(null);
  const [processingWO, setProcessingWO] = useState(false);

  // Add barcode scanning functionality
  const { scanBarcode } = useBarcodeScanner((item: MenuItem, qty?: number) => {
    // Direct to modification modal for regular process, 
    // or could directly trigger creation? Let's dispatch with mod check first to be safe
    setSelectedItemForMods(item);
  });

  const handleAddToCartRequest = (item: MenuItem) => {
    // Open mod modal for explicit ingredient handling
    setSelectedItemForMods(item);
  };

  const dispatchInstantWorkOrder = async (item: MenuItem, mods: any[]) => {
    setProcessingWO(true);
    const id = toast.loading(`Creating kitchen work order for ${item.name}...`);
    try {
      const response = await fetch('/api/method/sultan.sultan.api.create_instant_work_order', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          "X-Frappe-CSRF-Token": (window as any).csrf_token || ""
        },
        credentials: 'include',
        body: JSON.stringify({
          item_code: item.id,
          qty: 1,
          custom_ingredients: JSON.stringify(mods)
        })
      });
      
      const result = await response.json();
      if (result.message?.status === 'success') {
        const woName: string = result.message.name;
        addWorkOrderRef(woName);
        toast.update(id, {
          render: (
            <div className="flex flex-col gap-1">
              <div className="font-semibold">👨‍🍳 Work Order dispatched to kitchen!</div>
              <div className="text-xs opacity-90">Reference: {woName}</div>
              <a
                href={`/app/work-order/${woName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs bg-white text-emerald-700 hover:bg-emerald-50 font-bold px-3 py-1.5 rounded-lg border border-emerald-200 shadow-sm transition-colors w-fit"
              >
                👁 View Work Order
              </a>
            </div>
          ),
          type: 'success',
          isLoading: false,
          autoClose: 5000
        });

        // Add to regular cart representation
        addToCart({
          id: item.id,
          name: item.name,
          category: item.category,
          price: item.price,
          available: item.available,
          uom: item.uom,
          item_code: item.id,
          is_fresh_produce: item.is_fresh_produce
        });
      } else {
         throw new Error(result.message?.message || "Failed to create work order");
      }
    } catch (error: any) {
      toast.update(id, {
        render: `Error: ${error.message || 'Failed to notify kitchen'}`,
        type: 'error',
        isLoading: false,
        autoClose: 4000
      });
    } finally {
      setProcessingWO(false);
      setSelectedItemForMods(null);
    }
  };

  const handleSearch = (val: string) => {
    setSearchStr(val);
    searchProducts(val);
  };

  const handleSearchKeyPress = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchStr.trim()) {
      // If it looks like our custom composite barcode format, force barcode processing!
      if (searchStr.includes('|')) {
        e.preventDefault();
        const success = await scanBarcode(searchStr.trim());
        if (success) {
          setSearchStr(''); // Clear clear on success
          searchProducts('');
        }
      }
    }
  };

  if (isLoading && products.length === 0) {
    return <LoadingSpinner message="Initializing ordering station..." />;
  }

  const filtered = products.filter(p => 
    selectedCategory === 'all' || p.category === selectedCategory
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Custom Header */}
      <header className="bg-white dark:bg-slate-900 shadow-sm border-b dark:border-slate-800 py-4 px-8 sticky top-0 z-30">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950 rounded-xl text-indigo-600 dark:text-indigo-300">
              <ChefHat className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Order Station</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Live Manufacturing Enabled
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-6 flex h-[calc(100vh-80px)] gap-6">
        {/* Products Area */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-sm border dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Available Items</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            <MenuGrid
              items={filtered}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              searchQuery={searchStr}
              onSearchChange={handleSearch}
              onSearchKeyPress={handleSearchKeyPress}
              onAddToCart={handleAddToCartRequest}
              onScanBarcode={() => {}} // Not strictly necessary for direct order, keep disabled
              scannerOnly={false}
              hasMore={hasMore}
              isLoadingMore={false}
              onLoadMore={loadMoreProducts}
              totalCount={totalCount}
              isSearching={isSearching}
            />
          </div>
        </div>
      </main>

      {selectedItemForMods && (
        <IngredientModifierModal
          isOpen={!!selectedItemForMods}
          onClose={() => setSelectedItemForMods(null)}
          itemCode={selectedItemForMods.id}
          itemName={selectedItemForMods.name}
          onConfirm={(mods) => dispatchInstantWorkOrder(selectedItemForMods, mods)}
        />
      )}
    </div>
  );
}
