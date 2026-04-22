import { createBrowserRouter, Navigate } from "react-router";
import { AuthProvider } from "../lib/auth/AuthContext";
import { ProtectedRoute } from "../lib/auth/ProtectedRoute";
import { Layout } from "./components/layout/Layout";
import { Dashboard } from "./pages/Dashboard";
import { StockDetail } from "./pages/StockDetail";
import { Screener } from "./pages/Screener";
import { Announcements } from "./pages/Announcements";
import { Watchlist } from "./pages/Watchlist";
import { Markets } from "./pages/Markets";
import { Alerts } from "./pages/Alerts";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/auth/Login";
import { Register } from "./pages/auth/Register";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { UserManagement } from "./pages/admin/UserManagement";
import { DataSync } from "./pages/admin/DataSync";
import { ModelManagement } from "./pages/admin/ModelManagement";
import { JobLogs } from "./pages/admin/JobLogs";
import { AnnouncementReview } from "./pages/admin/AnnouncementReview";
import { AlertMonitor } from "./pages/admin/AlertMonitor";
import { SystemSettings } from "./pages/admin/SystemSettings";
import { NotFound } from "./pages/NotFound";

// Wrapper to provide AuthContext to all routes
function RootLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <RootLayout>
        <Layout />
      </RootLayout>
    ),
    children: [
      // User routes (PUBLIC - no login required)
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: "markets",
        element: <Markets />,
      },
      {
        path: "stock/:symbol",
        element: <StockDetail />,
      },
      {
        path: "screener",
        element: <Screener />,
      },
      {
        path: "announcements",
        element: <Announcements />,
      },
      {
        path: "watchlist",
        element: (
          <ProtectedRoute>
            <Watchlist />
          </ProtectedRoute>
        ),
      },
      {
        path: "alerts",
        element: (
          <ProtectedRoute>
            <Alerts />
          </ProtectedRoute>
        ),
      },
      {
        path: "settings",
        element: (
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        ),
      },
      // Admin routes (PROTECTED - admin only)
      {
        path: "admin",
        element: (
          <ProtectedRoute requireAdmin>
            <AdminDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: "admin/models",
        element: (
          <ProtectedRoute requireAdmin>
            <ModelManagement />
          </ProtectedRoute>
        ),
      },
      {
        path: "admin/sync",
        element: (
          <ProtectedRoute requireAdmin>
            <DataSync />
          </ProtectedRoute>
        ),
      },
      {
        path: "admin/jobs",
        element: (
          <ProtectedRoute requireAdmin>
            <JobLogs />
          </ProtectedRoute>
        ),
      },
      {
        path: "admin/users",
        element: (
          <ProtectedRoute requireAdmin>
            <UserManagement />
          </ProtectedRoute>
        ),
      },
      {
        path: "admin/announcements",
        element: (
          <ProtectedRoute requireAdmin>
            <AnnouncementReview />
          </ProtectedRoute>
        ),
      },
      {
        path: "admin/alerts",
        element: (
          <ProtectedRoute requireAdmin>
            <AlertMonitor />
          </ProtectedRoute>
        ),
      },
      {
        path: "admin/settings",
        element: (
          <ProtectedRoute requireAdmin>
            <SystemSettings />
          </ProtectedRoute>
        ),
      },
    ],
  },
  // Public auth routes (outside main layout)
  {
    path: "/login",
    element: (
      <RootLayout>
        <Login />
      </RootLayout>
    ),
  },
  {
    path: "/register",
    element: (
      <RootLayout>
        <Register />
      </RootLayout>
    ),
  },
  // 404 page
  {
    path: "*",
    element: <NotFound />,
  },
]);