export const OFFLINE_CUSTOMERS_KEY = 'sultan_offline_customers';

export interface OfflineCustomer {
  id: string;
  data: any;
  timestamp: number;
  synced: boolean;
  realId?: string;
}

export function getOfflineCustomers(): OfflineCustomer[] {
  try {
    const stored = localStorage.getItem(OFFLINE_CUSTOMERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveOfflineCustomer(data: any): OfflineCustomer {
  const customers = getOfflineCustomers();
  const newCust: OfflineCustomer = {
    id: 'OFFLINE_CUST-' + Date.now(),
    data,
    timestamp: Date.now(),
    synced: false,
  };
  customers.push(newCust);
  localStorage.setItem(OFFLINE_CUSTOMERS_KEY, JSON.stringify(customers));
  return newCust;
}

interface CustomerAddress {
  addressType?: string;
  street: string;
  buildingNumber?: string;
  city: string;
  state?: string;
  zipCode?: string;
  country: string;
}

interface CustomerData {
  name: string;
  customer_type: string;
  email: string;
  phone: string;
  name_arabic?: string;
  address: CustomerAddress;
  preferredPaymentMethod?: string;
  contactName?: string;
  vatNumber?: string;
  registrationScheme?: string;
  registrationNumber?: string;
  customer_group?: string;
  territory?: string;
}

export const useCustomerActions = () => {
  const getCSRFToken = () => {
    // 1. Try global variables
    const token = (window as any).csrf_token || (window as any).frappe?.csrf_token || (window as any).frappe?.boot?.csrf_token;
    if (token) return token;

    // 2. Try cookies
    const cookieToken = document.cookie
      .split("; ")
      .find((row) => row.startsWith("frappe_csrf_token="))
      ?.split("=")[1];
    if (cookieToken) return decodeURIComponent(cookieToken);

    return "";
  };

  const createCustomer = async (customerData: CustomerData) => {
    const queueOffline = () => {
      const offline = saveOfflineCustomer(customerData);
      return {
        success: true,
        name: offline.id,
        customer_name: (customerData as any).name || (customerData as any).customer_name || '',
        phone: customerData.phone || '',
        email: customerData.email || '',
        is_offline: true,
      };
    };

    if (!navigator.onLine) {
      console.log('[Offline] Saving customer to offline queue:', customerData);
      return queueOffline();
    }

    try {
      const response = await fetch('/api/method/sultan.sultan.api.customer.create_or_update_customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "X-Frappe-CSRF-Token": getCSRFToken(),
        },
        body: JSON.stringify({ customer_data: customerData }),
        credentials: 'include'
      });

      const result = await response.json();

      if (!result.message || !result.message.success) {
        throw new Error(result.message?.error || "Customer creation failed");
      }

      return result.message;
    } catch (error) {
      if (error instanceof TypeError && (error as any).message.includes('fetch')) {
        console.log('[Offline] Network unavailable. Saving customer to offline queue:', customerData);
        return queueOffline();
      }
      console.error("❌ Error creating customer:", error);
      throw error;
    }
  };

  const updateCustomer = async (customerId: string, customerData: Partial<CustomerData>) => {
    try {
      const response = await fetch('/api/method/sultan.sultan.api.customer.update_customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "X-Frappe-CSRF-Token": getCSRFToken(),
        },
        body: JSON.stringify({
          customer_id: customerId,
          customer_data: customerData
        }),
        credentials: 'include'

      });

      const result = await response.json();

      if (!result.message || !result.message.success) {
        throw new Error(result.message?.error || "Customer update failed");
      }

      return result.message;
    } catch (error) {
      console.error("❌ Error updating customer:", error);
      throw error;
    }
  };

  const getCustomerGroups = async () => {
    try {
      const response = await fetch('/api/method/sultan.sultan.api.customer.get_customer_groups', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      const result = await response.json();

      if (!result.message || !result.message.success) {
        throw new Error(result.message?.error || "Failed to fetch customer groups");
      }

      return result.message.data;
    } catch (error) {
      console.error("❌ Error fetching customer groups:", error);
      throw error;
    }
  };

  const getTerritories = async () => {
    try {
      const response = await fetch('/api/method/sultan.sultan.api.customer.get_territories', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      const result = await response.json();

      if (!result.message || !result.message.success) {
        throw new Error(result.message?.error || "Failed to fetch territories");
      }

      return result.message.data;
    } catch (error) {
      console.error("❌ Error fetching territories:", error);
      throw error;
    }
  };

  return {
    createCustomer,
    updateCustomer,
    getCustomerGroups,
    getTerritories
  };
};
