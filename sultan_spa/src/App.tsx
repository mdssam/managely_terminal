import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ThemeProvider } from "./hooks/useTheme";
import { I18nProvider } from "./hooks/useI18n";
import { ProductProvider } from "./providers/ProductProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { setupGlobalErrorHandling } from "./utils/apiUtils";
import Footer from "./components/Footer";
import RetailSidebar from "./components/RetailSidebar";

import { useAuth } from "./hooks/useAuth";

const queryClient = new QueryClient();

function AppLayout() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
          <div className="mt-6 text-slate-600 font-medium text-sm animate-pulse">Synchronizing Session...</div>
        </div>
      </div>
    );
  }

  // If not authenticated, render standard public Outlet directly without Chrome or Context Providers
  if (!isAuthenticated) {
    return (
      <>
        <Outlet />
        <ToastContainer position="top-center" autoClose={3000} aria-label="Notification" />
      </>
    );
  }

  // Authenticated path: Provide Product context and UI Shell
  return (
    <ProductProvider>
      <RetailSidebar />
      <Outlet />
      <Footer />
      <ToastContainer position="top-center" autoClose={3000} aria-label="Notification" />
    </ProductProvider>
  );
}

function App() {
  useEffect(() => {
    // Set up global error handling for API calls
    setupGlobalErrorHandling();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <I18nProvider>
            <AppLayout />
          </I18nProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
