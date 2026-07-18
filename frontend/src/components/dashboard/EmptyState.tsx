import type { ReactNode } from "react";
import { BarChart3, BookOpenText, LayoutTemplate } from "lucide-react";
import { useNavigate } from "react-router-dom";

type EmptyStateKind = "menu" | "layout" | "analytics";
const visuals = { menu: BookOpenText, layout: LayoutTemplate, analytics: BarChart3 };
const kindToPath: Record<EmptyStateKind, string> = {
  menu: "/dashboard/menu",
  layout: "/dashboard/layout-editor",
  analytics: "/dashboard/analytics",
};

export function EmptyState({
  kind,
  title,
  description,
  actionLabel,
}: {
  kind: EmptyStateKind;
  title: string;
  description: string;
  actionLabel: string;
}) {
  const navigate = useNavigate();
  const Icon = visuals[kind];
  return (
    <section className={`empty-state empty-${kind}`}>
      <div className="empty-illustration">
        <span />
        <span />
        <span />
        <Icon size={28} />
      </div>
      <p className="eyebrow">A clear first step</p>
      <h2>{title}</h2>
      <p>{description}</p>
      <button
        className="button button-primary"
        type="button"
        onClick={() => navigate(kindToPath[kind])}
      >
        {actionLabel}
      </button>
    </section>
  );
}

export function DashboardPanel({ children }: Readonly<{ children: ReactNode }>) {
  return <section className="dashboard-content">{children}</section>;
}
