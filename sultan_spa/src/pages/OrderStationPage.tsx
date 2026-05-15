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
import SearchBar from '../components/SearchBar';

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
                className="mt-1 inline-flex items-center gap-1 text-xs bg-white text-ziditech-700 hover:bg-ziditech-50 font-bold px-3 py-1.5 rounded-lg border border-ziditech-200 shadow-sm transition-colors w-fit"
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
    <div className="min-h-screen" style={{ backgroundColor: '#0D0033' }}>
      {/* Consolidated Station Header */}
      <header style={{ backgroundColor: 'rgba(24,8,85,0.9)', borderBottom: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }} className="py-4 px-8 sticky top-0 z-30 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl" style={{ backgroundColor: 'rgba(76,40,204,0.25)', color: '#9a88ff' }}>
            <ChefHat className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Order Station</h1>
            <p className="text-sm flex items-center gap-1" style={{ color: '#8878c8' }}>
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#7c60f5' }} /> Live Manufacturing Enabled
            </p>
          </div>
        </div>

        {/* Search integrated into main header */}
        <div className="flex-1 max-w-md mx-8">
          <SearchBar
            searchQuery={searchStr}
            onSearchChange={handleSearch}
            onSearchKeyPress={handleSearchKeyPress}
            onScanBarcode={() => {}}
          />
        </div>
      </header>

      <main className="p-6">
        {/* Simplified Items Area */}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="p-6">
            <MenuGrid
              items={filtered}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              searchQuery={searchStr}
              onSearchChange={handleSearch}
              onSearchKeyPress={handleSearchKeyPress}
              onAddToCart={handleAddToCartRequest}
              onScanBarcode={() => {}}
              scannerOnly={false}
              hasMore={hasMore}
              isLoadingMore={false}
              onLoadMore={loadMoreProducts}
              totalCount={totalCount}
              isSearching={isSearching}
              hideHeader={true} // We'll add this prop to MenuGrid to hide redundant header
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
