import { Link, Navigate, Outlet } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuthStore } from "@/stores/useAuthStore";

export default function AuthLayout() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const currentUser = useAuthStore((state) => state.currentUser);

  if (!hasHydrated)
    return (
      <main className="state-loading">
        <span className="loading-mark">✦</span> Restoring your secure session
      </main>
    );
  if (currentUser?.emailVerified)
    return <Navigate to={currentUser.activeRestaurantId ? "/account" : "/onboarding"} replace />;

  return (
    <main className="auth-page">
      <div className="auth-grid" aria-hidden="true" />
      <div className="auth-glow" aria-hidden="true" />
      <div className="auth-constellation" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <header className="auth-header">
        <Link to="/" className="auth-brand" aria-label="Astron home">
          <BrandLogo /> Astron
        </Link>
        <span className="auth-header-status">
          <i aria-hidden="true" /> Secure workspace
        </span>
      </header>
      <div className="auth-main">
        <Outlet />
      </div>
      <aside className="auth-aside">
        <span className="auth-aside-eyebrow">
          <i aria-hidden="true" /> Built for service teams
        </span>
        <blockquote>One clear view for every moment that matters.</blockquote>
        <p>Astron connects the floor, the menu, and the decisions that keep service moving.</p>
        <div className="auth-signal" aria-label="Live service signal">
          <span>
            <i /> Tonight
          </span>
          <b>
            68 <small>covers seated</small>
          </b>
          <p>Tonight’s service is moving with clarity.</p>
        </div>
        <div className="auth-pace" aria-label="Service pace signal">
          <div>
            <span>SEATING PACE</span>
            <b>+12%</b>
          </div>
          <div className="auth-pace-chart" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <p>Arrivals are pacing ahead of the last hour.</p>
        </div>
      </aside>
    </main>
  );
}
