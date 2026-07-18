import React from "react";
import { DashboardPanel } from "@/components/dashboard/EmptyState";

const InteractiveAnalyticsPanel = React.lazy(() =>
  import("@/components/dashboard/InteractiveAnalyticsPanel").then((module) => ({
    default: module.InteractiveAnalyticsPanel,
  })),
);

export function AnalyticsDashboard() {
  return (
    <DashboardPanel>
      <React.Suspense fallback={null}>
        <InteractiveAnalyticsPanel />
      </React.Suspense>
    </DashboardPanel>
  );
}
