import { create } from "zustand";
import { api, apiRequest } from "@/lib/api/client";
import { queryClient } from "@/lib/queryClient";
import type { MembershipRole, OnboardingDetails, Restaurant, UserSession } from "@/types";

interface AuthState {
  currentUser: UserSession | null;
  restaurants: Restaurant[];
  accounts: [];
  hasHydrated: boolean;
  isSwitchingTenant: boolean;
  sessionError: string | null;
  restaurantDataStatus: "idle" | "loading" | "ready" | "error";
  restaurantDataError: string | null;
}
interface AuthActions {
  hydrateSession: (user: UserSession, restaurants: Restaurant[]) => void;
  finishSessionBootstrap: (error: unknown | null) => void;
  register: (name: string, email: string, password: string) => Promise<UserSession>;
  login: (email: string, password: string) => Promise<{ needsOnboarding: boolean }>;
  logout: () => Promise<void>;
  completeOnboarding: (details: OnboardingDetails) => Promise<string | null>;
  switchRestaurant: (restaurantId: string) => void;
  updateAccount: (details: { name: string; email: string }) => Promise<UserSession>;
  updateRestaurant: (restaurantId: string, details: Partial<Restaurant>) => Promise<void>;
  addRestaurantTeamMember: (
    restaurantId: string,
    email: string,
    role?: Exclude<MembershipRole, "owner">,
  ) => Promise<void>;
  removeRestaurantTeamMember: (restaurantId: string, email: string) => Promise<void>;
  setHasHydrated: (hasHydrated: boolean) => void;
}
export type AuthStore = AuthState & AuthActions;

function savedRestaurantId() {
  try {
    return localStorage.getItem("astron_active_restaurant");
  } catch {
    return null;
  }
}
function withActive(user: UserSession, id: string | null): UserSession {
  return {
    ...user,
    activeRestaurantId:
      id && user.restaurantIds.includes(id) ? id : (user.restaurantIds[0] ?? null),
  };
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  currentUser: null,
  restaurants: [],
  accounts: [],
  hasHydrated: false,
  isSwitchingTenant: false,
  sessionError: null,
  restaurantDataStatus: "idle",
  restaurantDataError: null,
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
  hydrateSession: (user, restaurants) =>
    set({
      currentUser: withActive(user, savedRestaurantId()),
      restaurants,
      hasHydrated: true,
      sessionError: null,
    }),
  finishSessionBootstrap: (error) =>
    set((state) => ({
      currentUser: error ? state.currentUser : null,
      restaurants: error ? state.restaurants : [],
      hasHydrated: true,
      sessionError: error instanceof Error ? error.message : null,
    })),
  register: async (name, email, password) => {
    const user = await api.register(name, email, password);
    set({ currentUser: null, restaurants: [], hasHydrated: true, sessionError: null });
    queryClient.setQueryData(["session"], { user: null, restaurants: [] });
    return user;
  },
  login: async (email, password) => {
    const user = await api.login(email, password);
    const restaurants = await api.restaurants();
    const currentUser = withActive(user, savedRestaurantId());
    set({ currentUser, restaurants, hasHydrated: true });
    queryClient.setQueryData(["session"], { user: currentUser, restaurants });
    return { needsOnboarding: user.needsOnboarding };
  },
  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({
        currentUser: null,
        restaurants: [],
        isSwitchingTenant: false,
        hasHydrated: true,
      });
      queryClient.clear();
    }
  },
  completeOnboarding: async (details) => {
    const restaurant = await api.createRestaurant(details);
    const user = get().currentUser;
    if (!user) return null;
    const currentUser = {
      ...user,
      activeRestaurantId: restaurant.id,
      restaurantIds: [...user.restaurantIds, restaurant.id],
    };
    localStorage.setItem("astron_active_restaurant", restaurant.id);
    set((state) => ({
      restaurants: [...state.restaurants, restaurant],
      currentUser,
    }));
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    return restaurant.id;
  },
  switchRestaurant: (restaurantId) => {
    const user = get().currentUser;
    if (!user?.restaurantIds.includes(restaurantId)) return;
    localStorage.setItem("astron_active_restaurant", restaurantId);
    set({
      isSwitchingTenant: true,
      currentUser: { ...user, activeRestaurantId: restaurantId },
      restaurantDataStatus: "loading",
      restaurantDataError: null,
    });
    window.setTimeout(() => set({ isSwitchingTenant: false }), 150);
  },
  updateAccount: async (details) => {
    const user = await api.updateMe(details);
    set((state) => ({
      currentUser: state.currentUser
        ? {
            ...state.currentUser,
            ...user,
            activeRestaurantId: state.currentUser.activeRestaurantId,
          }
        : null,
    }));
    return user;
  },
  updateRestaurant: async (restaurantId, details) => {
    const updated = await api.updateRestaurant(restaurantId, details);
    set((state) => ({
      restaurants: state.restaurants.map((restaurant) =>
        restaurant.id === restaurantId ? updated : restaurant,
      ),
    }));
  },
  addRestaurantTeamMember: async (restaurantId, email, role = "viewer") => {
    await api.invite(restaurantId, email, role);
    set((state) => ({
      restaurants: state.restaurants.map((restaurant) =>
        restaurant.id === restaurantId
          ? { ...restaurant, teamInvites: [...restaurant.teamInvites, email] }
          : restaurant,
      ),
    }));
  },
  removeRestaurantTeamMember: async (restaurantId, email) => {
    await apiRequest(
      `/api/restaurants/${restaurantId}/invitations?email=${encodeURIComponent(email)}`,
      { method: "DELETE" },
    );
    set((state) => ({
      restaurants: state.restaurants.map((restaurant) =>
        restaurant.id === restaurantId
          ? {
              ...restaurant,
              teamInvites: restaurant.teamInvites.filter((member) => member !== email),
            }
          : restaurant,
      ),
    }));
  },
}));
