import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  DayHours,
  Reservation,
  ReservationSettings,
  ReservationStatus,
  ReservationTheme,
} from "@/types";
import { api, apiRequest } from "@/lib/api/client";

const reservationThemeWrites = new Map<string, Promise<void>>();
function queueReservationThemeWrite<T>(restaurantId: string, write: () => Promise<T>): Promise<T> {
  const previous = reservationThemeWrites.get(restaurantId) ?? Promise.resolve();
  const next = previous.then(write, write);
  reservationThemeWrites.set(
    restaurantId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

async function refreshReservations(restaurantId: string) {
  const [reservations, settings, theme] = await Promise.all([
    api.reservations(restaurantId),
    api.reservationSettings(restaurantId),
    api.reservationTheme(restaurantId),
  ]);
  useReservationStore.setState((state) => ({
    reservations: { ...state.reservations, [restaurantId]: reservations },
    settings: { ...state.settings, [restaurantId]: settings },
    reservationThemes: { ...state.reservationThemes, [restaurantId]: theme },
  }));
}
function syncReservations(restaurantId: string, request: Promise<unknown>) {
  void request
    .then(() => refreshReservations(restaurantId))
    .catch(async () => {
      try {
        await refreshReservations(restaurantId);
      } catch {
        /* The global server-state boundary exposes persistent fetch failures. */
      }
    });
}

interface ReservationState {
  reservations: Record<string, Reservation[]>;
  settings: Record<string, ReservationSettings>;
  reservationThemes: Record<string, ReservationTheme>;
  publishedReservationThemes: Record<string, ReservationTheme>;
}

interface ReservationActions {
  addReservation: (
    restaurantId: string,
    input: Omit<Reservation, "id" | "restaurantId" | "createdAt"> & {
      status?: ReservationStatus;
    },
  ) => string;
  updateReservation: (
    restaurantId: string,
    id: string,
    patch: Partial<Omit<Reservation, "id" | "restaurantId" | "createdAt">>,
  ) => void;
  rescheduleReservation: (
    restaurantId: string,
    id: string,
    input: Pick<Reservation, "tableId" | "date" | "startTime">,
  ) => void;
  cancelReservation: (restaurantId: string, id: string) => void;
  deleteReservation: (restaurantId: string, id: string) => void;
  updateSettings: (
    restaurantId: string,
    patch: Partial<Omit<ReservationSettings, "restaurantId">>,
  ) => void;
  updateReservationTheme: (
    restaurantId: string,
    patch: Partial<Omit<ReservationTheme, "id" | "restaurantId" | "updatedAt">>,
  ) => void;
  publishReservationTheme: (restaurantId: string) => Promise<void>;
}

export type ReservationStore = ReservationState & ReservationActions;

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
function timestamp(): string {
  return new Date().toISOString();
}

export function defaultReservationSettings(restaurantId: string): ReservationSettings {
  const weeklyHours: Record<number, DayHours> = {};
  for (let d = 0; d < 7; d += 1) weeklyHours[d] = { open: "11:00", close: "23:00", closed: false };
  return {
    restaurantId,
    maxStayMinutes: 120,
    slotMinutes: 30,
    is24_7: false,
    weeklyHours,
  };
}

export function defaultReservationTheme(restaurantId: string): ReservationTheme {
  return {
    id: `restheme_${restaurantId}`,
    restaurantId,
    paletteId: "gold-dark",
    accentColor: "#9ee1c3",
    backgroundColor: "#090d18",
    textColor: "#eef3ff",
    widthPreset: "standard",
    entranceAnimationPreset: "fade",
    animationSpeed: "normal",
    pageTitle: "Your table is waiting.",
    pageSubtitle:
      "Choose a time, find the table that feels right, and we’ll take care of the rest.",
    showFloorPlan: true,
    layoutVariant: "guided",
    stepIndicator: "numbered",
    floorPlanProminence: "prominent",
    tableSelectionMode: "both",
    heroImage: "",
    heroHeight: "medium",
    heroOverlay: 42,
    logoPlacement: "top-left",
    fontPairingId: "modern-sans-clean",
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
  };
}

export function normalizeReservationSettings(
  raw: Partial<ReservationSettings> | undefined,
  restaurantId: string,
): ReservationSettings {
  const base = defaultReservationSettings(restaurantId);
  if (!raw) return base;
  const weeklyHours: Record<number, DayHours> = { ...base.weeklyHours };
  if (raw.weeklyHours) {
    for (let d = 0; d < 7; d += 1) {
      const day = raw.weeklyHours[d];
      if (day)
        weeklyHours[d] = {
          open: day.open || "11:00",
          close: day.close || "23:00",
          closed: Boolean(day.closed),
        };
    }
  }
  return {
    restaurantId,
    maxStayMinutes: raw.maxStayMinutes ?? base.maxStayMinutes,
    slotMinutes: raw.slotMinutes ?? base.slotMinutes,
    is24_7: raw.is24_7 ?? base.is24_7,
    weeklyHours,
  };
}

export function getEffectiveDayHours(settings: ReservationSettings, dayIndex: number): DayHours {
  if (settings.is24_7) return { open: "00:00", close: "24:00", closed: false };
  return (
    settings.weeklyHours[dayIndex] ?? {
      open: "11:00",
      close: "23:00",
      closed: false,
    }
  );
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function minutesToTime(minutes: number): string {
  if (minutes === 1440) return "24:00";
  const clamped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export const useReservationStore = create<ReservationStore>()(
  persist(
    (set) => ({
      reservations: {},
      settings: {},
      reservationThemes: {},
      publishedReservationThemes: {},
      addReservation: (restaurantId, input) => {
        const reservationId = id("res");
        const reservation: Reservation = {
          id: reservationId,
          restaurantId,
          tableId: input.tableId,
          guestName: input.guestName.trim(),
          partySize: input.partySize,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          status: input.status ?? "confirmed",
          email: input.email?.trim() || undefined,
          phone: input.phone?.trim() || undefined,
          notes: input.notes?.trim() || undefined,
          createdAt: timestamp(),
        };
        set((state) => ({
          reservations: {
            ...state.reservations,
            [restaurantId]: [...(state.reservations[restaurantId] ?? []), reservation],
          },
        }));
        const isGuest = window.location.pathname.startsWith("/reserve/");
        const path = isGuest
          ? `/api/public/restaurants/${restaurantId}/reservations`
          : `/api/restaurants/${restaurantId}/reservations`;
        const body = { ...input, status: isGuest ? undefined : input.status };
        const headers = isGuest ? { "Idempotency-Key": crypto.randomUUID() } : undefined;
        const request = apiRequest(path, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (isGuest) void request.catch(() => undefined);
        else syncReservations(restaurantId, request);
        return reservationId;
      },
      updateReservation: (restaurantId, reservationId, patch) => {
        set((state) => ({
          reservations: {
            ...state.reservations,
            [restaurantId]: (state.reservations[restaurantId] ?? []).map((reservation) =>
              reservation.id === reservationId ? { ...reservation, ...patch } : reservation,
            ),
          },
        }));
        syncReservations(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/reservations/${reservationId}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          }),
        );
      },
      rescheduleReservation: (restaurantId, reservationId, input) => {
        const current = useReservationStore
          .getState()
          .reservations[restaurantId]?.find((reservation) => reservation.id === reservationId);
        const settings = normalizeReservationSettings(
          useReservationStore.getState().settings[restaurantId],
          restaurantId,
        );
        set((state) => ({
          reservations: {
            ...state.reservations,
            [restaurantId]: (state.reservations[restaurantId] ?? []).map((reservation) =>
              reservation.id === reservationId
                ? {
                    ...reservation,
                    ...input,
                    endTime: addMinutesToTime(input.startTime, settings.maxStayMinutes),
                  }
                : reservation,
            ),
          },
        }));
        syncReservations(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/reservations/${reservationId}/reschedule`, {
            method: "POST",
            body: JSON.stringify(input),
          }).catch((error) => {
            if (current)
              set((state) => ({
                reservations: {
                  ...state.reservations,
                  [restaurantId]: (state.reservations[restaurantId] ?? []).map((reservation) =>
                    reservation.id === reservationId ? current : reservation,
                  ),
                },
              }));
            throw error;
          }),
        );
      },
      cancelReservation: (restaurantId, reservationId) => {
        set((state) => ({
          reservations: {
            ...state.reservations,
            [restaurantId]: (state.reservations[restaurantId] ?? []).map((reservation) =>
              reservation.id === reservationId
                ? { ...reservation, status: "cancelled" }
                : reservation,
            ),
          },
        }));
        syncReservations(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/reservations/${reservationId}/cancel`, {
            method: "POST",
          }),
        );
      },
      deleteReservation: (restaurantId, reservationId) => {
        set((state) => ({
          reservations: {
            ...state.reservations,
            [restaurantId]: (state.reservations[restaurantId] ?? []).filter(
              (reservation) => reservation.id !== reservationId,
            ),
          },
        }));
        syncReservations(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/reservations/${reservationId}`, {
            method: "DELETE",
          }),
        );
      },
      updateSettings: (restaurantId, patch) => {
        set((state) => ({
          settings: {
            ...state.settings,
            [restaurantId]: {
              ...(state.settings[restaurantId] ?? defaultReservationSettings(restaurantId)),
              ...patch,
            },
          },
        }));
        syncReservations(
          restaurantId,
          apiRequest(`/api/restaurants/${restaurantId}/reservation-settings`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          }),
        );
      },
      updateReservationTheme: (restaurantId, patch) => {
        set((state) => {
          const current =
            state.reservationThemes[restaurantId] ?? defaultReservationTheme(restaurantId);
          return {
            reservationThemes: {
              ...state.reservationThemes,
              [restaurantId]: { ...current, ...patch, updatedAt: timestamp() },
            },
          };
        });
        void queueReservationThemeWrite(restaurantId, () =>
          apiRequest(`/api/restaurants/${restaurantId}/reservation-theme/draft`, {
            method: "PATCH",
            body: JSON.stringify({ patch }),
          }),
        ).catch(() => refreshReservations(restaurantId));
      },
      publishReservationTheme: async (restaurantId) => {
        try {
          const published = await queueReservationThemeWrite(restaurantId, () =>
            apiRequest<ReservationTheme>(
              `/api/restaurants/${restaurantId}/reservation-theme/publish`,
              { method: "POST" },
            ),
          );
          await refreshReservations(restaurantId);
          set((state) => ({
            publishedReservationThemes: {
              ...state.publishedReservationThemes,
              [restaurantId]: published,
            },
          }));
        } catch (error) {
          await refreshReservations(restaurantId).catch(() => undefined);
          throw error;
        }
      },
    }),
    {
      name: "astron_reservations",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: () => ({}),
    },
  ),
);
