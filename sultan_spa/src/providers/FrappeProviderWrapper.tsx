import React from "react";
import { FrappeProvider } from "frappe-react-sdk";

interface Props {
  children: React.ReactNode;
}

const FrappeProviderWrapper: React.FC<Props> = ({ children }) => {
    const baseUrl = import.meta.env.VITE_ERPNEXT_BASE_URL || "";
    
    return (
      <FrappeProvider
        url={baseUrl}
        enableSocket={false}
      >
      {children}
    </FrappeProvider>
  );
};

export default FrappeProviderWrapper;
