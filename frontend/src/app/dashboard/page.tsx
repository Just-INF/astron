import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpenText,
  CheckCircle2,
  Clock3,
  Eye,
  LayoutTemplate,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { DashboardPanel, EmptyState } from "@/components/dashboard/EmptyState";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useMenuStore } from "@/stores/useMenuStore";

export default function DashboardPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const restaurants = useAuthStore((state) => state.restaurants);
  const categories = useMenuStore((state) => state.categories);
  const products = useMenuStore((state) => state.products);
  const themes = useMenuStore((state) => state.themes);
  const tables = useLayoutStore((state) => state.tables);
  const restaurantId = currentUser?.activeRestaurantId ?? "";
  const restaurant = restaurants.find((item) => item.id === restaurantId);
  const restaurantProducts = products[restaurantId] ?? [];
  const restaurantCategories = categories[restaurantId] ?? [];
  const restaurantTables = tables[restaurantId] ?? [];
  const availableTables = restaurantTables.filter((table) => table.status === "available").length;
  const menuPublished = Boolean(themes[restaurantId]?.isPublished);
  const topDish = restaurantProducts[0]?.name;

  if (restaurantCategories.length === 0) {
    return (
      <DashboardPanel>
        <header className="dashboard-page-heading">
          <p className="eyebrow">Restaurant overview</p>
          <h1>
            A clear place
            <br />
            <em>to start service.</em>
          </h1>
          <p>This overview gathers the most useful signals from your menu, room and team.</p>
        </header>
        <EmptyState
          kind="menu"
          title="Design your first menu"
          description="Build categories, add dishes and set up tax rates before you share the menu with guests."
          actionLabel="Create a category"
        />
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel>
      <header className="restaurant-overview-heading">
        <div>
          <p className="eyebrow">Restaurant overview</p>
          <h1>
            Good evening,
            <br />
            <em>{restaurant?.name ?? "your team"}.</em>
          </h1>
          <p>A short, useful read on the menu, guests and floor before the next service.</p>
        </div>
      </header>
      <section className="overview-kpis">
        <Link to="/dashboard/menu">
          <span>
            <BookOpenText size={17} />
          </span>
          <div>
            <small>Menu items</small>
            <b>{restaurantProducts.length}</b>
            <p>{restaurantCategories.length} categories</p>
          </div>
          <ArrowRight size={14} />
        </Link>
        <Link to="/dashboard/layout-editor">
          <span>
            <LayoutTemplate size={17} />
          </span>
          <div>
            <small>Tables</small>
            <b>{restaurantTables.length || restaurant?.tableCount || 0}</b>
            <p>
              {restaurantTables.length ? `${availableTables} available now` : "Ready to arrange"}
            </p>
          </div>
          <ArrowRight size={14} />
        </Link>
        <Link to="/dashboard/settings">
          <span>
            <UsersRound size={17} />
          </span>
          <div>
            <small>Team</small>
            <b>{(restaurant?.teamInvites.length ?? 0) + 1}</b>
            <p>{restaurant?.teamInvites.length ?? 0} invited members</p>
          </div>
          <ArrowRight size={14} />
        </Link>
        <Link to="/dashboard/menu">
          <span>
            <CheckCircle2 size={17} />
          </span>
          <div>
            <small>Guest menu</small>
            <b>{menuPublished ? "Live" : "Offline"}</b>
            <p>{menuPublished ? "Published and visible" : "Publish when ready"}</p>
          </div>
          <ArrowRight size={14} />
        </Link>
      </section>
      <section className="overview-detail-grid">
        <article className="menu-engagement-card">
          <header>
            <div>
              <p className="eyebrow">Menu engagement</p>
              <h2>{topDish ? `${topDish} leads the menu` : "Your first guest signal is coming"}</h2>
            </div>
            <span>
              <TrendingUp size={13} /> This week
            </span>
          </header>
          <div className="engagement-hero">
            <div>
              <small>Top dish covers</small>
              <b>—</b>
              <p>Available after service begins</p>
            </div>
            <div>
              <small>Menu-attributed revenue</small>
              <b>—</b>
              <p>Waiting for transactions</p>
            </div>
          </div>
          <footer>
            <span>
              <Eye size={14} /> Service insights appear here after real orders are completed.
            </span>
            <Link to="/dashboard/analytics">
              Explore menu performance <ArrowRight size={13} />
            </Link>
          </footer>
        </article>
        <article className="evening-signal-card">
          <header>
            <span>
              <BarChart3 size={17} />
            </span>
            <p className="eyebrow">Peak hours snapshot</p>
          </header>
          <h2>No signal yet</h2>
          <p>Analytics will surface a useful service signal after the first operating period.</p>
          <div>
            <Clock3 size={14} />
            <span>Waiting for service data</span>
          </div>
          <Link to="/dashboard/analytics">
            Open analytics <ArrowRight size={14} />
          </Link>
        </article>
      </section>
    </DashboardPanel>
  );
}
