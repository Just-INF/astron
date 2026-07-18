import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarX2, LoaderCircle } from "lucide-react";
import { PublicReservation } from "@/components/reservation/PublicReservation";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import type { DiningTable, FloorZone, Reservation, WallGeometry } from "@/types";

const EMPTY_RESERVATIONS: Reservation[] = [];
const EMPTY_TABLES: DiningTable[] = [];
const EMPTY_WALLS: WallGeometry[] = [];
const EMPTY_ZONES: FloorZone[] = [];

export default function ReserveRestaurantPage() {
  const { restaurantId = "", tableNumber } = useParams();
  const [searchParams] = useSearchParams();
  const isDraftPreview = searchParams.get("preview") === "draft";
  const query = useQuery({
    queryKey: ["booking-config", restaurantId, tableNumber],
    queryFn: () => api.bookingConfig(restaurantId, tableNumber),
    enabled: !isDraftPreview,
    retry: 1,
  });
  const draftRestaurant = useAuthStore((s) => s.restaurants.find((r) => r.id === restaurantId));
  const draftTheme = useReservationStore((s) => s.reservationThemes[restaurantId]);
  const draftSettings = useReservationStore((s) => s.settings[restaurantId]);
  const draftReservations = useReservationStore(
    (s) => s.reservations[restaurantId] ?? EMPTY_RESERVATIONS,
  );
  const draftTables = useLayoutStore((s) => s.tables[restaurantId] ?? EMPTY_TABLES),
    draftWalls = useLayoutStore((s) => s.walls[restaurantId] ?? EMPTY_WALLS),
    draftZones = useLayoutStore((s) => s.zones[restaurantId] ?? EMPTY_ZONES);
  const data =
    isDraftPreview && draftRestaurant && draftTheme && draftSettings
      ? {
          restaurant: draftRestaurant,
          theme: draftTheme,
          settings: draftSettings,
          layout: { tables: draftTables, walls: draftWalls, zones: draftZones },
          reservations: draftReservations,
        }
      : query.data
        ? { ...query.data, reservations: [] }
        : null;
  if ((!isDraftPreview && query.isPending) || (isDraftPreview && !data))
    return (
      <main className="public-reservation-loading">
        <LoaderCircle className="spin" size={20} /> Preparing reservations
      </main>
    );
  if (!data || (!isDraftPreview && query.isError))
    return (
      <main className="public-reservation-unavailable">
        <span>
          <CalendarX2 size={23} />
        </span>
        <p>Astron reservations</p>
        <h1>This reservation page isn&apos;t live.</h1>
        <small>
          {query.error instanceof Error
            ? query.error.message
            : "The restaurant is still preparing its guest booking experience."}
        </small>
        <button className="button button-primary" onClick={() => query.refetch()}>
          Retry
        </button>
      </main>
    );
  return (
    <PublicReservation
      restaurant={data.restaurant}
      theme={data.theme}
      settings={data.settings}
      reservations={data.reservations}
      tables={data.layout.tables}
      walls={data.layout.walls}
      zones={data.layout.zones}
      preselectTableNumber={
        !isDraftPreview && query.data?.preselectedTableId
          ? query.data.preselectedTableId
          : tableNumber
      }
    />
  );
}
