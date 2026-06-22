import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import router from "./router";
import "./index.css";
import FrappeProviderWrapper from "./providers/FrappeProviderWrapper";

// Silence verbose debug console logs — keep only warn/error/critical logs
const _originalLog = console.log;
if (typeof window !== 'undefined') {
  (window as any).__original_console_log = _originalLog;
}
console.log = () => {};

// Register Service Worker for offline PWA support.
// The SW is served as a static file by Nginx from /assets/sultan/sultan_spa/sw.js
// Nginx must set: Service-Worker-Allowed: /sultan_spa/  (configured in software.conf)
// This avoids going through Frappe API which is unavailable when offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/api/method/sultan.sultan.api.sw.get_service_worker', { scope: '/sultan_spa/' })
      .then(reg => console.log('[SW] Registered, scope:', reg.scope))
      .catch(err => console.error('[SW] Registration failed:', err));
  });
}

// ReactDOM.createRoot(document.getElementById("root")!).render(
//   <React.StrictMode>
//     <RouterProvider router={router} />
//   </React.StrictMode>
// );

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FrappeProviderWrapper>
      <RouterProvider router={router} />
    </FrappeProviderWrapper>
  </React.StrictMode>
);
