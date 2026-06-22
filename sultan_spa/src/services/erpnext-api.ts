import { dbGet, dbSet, dbRemove, AUTH_STORE, APP_CACHE_STORE } from './offlineDB';

interface ERPNextConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  requires_otp?: boolean;
  tmp_id?: string;
  verification?: {
    method?: string;
    prompt?: string;
    setup?: boolean;
    token_delivery?: boolean;
  };
  user?: {
    name: string;
    email: string;
    full_name: string;
    role?: string;
    [key: string]: unknown;
  };
  sid?: string;
}

interface ImportMetaEnv {
  VITE_ERPNEXT_BASE_URL?: string;
  VITE_API_KEY?: string;
  VITE_API_SECRET?: string;
  DEV?: boolean;
  [key: string]: unknown;
}

interface ImportMeta {
  env: ImportMetaEnv;
}

interface UserProfile {
  name?: string;
  email?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  role_profile_name?: string;
  user_image?: string;
  [key: string]: unknown;
}

interface DocData {
  [key: string]: unknown;
}

class ERPNextAPI {
  private config: ERPNextConfig;
  private sessionId: string | null = null;

  constructor() {
    // Prefer explicit base URL when provided.
    // Otherwise:
    // - In development, use relative URLs so Vite's proxy forwards to Frappe
    // - In production (served from Frappe), also use relative URLs (same origin)
    const envBaseUrl = (import.meta as ImportMeta).env?.VITE_ERPNEXT_BASE_URL;

    this.config = {
      baseUrl: envBaseUrl || '',
      apiKey: (import.meta as ImportMeta).env?.VITE_API_KEY || '',
      apiSecret: (import.meta as ImportMeta).env?.VITE_API_SECRET || ''
    };
  }

  private getHeaders(includeAuth: boolean = true): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Global CSRF Token Retrieval — checking all possible Frappe/ERPNext locations
    const csrfToken = (window as any).csrf_token || 
                      (window as any).frappe?.csrf_token || 
                      (window as any).frappe?.boot?.csrf_token ||
                      (window as any).erpnext?.csrf_token;

    if (csrfToken) {
      headers['X-Frappe-CSRF-Token'] = csrfToken;
    } else {
      const cookieToken = document.cookie
        .split("; ")
        .find((row) => row.startsWith("frappe_csrf_token="))
        ?.split("=")[1];
      if (cookieToken) {
        headers['X-Frappe-CSRF-Token'] = decodeURIComponent(cookieToken);
      }
    }

    if (includeAuth && this.config.apiKey && this.config.apiSecret) {
      const auth = btoa(`${this.config.apiKey}:${this.config.apiSecret}`);
      headers['Authorization'] = `Basic ${auth}`;
    }

    if (this.sessionId) {
      // Note: In most browser-based Frappe apps, credentials: 'include' handles SID cookies.
      // We only manually append it if we have it stored and are making cross-origin requests.
      // headers['Cookie'] = `sid=${this.sessionId}`;
    }

    return headers;
  }

  async login(username: string, password: string, otp?: string, tmpId?: string): Promise<LoginResponse> {
    try {
      console.log('Attempting login to:', this.config.baseUrl);

      // Try the standard login endpoint first
      const loginPayload: Record<string, string> = {
        usr: username,
        pwd: password
      };
      if (otp) loginPayload.otp = otp;
      if (tmpId) loginPayload.tmp_id = tmpId;

      let response = await fetch(`${this.config.baseUrl}/api/method/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(loginPayload),
        credentials: 'include'
      });

      console.log('Login response status:', response.status);
      console.log('Login response headers:', Object.fromEntries(response.headers.entries()));

      // If 404, try alternative endpoint
      if (response.status === 404) {
        console.log('Trying alternative login endpoint...');
        response = await fetch(`${this.config.baseUrl}/api/method/frappe.auth.login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(loginPayload),
          credentials: 'include'
        });
        console.log('Alternative login response status:', response.status);
      }

      if (!response.ok) {
        console.error('Login failed with status:', response.status);
        const errorText = await response.text();
        console.error('Error response body:', errorText);

        // Parse error response if it's JSON
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.exc) {
            errorMessage = errorData.exc;
          }
        } catch {
          // If not JSON, use the text as is
          if (errorText && errorText.trim()) {
            errorMessage = errorText;
          }
        }

        return {
          success: false,
          message: errorMessage
        };
      }

      const data = await response.json();
      console.log('Login response data:', data);

      // Frappe 2FA challenge response
      if (data?.tmp_id && data?.verification) {
        return {
          success: false,
          requires_otp: true,
          tmp_id: data.tmp_id,
          verification: data.verification,
          message: data.verification?.prompt || 'Verification code required'
        };
      }

      // Check for different response formats
      if (data.message === 'Logged In' || data.message?.name || data.message?.email) {
        // Extract session ID from response headers
        const setCookieHeader = response.headers.get('set-cookie');
        if (setCookieHeader) {
          const sidMatch = setCookieHeader.match(/sid=([^;]+)/);
          if (sidMatch && sidMatch[1]) {
            this.sessionId = sidMatch[1];
            await dbSet(AUTH_STORE, 'erpnext_sid', this.sessionId);
            console.log('Session ID stored:', this.sessionId);
            // Fetch CSRF token so POST requests can proceed
            try {
              const csrfRes = await fetch('/api/method/sultan.sultan.api.employee_auth.get_pos_csrf_token', { credentials: 'include' });
              const csrfData = await csrfRes.json();
              if (csrfData?.message?.csrf_token) {
                (window as any).csrf_token = csrfData.message.csrf_token;
                (window as any).frappe = (window as any).frappe || {};
                (window as any).frappe.csrf_token = csrfData.message.csrf_token;
              }
            } catch { /* non-fatal */ }
          }
        }

        // Fetch complete user profile data from ERPNext
        try {
          console.log('Fetching user profile data...');
          const userProfile = await this.getCurrentUserProfile();
          console.log('User profile fetched:', userProfile);

          if (userProfile) {
            return {
              success: true,
              message: 'Login successful',
              user: {
                name: userProfile.name || username, // This is the user ID/email
                email: userProfile.email || userProfile.name || username,
                full_name: userProfile.full_name || userProfile.first_name + ' ' + (userProfile.last_name || '') || username,
                role: userProfile.role_profile_name || userProfile.role || 'User',
                first_name: userProfile.first_name,
                last_name: userProfile.last_name,
                user_image: userProfile.user_image
              },
              sid: this.sessionId || undefined
            };
          }
        } catch (profileError) {
          console.warn('Failed to fetch user profile, using basic data:', profileError);
        }

        // Fallback to basic user data if profile fetch fails
        let userData;
        if (typeof data.message === 'string' && data.message === 'Logged In') {
          userData = {
            name: username,
            email: username,
            full_name: username,
            role: 'User'
          };
        } else if (data.message && typeof data.message === 'object') {
          userData = {
            name: data.message.name || username,
            email: data.message.email || data.message.name || username,
            full_name: data.message.full_name || data.message.name || username,
            role: data.message.role || 'User'
          };
        } else {
          userData = {
            name: username,
            email: username,
            full_name: username,
            role: 'User'
          };
        }

        return {
          success: true,
          message: 'Login successful',
          user: userData,
          sid: this.sessionId || undefined
        };
      } else {
        return {
          success: false,
          message: data.message || data.exc || 'Login failed'
        };
      }
    } catch (error) {
      console.error('Login error details:', error);

      if (error instanceof TypeError && error.message.includes('fetch')) {
        return {
          success: false,
          message: 'Network error. Please check if the ERPNext server is accessible.'
        };
      }

      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          return {
            success: false,
            message: 'Connection timeout. Please try again.'
          };
        }

        if (error.message.includes('Failed to fetch')) {
          return {
            success: false,
            message: 'Unable to connect to the server. Please check your internet connection.'
          };
        }
      }

      return {
        success: false,
        message: 'An unexpected error occurred. Please try again.'
      };
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${this.config.baseUrl}/api/method/logout`, {
        method: 'POST',
        headers: this.getHeaders(),
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.sessionId = null;
      await dbRemove(AUTH_STORE, 'erpnext_sid');
    }
  }

  async getCurrentUser(): Promise<unknown> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/method/frappe.auth.get_logged_user`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include'
      });

      const data = await response.json();
      return data.message;
    } catch (error) {
      console.error('Get current user error:', error);
      if (typeof window !== 'undefined') {
        const profile = await dbGet<Record<string, unknown>>(APP_CACHE_STORE, 'cached_user_profile');
        if (profile) return profile.name || null;
      }
      return null;
    }
  }

  async getCurrentUserProfile(timeoutMs: number = 2000): Promise<UserProfile | null> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Try to get user profile using the frappe.auth.get_logged_user method first
      const response = await fetch(`${this.config.baseUrl}/api/method/frappe.auth.get_logged_user`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include',
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch logged user: ${response.status}`);
      }

      const data = await response.json();
      const username = data.message;

      if (!username) {
        throw new Error('No logged user found');
      }

      // Now fetch the full User document
      const userResponse = await fetch(`${this.config.baseUrl}/api/resource/User/${username}`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(id);

      if (!userResponse.ok) {
        throw new Error(`Failed to fetch user profile: ${userResponse.status}`);
      }

      const userData = await userResponse.json();
      if (typeof window !== 'undefined' && userData.data) {
        await dbSet(APP_CACHE_STORE, 'cached_user_profile', userData.data);
      }
      return userData.data;
    } catch (error) {
      clearTimeout(id);
      console.error('Get user profile error:', error);
      if (typeof window !== 'undefined') {
        const profile = await dbGet<UserProfile>(APP_CACHE_STORE, 'cached_user_profile');
        if (profile) {
          console.log('Serving cached user profile offline:', profile);
          return profile;
        }
      }
      throw error;
    }
  }

  // Test connection to ERPNext server
  async testConnection(): Promise<{ success: boolean; message: string; details?: unknown }> {
    try {
      console.log('Testing connection to:', this.config.baseUrl);

      // First try the ping endpoint
      let response = await fetch(`${this.config.baseUrl}/api/method/ping`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      console.log('Ping response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (response.status === 404) {
        // Try alternative endpoints
        console.log('Ping failed, trying version endpoint...');
        response = await fetch(`${this.config.baseUrl}/api/method/frappe.utils.get_site_info`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          credentials: 'include'
        });
      }

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          message: 'Connection successful',
          details: data
        };
      } else {
        return {
          success: false,
          message: `Server responded with status: ${response.status} - ${response.statusText}`,
          details: { status: response.status, statusText: response.statusText }
        };
      }
    } catch (error) {
      console.error('Connection test error details:', error);

      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Connection timeout - server took too long to respond';
        } else if (error.message.includes('CORS')) {
          errorMessage = 'CORS error - server may not allow cross-origin requests';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error - server may be unreachable or blocked';
        } else {
          errorMessage = error.message;
        }
      }

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        details: error
      };
    }
  }

  // Enhanced API call method with better error handling
  async makeAPICall(url: string, options: RequestInit = {}): Promise<Response> {
    const defaultOptions: RequestInit = {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include',
      ...options
    };

    try {
      console.log('Making API call:', { url, options: defaultOptions });
      const response = await fetch(url, defaultOptions);

      if (!response.ok) {
        console.error('API call failed:', {
          url,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        });
      }

      return response;
    } catch (error) {
      console.error('API call error:', { url, error });
      throw error;
    }
  }

  async apiCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    try {
      const response = await this.makeAPICall(`${this.config.baseUrl}/api/method/${method}`, {
        method: 'POST',
        body: JSON.stringify(params)
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`API call error (${method}):`, error);
      throw error;
    }
  }

  async getDocList(doctype: string, fields: string[] = ['*'], filters: Record<string, unknown> = {}): Promise<DocData[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/resource/${doctype}?${new URLSearchParams({
        fields: JSON.stringify(fields),
        filters: JSON.stringify(filters)
      })}`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include'
      });

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error(`Get ${doctype} list error:`, error);
      throw error;
    }
  }

  async getDoc(doctype: string, name: string): Promise<DocData> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/resource/${doctype}/${name}`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include'
      });

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error(`Get ${doctype} document error:`, error);
      throw error;
    }
  }

  async createDoc(doctype: string, doc: DocData): Promise<DocData> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/resource/${doctype}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(doc),
        credentials: 'include'
      });

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error(`Create ${doctype} document error:`, error);
      throw error;
    }
  }

  async updateDoc(doctype: string, name: string, doc: DocData): Promise<DocData> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/resource/${doctype}/${name}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(doc),
        credentials: 'include'
      });

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error(`Update ${doctype} document error:`, error);
      throw error;
    }
  }

  // Validate session by checking if user is still logged in
  async validateSession(timeoutMs: number = 2000): Promise<boolean> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/method/frappe.auth.get_logged_user`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: 'include',
        signal: controller.signal
      });
      clearTimeout(id);

      if (response.ok) {
        const data = await response.json();
        return !!data.message; // Return true if we get a username
      }
      return false;
    } catch (error) {
      clearTimeout(id);
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
        // Network unavailable or timed out — assume session still valid to avoid logging out offline users
        console.warn('Session validation skipped (network unavailable or timed out)');
        return true;
      }
      console.error('Session validation failed:', error);
      return false;
    }
  }

  // Initialize session from IndexedDB (async)
  async initializeSession(): Promise<void> {
    const storedSid = await dbGet<string>(AUTH_STORE, 'erpnext_sid');
    if (storedSid) {
      this.sessionId = storedSid;
      console.log('Session restored from IndexedDB:', storedSid);
    }
  }
}

export const erpnextAPI = new ERPNextAPI();
export default erpnextAPI;
