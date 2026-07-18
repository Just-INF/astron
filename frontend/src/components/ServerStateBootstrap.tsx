import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, apiRequest, ApiError, type LayoutPayload } from "@/lib/api/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { useReservationStore } from "@/stores/useReservationStore";
import type { DiningTable, FloorZone, WallGeometry } from "@/types";
import { useRestaurantRealtime } from "@/lib/useRestaurantRealtime";

const EMPTY_TABLES: DiningTable[] = [];
const EMPTY_WALLS: WallGeometry[] = [];
const EMPTY_ZONES: FloorZone[] = [];

export function ServerStateBootstrap() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const restaurantId = currentUser?.activeRestaurantId ?? null;
  useRestaurantRealtime(restaurantId);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const user = await api.me();
      return {
        user,
        restaurants: user ? await api.restaurants() : [],
      };
    },
    retry: false,
  });
  useEffect(() => {
    if (session.data) {
      if (session.data.user)
        useAuthStore.getState().hydrateSession(session.data.user, session.data.restaurants);
      else useAuthStore.getState().finishSessionBootstrap(null);
    } else if (session.isError)
      useAuthStore
        .getState()
        .finishSessionBootstrap(
          session.error instanceof ApiError && session.error.status === 401 ? null : session.error,
        );
  }, [session.data, session.error, session.isError]);

  const menu = useQuery({
    queryKey: ["restaurant", restaurantId, "menu"],
    queryFn: () => api.menu(restaurantId!),
    enabled: Boolean(restaurantId),
  });
  const layout = useQuery({
    queryKey: ["restaurant", restaurantId, "layout"],
    queryFn: async () => ({
      ...(await api.layout(restaurantId!)),
      theme: await api.floorPlanTheme(restaurantId!),
    }),
    enabled: Boolean(restaurantId),
  });
  const reservationData = useQuery({
    queryKey: ["restaurant", restaurantId, "reservations"],
    queryFn: async () => {
      try {
        const [reservations, settings, theme] = await Promise.all([
          api.reservations(restaurantId!),
          api.reservationSettings(restaurantId!),
          api.reservationTheme(restaurantId!),
        ]);
        return { reservations, settings, theme };
      } catch (error) {
        if (error && typeof error === "object" && "status" in error && error.status === 402) {
          return {
            reservations: [],
            settings: {
              restaurantId: restaurantId!,
              maxStayMinutes: 120,
              slotMinutes: 30,
              is24_7: false,
              weeklyHours: {},
            },
            theme: {
              id: `restheme_${restaurantId!}`,
              restaurantId: restaurantId!,
              paletteId: "gold-dark" as const,
              accentColor: "#9ee1c3",
              backgroundColor: "#090d18",
              textColor: "#eef3ff",
              widthPreset: "standard" as const,
              entranceAnimationPreset: "fade" as const,
              animationSpeed: "normal" as const,
              pageTitle: "Your table is waiting.",
              pageSubtitle:
                "Choose a time, find the table that feels right, and we’ll take care of the rest.",
              showFloorPlan: true,
              layoutVariant: "guided" as const,
              stepIndicator: "numbered" as const,
              floorPlanProminence: "prominent" as const,
              tableSelectionMode: "both" as const,
              heroImage: "",
              heroHeight: "medium" as const,
              heroOverlay: 42,
              logoPlacement: "top-left" as const,
              fontPairingId: "modern-sans-clean" as const,
              heroAccentColor: "#9ee1c3",
              helperText: "",
              confirmationHeading: "Your table is held.",
              confirmationMessage: "We look forward to welcoming you.",
              confirmationImage: "",
              confirmationActions: true,
              showRestaurantLogo: false,
              customCss: "",
              isPublished: false,
              version: 0,
              updatedAt: new Date(0).toISOString(),
            },
          };
        }
        throw error;
      }
    },
    enabled: Boolean(restaurantId),
  });
  useEffect(() => {
    if (!restaurantId) {
      useAuthStore.setState({
        restaurantDataStatus: "idle",
        restaurantDataError: null,
      });
      return;
    }
    const error = menu.error ?? layout.error ?? reservationData.error;
    if (error)
      useAuthStore.setState({
        restaurantDataStatus: "error",
        restaurantDataError:
          error instanceof Error ? error.message : "Restaurant data could not be loaded.",
      });
    else if (menu.isPending || layout.isPending || reservationData.isPending)
      useAuthStore.setState({
        restaurantDataStatus: "loading",
        restaurantDataError: null,
      });
    else
      useAuthStore.setState({
        restaurantDataStatus: "ready",
        restaurantDataError: null,
      });
  }, [
    restaurantId,
    menu.error,
    menu.isPending,
    layout.error,
    layout.isPending,
    reservationData.error,
    reservationData.isPending,
  ]);
  const tables = useLayoutStore((state) =>
      restaurantId ? (state.tables[restaurantId] ?? EMPTY_TABLES) : EMPTY_TABLES,
    ),
    walls = useLayoutStore((state) =>
      restaurantId ? (state.walls[restaurantId] ?? EMPTY_WALLS) : EMPTY_WALLS,
    ),
    zones = useLayoutStore((state) =>
      restaurantId ? (state.zones[restaurantId] ?? EMPTY_ZONES) : EMPTY_ZONES,
    ),
    revision = useLayoutStore((state) =>
      restaurantId ? state.layoutRevisions[restaurantId] : undefined,
    );
  const layoutBaseline = useRef<string>("");
  useEffect(() => {
    if (restaurantId && menu.data)
      useMenuStore.setState((state) => ({
        categories: {
          ...state.categories,
          [restaurantId]: menu.data.categories,
        },
        products: { ...state.products, [restaurantId]: menu.data.products },
        taxCategories: {
          ...state.taxCategories,
          [restaurantId]: menu.data.taxCategories,
        },
        themes: { ...state.themes, [restaurantId]: menu.data.theme },
        themeHistory: {
          ...state.themeHistory,
          [restaurantId]: menu.data.versions,
        },
      }));
  }, [menu.data, restaurantId]);
  useEffect(() => {
    if (restaurantId && layout.data) {
      const signature = JSON.stringify([layout.data.tables, layout.data.walls, layout.data.zones]);
      layoutBaseline.current = signature;
      useLayoutStore.setState((state) => ({
        tables: { ...state.tables, [restaurantId]: layout.data.tables },
        walls: { ...state.walls, [restaurantId]: layout.data.walls },
        zones: { ...state.zones, [restaurantId]: layout.data.zones },
        layoutRevisions: {
          ...state.layoutRevisions,
          [restaurantId]: layout.data.revision,
        },
        floorPlanThemes: {
          ...state.floorPlanThemes,
          [restaurantId]: layout.data.theme,
        },
        publishedFloorPlanThemes: layout.data.theme?.isPublished
          ? {
              ...state.publishedFloorPlanThemes,
              [restaurantId]: layout.data.theme,
            }
          : state.publishedFloorPlanThemes,
        layoutSaveError: null,
      }));
    }
  }, [layout.data, restaurantId]);
  useEffect(() => {
    if (!restaurantId || !revision) return;
    const signature = JSON.stringify([tables, walls, zones]);
    if (!layoutBaseline.current || signature === layoutBaseline.current) return;
    const timer = window.setTimeout(() => {
      void apiRequest<LayoutPayload>(`/api/restaurants/${restaurantId}/layout`, {
        method: "PUT",
        body: JSON.stringify({
          expectedRevision: revision,
          tables,
          walls,
          zones,
        }),
      })
        .then((saved) => {
          layoutBaseline.current = JSON.stringify([saved.tables, saved.walls, saved.zones]);
          useLayoutStore.setState((state) => ({
            tables: { ...state.tables, [restaurantId]: saved.tables },
            walls: { ...state.walls, [restaurantId]: saved.walls },
            zones: { ...state.zones, [restaurantId]: saved.zones },
            layoutRevisions: {
              ...state.layoutRevisions,
              [restaurantId]: saved.revision,
            },
            layoutSaveError: null,
          }));
        })
        .catch((error) => {
          useLayoutStore.setState({
            layoutSaveError: error instanceof Error ? error.message : "Layout save failed.",
          });
          void layout.refetch();
        });
    }, 750);
    return () => window.clearTimeout(timer);
  }, [layout, restaurantId, revision, tables, walls, zones]);
  useEffect(() => {
    if (restaurantId && reservationData.data)
      useReservationStore.setState((state) => ({
        reservations: {
          ...state.reservations,
          [restaurantId]: reservationData.data.reservations,
        },
        settings: {
          ...state.settings,
          [restaurantId]: reservationData.data.settings,
        },
        reservationThemes: {
          ...state.reservationThemes,
          [restaurantId]: reservationData.data.theme,
        },
      }));
  }, [reservationData.data, restaurantId]);
  return null;
}
