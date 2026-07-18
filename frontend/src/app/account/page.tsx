import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  Plus,
  Store,
  UsersRound,
  UtensilsCrossed,
} from "lucide-react";
import { DashboardPanel } from "@/components/dashboard/EmptyState";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export default function AccountRestaurantsPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const restaurants = useAuthStore((state) => state.restaurants);
  const switchRestaurant = useAuthStore((state) => state.switchRestaurant);
  const products = useMenuStore((state) => state.products);
  const tables = useLayoutStore((state) => state.tables);
  const subscription = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: api.billing,
    staleTime: 30_000,
  });
  const ownedRestaurants = restaurants.filter((restaurant) =>
    currentUser?.restaurantIds.includes(restaurant.id),
  );
  const hasWorkspaceAccess = subscription.data?.access === "pro";

  function openRestaurant(restaurantId: string) {
    if (restaurantId !== currentUser?.activeRestaurantId) switchRestaurant(restaurantId);
    window.setTimeout(
      () => navigate("/dashboard"),
      restaurantId === currentUser?.activeRestaurantId ? 0 : 330,
    );
  }

  return (
    <DashboardPanel>
      <header className="account-page-heading">
        <div>
          <p className="eyebrow">Account portfolio</p>
          <h1>
            Your restaurants,
            <br />
            <em>clearly organised.</em>
          </h1>
          <p>
            {hasWorkspaceAccess
              ? "Choose a restaurant to enter its operational workspace, or manage your account from one place."
              : "An active subscription is required to open or create a restaurant workspace."}
          </p>
        </div>
        <Link
          className="button button-primary"
          to={hasWorkspaceAccess ? "/onboarding" : "/account/billing"}
        >
          {hasWorkspaceAccess ? (
            <>
              <Plus size={15} /> Add restaurant
            </>
          ) : (
            <>
              Unlock workspaces <ArrowRight size={15} />
            </>
          )}
        </Link>
      </header>
      <section className="account-summary" aria-label="Account summary">
        <article>
          <span>
            <Store size={17} />
          </span>
          <div>
            <small>Restaurants</small>
            <b>{ownedRestaurants.length}</b>
          </div>
        </article>
        <article>
          <span>
            <UsersRound size={17} />
          </span>
          <div>
            <small>Team members</small>
            <b>
              {ownedRestaurants.reduce(
                (sum, restaurant) => sum + restaurant.teamInvites.length + 1,
                0,
              )}
            </b>
          </div>
        </article>
        <article>
          <span>
            <CheckCircle2 size={17} />
          </span>
          <div>
            <small>Workspace status</small>
            <b>Active</b>
          </div>
        </article>
      </section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Restaurants</p>
          <h2>Operational workspaces</h2>
        </div>
        <span>{ownedRestaurants.length} total</span>
      </div>
      <section className="restaurant-grid">
        {ownedRestaurants.map((restaurant, index) => {
          const itemCount = products[restaurant.id]?.length ?? 0;
          const tableCount = tables[restaurant.id]?.length ?? restaurant.tableCount;
          const isActive = restaurant.id === currentUser?.activeRestaurantId;
          return (
            <motion.article
              key={restaurant.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <header>
                <span className="restaurant-monogram">
                  {restaurant.name.slice(0, 2).toUpperCase()}
                </span>
                {isActive && (
                  <small>
                    <i /> Active
                  </small>
                )}
              </header>
              <div className="restaurant-card-copy">
                <p>{restaurant.cuisineType}</p>
                <h3>{restaurant.name}</h3>
                <span>
                  <MapPin size={12} /> {restaurant.timezone.replace("_", " ")} ·{" "}
                  {restaurant.currency}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Menu items</dt>
                  <dd>{itemCount}</dd>
                </div>
                <div>
                  <dt>Tables</dt>
                  <dd>{tableCount}</dd>
                </div>
                <div>
                  <dt>Team</dt>
                  <dd>{restaurant.teamInvites.length + 1}</dd>
                </div>
              </dl>
              <button disabled={!hasWorkspaceAccess} onClick={() => openRestaurant(restaurant.id)}>
                {hasWorkspaceAccess ? "Open restaurant" : "Subscription required"}{" "}
                <ArrowRight size={14} />
              </button>
            </motion.article>
          );
        })}
        <Link
          to={hasWorkspaceAccess ? "/onboarding" : "/account/billing"}
          className="add-restaurant-card"
        >
          <span>
            <Plus size={19} />
          </span>
          <div>
            <b>{hasWorkspaceAccess ? "Add another restaurant" : "Subscription required"}</b>
            <small>
              {hasWorkspaceAccess
                ? "Create a separate menu, floor, team, and analytics workspace."
                : "Open Billing to unlock restaurant workspaces."}
            </small>
          </div>
          <ArrowRight size={15} />
        </Link>
      </section>
      <section className="account-help-strip">
        <span>
          <UtensilsCrossed size={18} />
        </span>
        <div>
          <b>Each restaurant stays independent.</b>
          <p>
            Menus, floor plans, team access and analytics remain scoped to the restaurant you open.
          </p>
        </div>
        <Link to="/account/billing">
          Review your plan <ArrowRight size={14} />
        </Link>
      </section>
    </DashboardPanel>
  );
}
