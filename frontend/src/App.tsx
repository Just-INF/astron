import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import RootLayout from "@/app/layout";
import AccountLayout from "@/app/account/layout";
import AuthLayout from "@/app/auth/layout";
import DashboardLayout from "@/app/dashboard/layout";
import NotFound from "@/components/NotFound";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireSubscription } from "@/components/RequireSubscription";
import { RequireFeature } from "@/components/RequireFeature";

const HomePage = lazy(() => import("@/app/page"));
const OnboardingPage = lazy(() => import("@/app/onboarding/page"));
const CookiesPage = lazy(() => import("@/app/cookies/page"));
const PrivacyPage = lazy(() => import("@/app/privacy/page"));
const TermsPage = lazy(() => import("@/app/terms/page"));
const MenuRestaurantPage = lazy(() => import("@/app/menu/[restaurantId]/page"));
const ReserveRestaurantPage = lazy(() => import("@/app/reserve/[restaurantId]/page"));
const AccountPage = lazy(() => import("@/app/account/page"));
const AccountBillingPage = lazy(() => import("@/app/account/billing/page"));
const AccountSettingsPage = lazy(() => import("@/app/account/settings/page"));
const AuthLoginPage = lazy(() => import("@/app/auth/login/page"));
const AuthRegisterPage = lazy(() => import("@/app/auth/register/page"));
const AuthForgotPasswordPage = lazy(() => import("@/app/auth/forgot-password/page"));
const AuthResetPasswordPage = lazy(() => import("@/app/auth/reset-password/page"));
const AuthVerifyEmailPage = lazy(() => import("@/app/auth/verify-email/page"));
const DashboardPage = lazy(() => import("@/app/dashboard/page"));
const DashboardMenuPage = lazy(() => import("@/app/dashboard/menu/page"));
const DashboardLayoutEditorPage = lazy(() => import("@/app/dashboard/layout-editor/page"));
const DashboardTablesPage = lazy(() => import("@/app/dashboard/tables/page"));
const DashboardOrdersPage = lazy(() => import("@/app/dashboard/orders/page"));
const DashboardAnalyticsPage = lazy(() => import("@/app/dashboard/analytics/page"));
const DashboardSettingsPage = lazy(() => import("@/app/dashboard/settings/page"));
const DashboardMcpSettingsPage = lazy(() => import("@/app/dashboard/settings/mcp/page"));

export default function App() {
  return (
    <Suspense
      fallback={
        <main className="route-loading" aria-live="polite">
          Loading Astron…
        </main>
      }
    >
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<HomePage />} />
          <Route
            path="onboarding"
            element={
              <RequireAuth>
                <RequireSubscription>
                  <OnboardingPage />
                </RequireSubscription>
              </RequireAuth>
            }
          />
          <Route path="cookies" element={<CookiesPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="menu/:restaurantId" element={<MenuRestaurantPage />} />
          <Route path="menu/:restaurantId/:tableNumber" element={<MenuRestaurantPage />} />

          <Route path="reserve/:restaurantId" element={<ReserveRestaurantPage />} />
          <Route path="reserve/:restaurantId/:tableNumber" element={<ReserveRestaurantPage />} />

          <Route
            path="account"
            element={
              <RequireAuth>
                <AccountLayout />
              </RequireAuth>
            }
          >
            <Route index element={<AccountPage />} />
            <Route path="billing" element={<AccountBillingPage />} />
            <Route path="settings" element={<AccountSettingsPage />} />
          </Route>

          <Route path="auth" element={<AuthLayout />}>
            <Route path="login" element={<AuthLoginPage />} />
            <Route path="register" element={<AuthRegisterPage />} />
            <Route path="forgot-password" element={<AuthForgotPasswordPage />} />
            <Route path="reset-password" element={<AuthResetPasswordPage />} />
            <Route path="verify-email" element={<AuthVerifyEmailPage />} />
          </Route>

          <Route
            path="dashboard"
            element={
              <RequireAuth>
                <RequireSubscription>
                  <DashboardLayout />
                </RequireSubscription>
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="menu" element={<DashboardMenuPage />} />
            <Route
              path="layout-editor"
              element={
                <RequireFeature feature="floorPlan">
                  <DashboardLayoutEditorPage />
                </RequireFeature>
              }
            />
            <Route path="tables" element={<DashboardTablesPage />} />
            <Route
              path="orders"
              element={
                <RequireFeature feature="orders">
                  <DashboardOrdersPage />
                </RequireFeature>
              }
            />
            <Route
              path="analytics"
              element={
                <RequireFeature feature="analytics">
                  <DashboardAnalyticsPage />
                </RequireFeature>
              }
            />
            <Route path="settings" element={<DashboardSettingsPage />} />
            <Route
              path="settings/mcp"
              element={
                <RequireFeature feature="nora">
                  <DashboardMcpSettingsPage />
                </RequireFeature>
              }
            />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
