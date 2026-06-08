import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import router from "./router";
import "./index.css";
import FrappeProviderWrapper from "./providers/FrappeProviderWrapper";

// Register Service Worker for offline PWA support.
// The SW lives at /assets/sultan/sultan_spa/sw.js; the scope header
// "Service-Worker-Allowed: /sultan_spa/" must be set by the server for
// the SW to control /sultan_spa/ pages (add to Nginx assets location block).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/assets/sultan/sultan_spa/sw.js', { scope: '/sultan_spa/' })
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
