import { toast } from 'react-toastify';

interface BatchData {
  batch_id?: string;
  name?: string;
  expiry_date?: string;
  [key: string]: any;
}

/**
 * Checks a list of batches for imminent expiry and generates UI warnings
 * @param batches Array of batch info objects
 * @param itemCode The item code context for the alert
 */
export function checkBatchExpiryAlerts(batches: BatchData[], itemCode: string): void {
  if (!Array.isArray(batches)) return;
  
  const now = new Date();
  const warningThreshold = new Date();
  warningThreshold.setDate(now.getDate() + 7); // 7 day warning window

  batches.forEach(batch => {
    if (!batch.expiry_date) return;
    
    const expiryDate = new Date(batch.expiry_date);
    const batchName = batch.batch_id || batch.name || 'Unknown Batch';
    
    // Check if it's valid and within the future 7 days
    if (expiryDate > now && expiryDate <= warningThreshold) {
      // Calculate diff in days
      const diffTime = Math.abs(expiryDate.getTime() - now.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      
      toast.warning(`⚠️ Expiry Warning: Batch ${batchName} of item ${itemCode} expires in ${diffDays} days (${batch.expiry_date})`, {
        toastId: `exp-${batchName}`, // Prevents duplicate notifications for same batch
        autoClose: 8000
      });
    } else if (expiryDate <= now) {
      // Expired entirely
      toast.error(`🚫 Expired Batch Detected: Batch ${batchName} for item ${itemCode} is already expired!`, {
        toastId: `exp-${batchName}`,
        autoClose: false // Persistent until closed
      });
    }
  });
}
