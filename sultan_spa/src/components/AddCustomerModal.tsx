import React, { useState, useEffect } from "react";
import { X, User, Save, ChevronDown, ChevronUp } from "lucide-react";
import { type Customer } from "../types/customer";
import { useCustomerActions } from "../services/customerService";
import { toast } from "react-toastify";
import { usePOSDetails } from "../hooks/usePOSProfile";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

interface AddCustomerModalProps {
  customer?: Customer | null;
  onClose: () => void;
  onSave: (customer: Partial<Customer>) => void;
  isFullPage?: boolean;
  prefilledName?: string;
  prefilledData?: { name?: string; email?: string; phone?: string };
}

export default function AddCustomerModal({
  customer,
  onClose,
  onSave,
  isFullPage = false,
  prefilledData = {},
}: AddCustomerModalProps) {
  const { createCustomer, updateCustomer } = useCustomerActions();
  const { posDetails } = usePOSDetails();
  const isEditing = !!customer;

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    customer_type: "Individual" as "Individual" | "Company",
    customer_group: "Individual",
    territory: "All Territories",
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || "",
        phone: customer.phone || "",
        email: customer.email || "",
        customer_type: (customer.type as any) || "Individual",
        customer_group: customer.customer_group || "All Customer Groups",
        territory: customer.territory || "All Territories",
      });
    } else if (prefilledData) {
      setFormData(prev => ({
        ...prev,
        name: prefilledData.name || prev.name,
        email: prefilledData.email || prev.email,
        phone: prefilledData.phone || prev.phone,
      }));
    }
  }, [customer, prefilledData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() && !formData.phone.trim()) {
      toast.error("Please provide at least a name or phone number");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        customer_name: formData.name || formData.phone,
      };

      if (isEditing && customer?.id) {
        const updated = await updateCustomer(customer.id, payload);
        onSave({ ...updated, id: customer.id });
        toast.success("Customer updated");
      } else {
        const created = await createCustomer(payload);
        if (created.is_offline) {
          toast.info("Saved offline — will sync when connection is restored");
        } else {
          toast.success("Customer created");
        }
        onSave({
          id: created.name,
          name: created.customer_name || formData.name,
          phone: created.phone || formData.phone,
          email: created.email || formData.email,
          type: formData.customer_type === 'Company' ? 'company' : 'individual',
        });
      }
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to save customer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={isFullPage ? "h-full" : "fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"}>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-base font-bold text-gray-900">
            {isEditing ? "Edit Customer" : "Add Customer"}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Customer Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Full Name"
                autoFocus
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 bg-gray-50 focus:outline-none focus:border-[#1e2d6b] focus:ring-1 focus:ring-[#1e2d6b]/20"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mobile Number</label>
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 focus-within:border-[#1e2d6b] focus-within:ring-1 focus-within:ring-[#1e2d6b]/20">
              <PhoneInput
                international
                defaultCountry={posDetails?.country_code as any || "SA"}
                value={formData.phone}
                onChange={(val) => setFormData({ ...formData, phone: val || "" })}
                className="quick-add-phone"
                style={{ padding: '0.6rem 0.75rem', backgroundColor: 'transparent', fontSize: '0.875rem' }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showAdvanced ? "Hide details" : "More options"}
          </button>

          {showAdvanced && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 bg-gray-50 focus:outline-none focus:border-[#1e2d6b] focus:ring-1 focus:ring-[#1e2d6b]/20"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Customer Type</label>
                <select
                  value={formData.customer_type}
                  onChange={(e) => setFormData({ ...formData, customer_type: e.target.value as any })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 bg-gray-50 focus:outline-none focus:border-[#1e2d6b]"
                >
                  <option value="Individual">Individual</option>
                  <option value="Company">Company</option>
                </select>
              </div>
            </div>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: '#1e2d6b' }}
            >
              <Save size={16} />
              {isSubmitting ? "Saving..." : isEditing ? "Update Customer" : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
