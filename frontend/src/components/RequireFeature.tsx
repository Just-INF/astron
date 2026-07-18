import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { api, type BillingFeature } from "@/lib/api/client";

export function RequireFeature({
  feature,
  children,
}: {
  feature: BillingFeature;
  children: ReactNode;
}) {
  const location = useLocation();
  const subscription = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: api.billing,
    staleTime: 30_000,
  });

  if (subscription.isPending)
    return (
      <main className="state-loading">
        <span className="loading-mark">✦</span> Checking plan access
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
  if (!subscription.data.features.includes(feature))
    return (
      <Navigate
        to="/account/billing"
        replace
        state={{ from: location.pathname, upgradeRequired: true }}
      />
    );
  return children;
}
