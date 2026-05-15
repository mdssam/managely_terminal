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
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4" style={{ backgroundColor: '#0D0033' }}>
        <div className="relative">
          <div className="h-20 w-20 rounded-3xl border-4 border-ziditech-600/20 border-t-ziditech-500 animate-spin shadow-2xl shadow-ziditech-600/20"></div>
          <div className="mt-8 text-ziditech-400 font-black text-[10px] uppercase tracking-[0.3em] animate-pulse">Syncing Sultan Session</div>
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
      <div className="flex min-h-screen bg-ziditech-950">
        <RetailSidebar />
        <main className="flex-1 lg:pl-20 flex flex-col min-h-screen overflow-x-hidden">
          <div className="flex-1">
            <Outlet />
          </div>
          <Footer />
        </main>
      </div>
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
