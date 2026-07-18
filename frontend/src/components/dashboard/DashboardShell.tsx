import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3,
  BookOpenText,
  Building2,
  CircleUserRound,
  ClipboardList,
  LayoutPanelTop,
  LogOut,
  Settings2,
  Sparkles,
  Utensils,
} from "lucide-react";
import { NoraDrawer } from "@/components/dashboard/NoraDrawer";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNoraStore } from "@/stores/useNoraStore";
import { useQuery } from "@tanstack/react-query";
import { api, type BillingFeature } from "@/lib/api/client";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutPanelTop },
  { href: "/dashboard/menu", label: "Digital menu", icon: BookOpenText },
  { href: "/dashboard/tables", label: "Tables", icon: Utensils },
  {
    href: "/dashboard/orders",
    label: "Orders",
    icon: ClipboardList,
    operational: true,
    feature: "orders" as BillingFeature,
  },
  {
    href: "/dashboard/layout-editor",
    label: "Floor plan",
    icon: Sparkles,
    feature: "floorPlan" as BillingFeature,
  },
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    icon: BarChart3,
    feature: "analytics" as BillingFeature,
  },
  { href: "/dashboard/settings", label: "Restaurant settings", icon: Settings2 },
];

function LoadingState({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="state-loading">
      <span className="loading-mark">
        <Sparkles size={14} />
      </span>
      {children}
    </main>
  );
}

export function DashboardShell({ children }: Readonly<{ children: ReactNode }>) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const currentUser = useAuthStore((state) => state.currentUser);
  const restaurants = useAuthStore((state) => state.restaurants);
  const logout = useAuthStore((state) => state.logout);
  const isSwitchingTenant = useAuthStore((state) => state.isSwitchingTenant);
  const setNoraOpen = useNoraStore((state) => state.setOpen);
  const subscription = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: api.billing,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!hasHydrated) return;
    if (!currentUser) {
      navigate("/auth/login", { replace: true });
      return;
    }
    if (!currentUser.activeRestaurantId || currentUser.restaurantIds.length === 0)
      navigate("/onboarding", { replace: true });
  }, [currentUser, hasHydrated, navigate]);

  if (!hasHydrated || !currentUser || !currentUser.activeRestaurantId)
    return <LoadingState>Opening the operations room</LoadingState>;
  const currentRestaurant = restaurants.find(
    (restaurant) => restaurant.id === currentUser.activeRestaurantId,
  );
  if (!currentRestaurant) return <LoadingState>Aligning your restaurant context</LoadingState>;
  const role = currentUser.memberships.find(
    (membership) => membership.restaurantId === currentUser.activeRestaurantId,
  )?.role;
  const canOpenOrders = ["owner", "manager", "host", "waiter", "chef"].includes(role ?? "");
  const features = subscription.data?.features ?? [];
  const hasFeature = (feature?: BillingFeature) => !feature || features.includes(feature);

  return (
    <div className="dashboard-frame">
      <aside className="dashboard-sidebar">
        <Link to="/dashboard" className="dashboard-wordmark">
          <BrandLogo /> Astron
        </Link>
        <p className="sidebar-section-label">Restaurant workspace</p>
        <nav aria-label="Dashboard navigation">
          {navigation
            .filter((item) => hasFeature(item.feature) && (!item.operational || canOpenOrders))
            .map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/dashboard" || item.href === "/dashboard/settings"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "active" : ""}
                  to={item.href}
                  key={item.href}
                >
                  {active && (
                    <motion.span
                      aria-hidden="true"
                      className="sidebar-active-orbit"
                      layoutId="dashboard-active-nav"
                      transition={{ type: "spring", stiffness: 440, damping: 34 }}
                    />
                  )}
                  <Icon size={17} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </nav>
        <div className="sidebar-bottom">
          <Link className="all-restaurants-link" to="/account">
            <span>
              <Building2 size={15} />
            </span>
            <span>All restaurants</span>
          </Link>
          <button
            onClick={() => {
              logout();
              navigate("/");
            }}
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <p>
            <span>{currentRestaurant.cuisineType}</span>
            <b>{currentRestaurant.name}</b>
          </p>
          <div>
            <Link
              to="/account/settings"
              className="user-chip"
              aria-label={`Open account settings for ${currentUser.name}`}
            >
              <CircleUserRound size={18} />
              <span>{currentUser.name}</span>
            </Link>
          </div>
        </header>
        <motion.div
          className="dashboard-route"
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      </div>
      {features.includes("nora") && ["owner", "manager"].includes(role ?? "") && (
        <>
          <button
            className="nora-floating-action"
            type="button"
            aria-label="Open Nora business assistant"
            onClick={() => setNoraOpen(true)}
          >
            <span>
              <Sparkles size={17} />
            </span>
            <b>Nora</b>
            <small>AI assistant</small>
          </button>
          <NoraDrawer />
        </>
      )}
      {isSwitchingTenant && (
        <div className="tenant-overlay" role="status">
          <span className="loading-mark">
            <Sparkles size={14} />
          </span>
          <p>Switching rooms</p>
        </div>
      )}
    </div>
  );
}
