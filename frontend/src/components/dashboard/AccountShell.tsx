import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Building2,
  CircleUserRound,
  CreditCard,
  LogOut,
  Settings2,
  UtensilsCrossed,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuthStore } from "@/stores/useAuthStore";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

const accountNavigation = [
  { href: "/account", label: "Restaurants", icon: Building2 },
  { href: "/account/billing", label: "Billing", icon: CreditCard },
  { href: "/account/settings", label: "Account settings", icon: Settings2 },
];

export function AccountShell({ children }: Readonly<{ children: ReactNode }>) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const currentUser = useAuthStore((state) => state.currentUser);
  const restaurants = useAuthStore((state) => state.restaurants);
  const logout = useAuthStore((state) => state.logout);
  const subscription = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: api.billing,
    staleTime: 30_000,
  });
  const activeRestaurant = restaurants.find(
    (restaurant) => restaurant.id === currentUser?.activeRestaurantId,
  );
  const hasWorkspaceAccess = subscription.data?.access === "pro";

  useEffect(() => {
    if (hasHydrated && !currentUser) navigate("/auth/login", { replace: true });
  }, [currentUser, hasHydrated, navigate]);

  if (!hasHydrated || !currentUser)
    return (
      <main className="state-loading">
        <span className="loading-mark">
          <Building2 size={14} />
        </span>
        Opening your account
      </main>
    );

  return (
    <div className="dashboard-frame account-frame">
      <aside className="dashboard-sidebar">
        <Link to="/account" className="dashboard-wordmark">
          <BrandLogo /> Astron
        </Link>
        <div className="account-context">
          <span>Account workspace</span>
          <b>{currentUser.name}</b>
          <small>
            {
              restaurants.filter((restaurant) => currentUser.restaurantIds.includes(restaurant.id))
                .length
            }{" "}
            restaurant{currentUser.restaurantIds.length === 1 ? "" : "s"}
          </small>
        </div>
        <p className="sidebar-section-label">Manage</p>
        <nav aria-label="Account navigation">
          {accountNavigation.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/account" ? pathname === item.href : pathname.startsWith(item.href);
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
                    layoutId="account-active-nav"
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
            <span>Astron account</span>
            <b>Portfolio</b>
          </p>
          <div>
            {activeRestaurant &&
              (hasWorkspaceAccess ? (
                <Link to="/dashboard" className="account-open-button">
                  <UtensilsCrossed size={14} /> Open {activeRestaurant.name}
                </Link>
              ) : (
                <Link to="/account/billing" className="account-open-button is-locked">
                  <UtensilsCrossed size={14} /> Subscription required
                </Link>
              ))}
            <Link to="/account/settings" className="user-chip">
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
    </div>
  );
}
