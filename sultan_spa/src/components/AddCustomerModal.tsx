import React, { useState, useEffect } from "react";
import { X, User, Phone, Save, ChevronDown, ChevronUp } from "lucide-react";
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
        customer_name: formData.name || formData.phone, // Fallback to phone as name if name is empty
      };

      if (isEditing && customer?.id) {
        const updated = await updateCustomer(customer.id, payload);
        onSave({ ...updated, id: customer.id });
      } else {
        const created = await createCustomer(payload);
        onSave({ ...created, id: created.name || created.customer_name });
      }
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to save customer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={isFullPage ? "h-full" : "fixed inset-0 bg-ziditech-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50"}>
      <div style={{ backgroundColor: '#180855', border: '1px solid rgba(255,255,255,0.1)' }} className="rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)' }} className="p-6 flex justify-between items-center">
          <h2 className="text-xl font-black text-white">
            {isEditing ? "Edit Customer" : "Quick Add Customer"}
          </h2>
          <button onClick={onClose} style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} className="p-2 hover:opacity-80 rounded-full transition-all">
            <X size={20} className="text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-2 ml-1" style={{ color: '#9a88ff' }}>Customer Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2" size={18} style={{ color: '#7c60f5' }} />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Full Name"
                  autoFocus
                  style={{
                    width: '100%', paddingLeft: '3rem', paddingRight: '1rem',
                    paddingTop: '1rem', paddingBottom: '1rem',
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '1rem', color: '#f0eeff', fontWeight: 600,
                  }}
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-2 ml-1" style={{ color: '#9a88ff' }}>Mobile Number</label>
              <div className="quick-add-phone" style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: '1rem', overflow: 'hidden',
              }}>
                <PhoneInput
                  international
                  defaultCountry={posDetails?.country_code as any || "SA"}
                  value={formData.phone}
                  onChange={(val) => setFormData({ ...formData, phone: val || "" })}
                  style={{ padding: '0.75rem 1rem', backgroundColor: 'transparent' }}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest hover:opacity-80 transition-opacity"
            style={{ color: '#7c60f5' }}
          >
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showAdvanced ? "Hide Details" : "More Options"}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 ml-1" style={{ color: '#9a88ff' }}>Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                  style={{
                    width: '100%', padding: '1rem',
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '1rem', color: '#f0eeff', fontWeight: 600,
                  }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 ml-1" style={{ color: '#9a88ff' }}>Customer Type</label>
                <select
                  value={formData.customer_type}
                  onChange={(e) => setFormData({ ...formData, customer_type: e.target.value as any })}
                  style={{
                    width: '100%', padding: '1rem',
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '1rem', color: '#f0eeff', fontWeight: 600, appearance: 'none',
                  }}
                >
                  <option value="Individual" style={{ backgroundColor: '#180855' }}>Individual</option>
                  <option value="Company" style={{ backgroundColor: '#180855' }}>Company</option>
                </select>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-ziditech-600 hover:bg-ziditech-500 text-white rounded-2xl font-black shadow-xl shadow-ziditech-600/20 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
            >
              <Save size={20} />
              {isSubmitting ? "Saving..." : isEditing ? "Update Customer" : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
