import { createBrowserRouter } from "react-router-dom";
import LoginPage from "../pages/LoginPage";
import POSPage from "../pages/POSPage";
import DashboardPage from "../pages/DashboardPage";
import ClosingShiftPage from "../pages/ClosingShiftPage";
import SettingsPage from "../pages/SettingsPage";
import PaymentPage from "../pages/PaymentPage";
import CustomersPage from "../components/CustomersPage";
import CartPage from "../components/CartPage";
import MobileCustomersPage from "../components/MobileCustomersPage";
import MobileAddCustomerPage from "../components/MobileAddCustomerPage";
import MobilePaymentPage from "../components/MobilePaymentPage";
import ProtectedRoute from "../components/ProtectedRoute";
import App from "../App";
import HomePage from "../pages/HomePage";
import InvoiceHistoryPage from "../pages/InvoiceHistory";
import InvoiceViewPage from "../pages/InvoiceViewPage";
import CustomerDetailsPage from "../pages/CustomerPageDetails";
import OrderStationPage from "../pages/OrderStationPage";
import BranchSessionsPage from "../pages/BranchSessionsPage";
import CashTransactionsReportPage from "../pages/CashTransactionsReportPage";

import EmployeeLoginScreen from "../pages/EmployeeLoginScreen";
import SecurityAuditPage from "../pages/SecurityAuditPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <HomePage />, // This will redirect to /pos or /login
      },
      {
        path: "login",
        element: <LoginPage />,
      },
      {
        path: "employee-login",
        element: <EmployeeLoginScreen />,
      },
      {
        path: "pos",
        element: <ProtectedRoute element={<POSPage />} />,
      },
      {
        path: "order-station",
        element: <ProtectedRoute element={<OrderStationPage />} />,
      },

      {
        path: "sales_dashboard",
        element: <ProtectedRoute element={<DashboardPage />} />,
      },
      {
        path: "cash_transactions_report",
        element: <ProtectedRoute element={<CashTransactionsReportPage />} />,
      },
      {
        path: "branch-sessions",
        element: <ProtectedRoute element={<BranchSessionsPage />} />,
      },
      {
        path: "closing_shift",
        element: <ProtectedRoute element={<ClosingShiftPage />} />,
      },
      {
        path: "invoice",
        element: <ProtectedRoute element={<InvoiceHistoryPage />} />,
      },
      {
        path: "invoice/:id",
        element: <ProtectedRoute element={<InvoiceViewPage />} />,
      },
      {
        path: "customers/:id",
        element: <ProtectedRoute element={<CustomerDetailsPage />} />,
      },
      {
        path: "cart",
        element: <ProtectedRoute element={<CartPage />} />,
      },
      {
        path: "mobile/customers",
        element: <ProtectedRoute element={<MobileCustomersPage />} />,
      },
      {
        path: "mobile/add-customer",
        element: <ProtectedRoute element={<MobileAddCustomerPage />} />,
      },
      {
        path: "mobile/payment",
        element: <ProtectedRoute element={<MobilePaymentPage />} />,
      },
      {
        path: "settings",
        element: <ProtectedRoute element={<SettingsPage />} />,
      },
      {
        path: "security_audit",
        element: <ProtectedRoute element={<SecurityAuditPage />} />,
      },
      {
        path: "payment/:invoiceId",
        element: <ProtectedRoute element={<PaymentPage />} />,
      },
    ],
  },
], {
  basename: "/sultan_spa"
});

export default router;
