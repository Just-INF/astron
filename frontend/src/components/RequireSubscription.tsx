import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export function RequireSubscription({ children }: { children: ReactNode }) {
  const location = useLocation();
  const subscription = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: api.billing,
    staleTime: 30_000,
  });

  if (subscription.isPending)
    return (
      <main className="state-loading">
        <span className="loading-mark">✦</span> Checking workspace access
      </main>
    );
  if (subscription.isError)
    return (
      <main className="state-loading">
        <p>{subscription.error.message}</p>
        <button className="button button-primary" onClick={() => subscription.refetch()}>
          Retry
        </button>
      </main>
    );
  if (subscription.data.access !== "pro")
    return (
      <Navigate
        to="/account/billing"
        replace
        state={{ from: location.pathname, subscriptionRequired: true }}
      />
    );
  return children;
}
