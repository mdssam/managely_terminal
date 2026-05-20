
import { useEffect, useState } from "react";
import type { Customer } from "../types/customer";
import { getOfflineCustomers } from "../services/customerService";

interface ERPCustomer {
  name: string;
  customer_name?: string;
  customer_type?: string;
  customer_group?: string;
  territory?: string;
  default_currency?: string;
  company_currency?: string;
  custom_total_orders?: number;
  custom_total_spent?: number;
  custom_last_visit?: string;
  contact?: {
    first_name?: string;
    last_name?: string;
    email_id?: string;
    phone?: string;
    mobile_no?:string;
  };
  address?: {
    address_line1?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
}

function offlineCustomersToCustomers(search?: string): Customer[] {
  const offlines = getOfflineCustomers().filter(c => !c.synced);
  const mapped: Customer[] = offlines.map(c => ({
    id: c.id,
    type: (c.data.customer_type === 'Company' ? 'company' : 'individual') as Customer['type'],
    name: c.data.name || c.data.customer_name || c.data.phone || 'Unknown',
    email: c.data.email || '',
    phone: c.data.phone || '',
    address: { street: '', city: '', state: '', zipCode: '', country: '' },
    dateOfBirth: '',
    gender: 'other' as Customer['gender'],
    loyaltyPoints: 0,
    totalSpent: 0,
    totalOrders: 0,
    preferredPaymentMethod: 'Cash',
    notes: 'Offline — pending sync',
    tags: [],
    status: 'active' as Customer['status'],
    createdAt: new Date(c.timestamp).toISOString(),
  }));
  if (!search) return mapped;
  const q = search.toLowerCase();
  return mapped.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.phone.toLowerCase().includes(q) ||
    c.email.toLowerCase().includes(q)
  );
}

export function useCustomers(searchQuery?: string) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [start, setStart] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [totalCount, setTotalCount] = useState<number>(0);

  const fetchCustomers = async (search?: string, append = false) => {
    setIsLoading(true);

    if (!navigator.onLine) {
      const offlineOnly = offlineCustomersToCustomers(search);
      const cached = localStorage.getItem('sultan_customers_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const merged = [...offlineOnly, ...parsed.data];
          console.log(`[Offline POS] Loading ${merged.length} customers from cache (${offlineOnly.length} offline)...`);
          setCustomers(merged);
          setTotalCount(merged.length);
          setHasMore(false);
          setIsLoading(false);
          return;
        } catch (e) {
          console.error('[Offline POS] Failed to parse cached customers:', e);
        }
      }
      if (offlineOnly.length > 0) {
        setCustomers(offlineOnly);
        setTotalCount(offlineOnly.length);
        setHasMore(false);
        setIsLoading(false);
        return;
      }
    }

    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      // Default page size 100
      params.set('limit', '100');
      params.set('start', String(append ? start : 0));
      const searchParam = `?${params.toString()}`;

      const response = await fetch(`/api/method/sultan.sultan.api.customer.get_customers${searchParam}`);
      const resData = await response.json();

      if (!resData.message.success) {
        throw new Error(resData.error || "Failed to fetch customers");
      }

      const data: ERPCustomer[] = resData.message.data;
      const enhanced = data.map((customer): Customer => {
        return {
          id: customer.name,
          type: customer.customer_type === "Company" ? "company" : "individual",
          name: customer.customer_name || `Customer ${customer.name.slice(0, 5)}`,
          email: customer.contact?.email_id || "",
          phone: customer.contact?.mobile_no || customer.contact?.phone || "",
          address: {
            street: customer.address?.address_line1 || "",
            city: customer.address?.city || "",
            state: customer.address?.state || "",
            zipCode: customer.address?.pincode || "",
            country: customer.address?.country || ""
          },
          dateOfBirth: "",
          gender: "other",
          loyaltyPoints: 0,
          totalSpent: customer.custom_total_spent || 0,
          totalOrders: customer.custom_total_orders || 0,
          preferredPaymentMethod: "Cash",
          notes: "",
          tags: [],
          status: "active",
          createdAt: new Date().toISOString(),
          lastVisit: customer.custom_last_visit || undefined,
          avatar: undefined,
          defaultCurrency: customer.default_currency,
          companyCurrency: customer.company_currency
        };
      });

      const offlineOnly = offlineCustomersToCustomers(search);
      const merged = append ? enhanced : [...offlineOnly, ...enhanced];
      setCustomers(prev => append ? [...prev, ...enhanced] : merged);
      const total = resData.message.total_count || 0;
      setTotalCount(total + (append ? 0 : offlineOnly.length));
      const nextStart = (append ? start : 0) + enhanced.length;
      setStart(nextStart);
      setHasMore(nextStart < total);

      // Cache main list on success
      if (!search) {
        localStorage.setItem('sultan_customers_cache', JSON.stringify({
          data: enhanced,
          totalCount: total
        }));
      }

    } catch (err) {
      console.error("Error fetching customers:", err);

      const offlineOnly = offlineCustomersToCustomers(search);
      const cached = localStorage.getItem('sultan_customers_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const merged = [...offlineOnly, ...parsed.data];
          console.log(`[Offline POS Fallback] Loading ${merged.length} customers from cache (${offlineOnly.length} offline)...`);
          setCustomers(merged);
          setTotalCount(merged.length);
          setHasMore(false);
          setError(null);
          return;
        } catch (e) {
          console.error('[Offline POS Fallback] Failed to parse cached customers:', e);
        }
      }
      if (offlineOnly.length > 0) {
        setCustomers(offlineOnly);
        setTotalCount(offlineOnly.length);
        setHasMore(false);
        setError(null);
        return;
      }

      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Reset paging on new search
    setStart(0);
    setHasMore(false);
    setTotalCount(0);
    const t = setTimeout(() => {
      fetchCustomers(searchQuery, false);
    }, searchQuery ? 300 : 0);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadMore = async () => {
    if (hasMore) {
      await fetchCustomers(searchQuery, true);
    }
  };

  const addCustomer = (newCustomer: Customer) => {
    setCustomers(prev => [newCustomer, ...prev]);
  };

  return {
    customers,
    isLoading,
    error,
    refetch: fetchCustomers,
    addCustomer,
    hasMore,
    totalCount,
    loadMore,
  };
}

export function useCustomerDetails(customerId: string | null) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;

    const fetchCustomer = async () => {
      setIsLoading(true);
      try {
        console.log('Fetching customer details for ID:', customerId);

        if (typeof window !== 'undefined' && !navigator.onLine) {
          const cached = localStorage.getItem('sultan_customers_cache');
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              const found = parsed.data.find((c: any) => c.id === customerId);
              if (found) {
                setCustomer(found);
                setIsLoading(false);
                return;
              }
            } catch (e) {
              console.error('Failed to parse cached customers:', e);
            }
          }
        }

        const response = await fetch(`/api/method/sultan.sultan.api.customer.get_customer_info?customer_name=${encodeURIComponent(customerId)}`);
        const resData = await response.json();

        console.log('Customer API response:', resData);

        if (!resData.message || resData.message.success === false) {
          throw new Error(resData.message?.error || "Failed to fetch customer");
        }

        // Transform the API response to match the Customer interface
        const apiCustomer = resData.message;
        const transformedCustomer: Customer = {
          id: apiCustomer.name,
          type: apiCustomer.customer_type === "Company" ? "company" : "individual",
          name: apiCustomer.customer_name || `Customer ${apiCustomer.name.slice(0, 5)}`,
          email: apiCustomer.contact_data?.email_id || apiCustomer.email_id || "",
          phone: apiCustomer.contact_data?.mobile_no || apiCustomer.contact_data?.phone || apiCustomer.mobile_no || "",
          address: {
            addressType: "Billing",
            street: apiCustomer.address_data?.address_line1 || "",
            buildingNumber: apiCustomer.address_data?.address_line2 || "",
            city: apiCustomer.address_data?.city || "",
            state: apiCustomer.address_data?.state || "",
            zipCode: apiCustomer.address_data?.pincode || "",
            country: apiCustomer.address_data?.country || "Saudi Arabia"
          },
          dateOfBirth: "",
          gender: "other",
          loyaltyPoints: 0,
          totalSpent: 0,
          totalOrders: 0,
          preferredPaymentMethod: apiCustomer.payment_method || "Cash",
          notes: "",
          tags: [],
          status: "active",
          createdAt: apiCustomer.creation || new Date().toISOString(),
          lastVisit: undefined,
          avatar: undefined,
          defaultCurrency: undefined,
          companyCurrency: undefined,
          customer_group: apiCustomer.customer_group || "All Customer Groups",
          territory: apiCustomer.territory || "All Territories",
          // Add missing fields that AddCustomerModal expects
          contactPerson: apiCustomer.contact_data ?
            `${apiCustomer.contact_data.first_name || ''} ${apiCustomer.contact_data.last_name || ''}`.trim() || apiCustomer.customer_name :
            apiCustomer.customer_name || "",
          companyName: apiCustomer.customer_type === "Company" ? apiCustomer.customer_name : undefined,
          taxId: apiCustomer.vat_number || "",
          industry: apiCustomer.industry || "",
          employeeCount: apiCustomer.employee_count || "",
          registrationScheme: apiCustomer.registration_scheme || "",
          registrationNumber: apiCustomer.registration_number || ""
        };

        setCustomer(transformedCustomer);
      } catch (err: unknown) {
        console.error('Error in useCustomerDetails:', err);
        const cached = typeof window !== 'undefined' ? localStorage.getItem('sultan_customers_cache') : null;
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            const found = parsed.data.find((c: any) => c.id === customerId);
            if (found) {
              setCustomer(found);
              setError(null);
              return;
            }
          } catch (e) {
            console.error('Fallback parse failed:', e);
          }
        }
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Unknown error");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomer();
  }, [customerId]);

  return { customer, isLoading, error };
}
