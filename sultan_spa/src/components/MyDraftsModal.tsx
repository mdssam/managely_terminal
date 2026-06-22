import React, { useEffect, useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
import { getMyUnpaidDrafts } from '../services/salesInvoice';
import { formatCurrency } from '../utils/currency';
import { usePOSDetails } from '../hooks/usePOSProfile';

interface MyDraftsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDraft: (draftId: string) => void;
}

export default function MyDraftsModal({ isOpen, onClose, onSelectDraft }: MyDraftsModalProps) {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { posDetails } = usePOSDetails();
  const currency = posDetails?.currency || 'EGP';

  useEffect(() => {
    if (isOpen) {
      fetchDrafts();
    }
  }, [isOpen]);

  const fetchDrafts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMyUnpaidDrafts();
      setDrafts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load drafts');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full flex flex-col max-h-[80vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            <FileText size={20} className="text-ziditech-600 dark:text-ziditech-400" />
            <h2 className="text-lg font-bold">Drafts</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 size={32} className="animate-spin mb-4 text-ziditech-600" />
              <p>Loading your drafts...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <p>{error}</p>
              <button 
                onClick={fetchDrafts}
                className="mt-4 px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">No drafts found</p>
              <p className="text-sm">You don't have any unpaid draft orders.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <button
                  key={draft.name}
                  onClick={() => onSelectDraft(draft.name)}
                  className="w-full flex flex-col text-left p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-ziditech-600 dark:hover:border-ziditech-400 hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono font-medium text-ziditech-600 dark:text-ziditech-400 group-hover:underline">
                      {draft.name}
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {formatCurrency(draft.grand_total, currency)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-end text-sm text-gray-500 dark:text-gray-400">
                    <div>
                      {draft.customer_name && (
                        <p className="mb-1 text-gray-700 dark:text-gray-300">
                          {draft.customer_name}
                        </p>
                      )}
                      <p className="text-xs">
                        {new Date(draft.creation).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
