import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.currentUser);
  const error = useAuthStore((state) => state.sessionError);
  const dataStatus = useAuthStore((state) => state.restaurantDataStatus);
  const dataError = useAuthStore((state) => state.restaurantDataError);
  const isDashboardRoute = location.pathname.startsWith("/dashboard");
  if (!hasHydrated)
    return (
      <main className="state-loading">
        <span className="loading-mark">✦</span> Restoring your secure session
      </main>
    );
  if (error)
    return (
      <main className="state-loading">
        <p>{error}</p>
        <button className="button button-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  if (!user) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  if (isDashboardRoute && user.activeRestaurantId && dataStatus === "loading")
    return (
      <main className="state-loading">
        <span className="loading-mark">✦</span> Loading restaurant data
      </main>
    );
  if (isDashboardRoute && dataStatus === "error" && dataError?.includes("subscription is required"))
    return (
      <Navigate
        to="/account/billing"
        replace
        state={{ from: location.pathname, subscriptionRequired: true }}
      />
    );
  if (isDashboardRoute && user.activeRestaurantId && dataStatus === "error")
    return (
      <main className="state-loading">
        <p>{dataError}</p>
        <button className="button button-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  return children;
}
