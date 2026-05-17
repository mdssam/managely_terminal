export function getCSRFToken(): string | null {
  return typeof window !== "undefined" ? window.csrf_token ?? null : null;
}

export async function refreshCSRFToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/method/sultan.sultan.api.pos_entry.get_csrf_token', {
      method: 'GET',
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      if (data.message && typeof window !== "undefined") {
        window.csrf_token = data.message;
        console.log("🔄 CSRF Token Refreshed Successfully:", data.message);
        return data.message;
      }
    }
  } catch (error) {
    console.error("❌ Failed to refresh CSRF token:", error);
  }
  return null;
}
