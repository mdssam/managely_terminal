// utils/batch.ts
export async function getBatches(itemCode: string) {
  if (typeof window !== "undefined" && !navigator.onLine) {
    return [];
  }
  try {
    const response = await fetch(
      `/api/method/sultan.sultan.api.item.get_batch_nos_with_qty?item_code=${encodeURIComponent(itemCode)}`
    );
    if (!response.ok) return [];
    const resData = await response.json();
    if (resData?.message && Array.isArray(resData.message)) {
      return resData.message;
    }
    return [];
  } catch (error) {
    console.error("Error fetching batches:", error);
    return [];
  }
}
