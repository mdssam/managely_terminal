interface SerialNumber {
  serial_no: string;
  [key: string]: unknown;
}

export async function getSerials(itemCode: string): Promise<string[]> {
  if (typeof window !== "undefined" && !navigator.onLine) {
    return [];
  }
  try {
    const res = await fetch(`/api/method/sultan.sultan.api.item.get_serial_nos_for_item?item_code=${encodeURIComponent(itemCode)}`)
    if (!res.ok) return []
    const data = await res.json() as { message?: SerialNumber[] };
    if (Array.isArray(data?.message)) {
      return data.message
        .map((s: SerialNumber) => typeof s.serial_no === 'string' ? s.serial_no : '')
        .filter(Boolean) as string[];
    }
    return []
  } catch {
    return []
  }
}
