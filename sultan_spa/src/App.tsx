import React, { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
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
import OfflineBanner from "./components/OfflineBanner";

import { useAuth } from "./hooks/useAuth";

const queryClient = new QueryClient();

function AppLayout() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const isEmployeeLogin = location.pathname === '/employee-login';

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4" style={{ backgroundColor: '#eef1f8' }}>
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl border-4 border-[#1e2d6b]/20 border-t-[#1e2d6b] animate-spin shadow-xl"></div>
          <div className="mt-6 text-[#1e2d6b]/60 font-semibold text-[10px] uppercase tracking-[0.3em] animate-pulse">Syncing Sultan Session</div>
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
  if (isEmployeeLogin) {
    return (
      <ProductProvider>
        <Outlet />
        <ToastContainer position="top-center" autoClose={3000} aria-label="Notification" />
      </ProductProvider>
    );
  }

  return (
    <ProductProvider>
      <div className="flex min-h-screen" style={{ backgroundColor: '#eef1f8' }}>
        <RetailSidebar />
        <main className="flex-1 lg:pl-28 flex flex-col min-h-screen overflow-x-hidden">
          <OfflineBanner />
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

import { initDevToolsDetector } from "./utils/securityIncidents";

function App() {
  useEffect(() => {
    // Set up global error handling for API calls
    setupGlobalErrorHandling();
    
    // Initialize silent DevTools detection
    try {
      initDevToolsDetector();
    } catch (e) {
      console.error("Failed to initialize DevTools detector:", e);
    }
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
