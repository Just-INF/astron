import React, { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  CalendarDays,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  LoaderCircle,
  Maximize2,
  Minus,
  PartyPopper,
  Plus,
  Square,
  Users,
  X,
} from "lucide-react";
import {
  addMinutesToTime,
  getEffectiveDayHours,
  minutesToTime,
  rangesOverlap,
  timeToMinutes,
} from "@/stores/useReservationStore";
import { FloorPlan2DView } from "@/components/canvas/FloorPlan2DView";
import type {
  DiningTable,
  FloorZone,
  ReservationSettings,
  ReservationTheme,
  Restaurant,
  WallGeometry,
} from "@/types";
import { tableSelectionError } from "@/lib/reservationValidation";
import { defaultFloorPlanTheme, useLayoutStore } from "@/stores/useLayoutStore";
import { ApiError, apiRequest } from "@/lib/api/client";
import { addDaysToDateKey, dateKeyParts, restaurantDateKey } from "@/lib/regional";

const TableFloorCanvas = React.lazy(() =>
  import("@/components/canvas/TableFloorCanvas").then((module) => ({
    default: module.TableFloorCanvas,
  })),
);

const AVAILABLE_COLOR = "#9ee1c3";
const UNAVAILABLE_COLOR = "#56524b";
const MAX_PARTY_SIZE = 12;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface PublicReservationProps {
  restaurant: Restaurant;
  theme: ReservationTheme;
  settings: ReservationSettings;
  reservations: import("@/types").Reservation[];
  tables: DiningTable[];
  walls: WallGeometry[];
  zones: FloorZone[];
  preselectTableNumber?: string;
}

interface DayOption {
  dateKey: string;
  dayIndex: number;
  weekday: string;
  dayNum: number;
  month: string;
  isClosed: boolean;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function PublicReservation({
  restaurant,
  theme,
  settings,
  reservations,
  tables,
  walls,
  zones,
  preselectTableNumber,
}: PublicReservationProps) {
  const storedFloorPlanTheme = useLayoutStore(
    (state) => state.publishedFloorPlanThemes[restaurant.id],
  );
  const floorPlanTheme = storedFloorPlanTheme ?? defaultFloorPlanTheme(restaurant.id);

  const maxCapacity = MAX_PARTY_SIZE;

  const days = useMemo<DayOption[]>(() => {
    const base = restaurantDateKey(restaurant.timezone);
    const out: DayOption[] = [];
    for (let i = 0; i < 14; i += 1) {
      const dateKey = addDaysToDateKey(base, i);
      const parts = dateKeyParts(dateKey);
      const dayIndex = parts.weekday;
      const dh = getEffectiveDayHours(settings, dayIndex);
      out.push({
        dateKey,
        dayIndex,
        weekday: WEEKDAY_SHORT[dayIndex],
        dayNum: parts.day,
        month: MONTH_SHORT[parts.month - 1],
        isClosed: dh.closed,
      });
    }
    return out;
  }, [restaurant.timezone, settings]);

  const defaultDateKey = useMemo(
    () => days.find((d) => !d.isClosed)?.dateKey ?? days[0].dateKey,
    [days],
  );

  const [selectedDate, setSelectedDate] = useState(defaultDateKey);
  const [selectedStartTime, setSelectedStartTime] = useState("");
  const [partySize, setPartySize] = useState(() => Math.min(2, maxCapacity));
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [bookingStage, setBookingStage] = useState<"plan" | "details">("plan");
  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [created, setCreated] = useState<{
    tableId: string;
    guestName: string;
    partySize: number;
    date: string;
    startTime: string;
    endTime: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [maximized, setMaximized] = useState(false);
  const floorPlanProminence =
    theme.floorPlanProminence ?? (theme.showFloorPlan ? "prominent" : "hidden");
  const [floorPlanExpanded, setFloorPlanExpanded] = useState(floorPlanProminence !== "collapsed");

  useEffect(() => {
    if (!maximized) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMaximized(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);

  const dayHours = useMemo(() => {
    const di = new Date(selectedDate + "T00:00:00").getDay();
    return getEffectiveDayHours(settings, di);
  }, [settings, selectedDate]);
  const isClosed = dayHours.closed;

  const slots = useMemo(() => {
    if (isClosed) return [];
    const start = timeToMinutes(dayHours.open);
    const end = timeToMinutes(dayHours.close);
    const out: string[] = [];
    for (let t = start; t <= end; t += settings.slotMinutes) {
      const slotStart = minutesToTime(t);
      const windowEnd = addMinutesToTime(slotStart, settings.maxStayMinutes);
      if (timeToMinutes(windowEnd) <= end) out.push(slotStart);
    }
    return out;
  }, [isClosed, dayHours.open, dayHours.close, settings.slotMinutes, settings.maxStayMinutes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (slots.length) setSelectedStartTime(slots[0]);
  }, [slots]);

  const windowEndFor = (start: string) => addMinutesToTime(start, settings.maxStayMinutes);

  // Themed month calendar (mirrors the dashboard studio calendar)
  const todayKey = restaurantDateKey(restaurant.timezone);
  const todayParts = dateKeyParts(todayKey);
  const today = new Date(todayParts.year, todayParts.month - 1, todayParts.day);
  const [viewDate, setViewDate] = useState<Date>(
    () => new Date(defaultDateKey ? defaultDateKey + "T00:00:00" : new Date()),
  );
  const monthLabel = viewDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const monthCells = useMemo<(Date | null)[]>(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const leading = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewDate]);
  const canGoPrev =
    viewDate.getFullYear() > today.getFullYear() ||
    (viewDate.getFullYear() === today.getFullYear() && viewDate.getMonth() > today.getMonth());
  const goPrevMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNextMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const availability = useQuery({
    queryKey: ["availability", restaurant.id, selectedDate, selectedStartTime, partySize],
    enabled: Boolean(selectedStartTime),
    queryFn: () =>
      apiRequest<{ availableTables: Array<{ id: string }> }>(
        `/api/public/restaurants/${restaurant.id}/availability?date=${selectedDate}&time=${selectedStartTime}&partySize=${partySize}`,
      ),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
  const serverAvailableIds = useMemo(
    () => new Set(availability.data?.availableTables.map((table) => table.id) ?? []),
    [availability.data],
  );

  const bookableTables = useMemo(() => {
    // Preserve the last confirmed result during a background refresh so an
    // in-progress booking does not lose its selected table.
    if (!selectedStartTime || !availability.data) return [];
    const ws = timeToMinutes(selectedStartTime);
    const we = ws + settings.maxStayMinutes;
    return tables.filter(
      (t) =>
        t.linked !== false &&
        serverAvailableIds.has(t.id) &&
        t.status !== "occupied" &&
        t.capacity >= partySize &&
        !reservations.some(
          (r) =>
            r.tableId === t.id &&
            r.date === selectedDate &&
            r.status !== "cancelled" &&
            rangesOverlap(ws, we, timeToMinutes(r.startTime), timeToMinutes(r.endTime)),
        ),
    );
  }, [
    tables,
    selectedStartTime,
    partySize,
    reservations,
    selectedDate,
    settings.maxStayMinutes,
    availability.data,
    serverAvailableIds,
  ]);

  const colorByTable = useMemo(() => {
    const map: Record<string, string> = {};
    const ws = timeToMinutes(selectedStartTime);
    const we = ws + settings.maxStayMinutes;
    for (const t of tables) {
      const bookable =
        t.linked !== false &&
        serverAvailableIds.has(t.id) &&
        t.status !== "occupied" &&
        t.capacity >= partySize &&
        !reservations.some(
          (r) =>
            r.tableId === t.id &&
            r.date === selectedDate &&
            r.status !== "cancelled" &&
            rangesOverlap(ws, we, timeToMinutes(r.startTime), timeToMinutes(r.endTime)),
        );
      map[t.id] = bookable ? AVAILABLE_COLOR : UNAVAILABLE_COLOR;
    }
    return map;
  }, [
    tables,
    selectedStartTime,
    partySize,
    reservations,
    selectedDate,
    settings.maxStayMinutes,
    serverAvailableIds,
  ]);

  // The 3D canvas is also used as a picker, so keep its selection rules in
  // lockstep with the table cards. This prevents a reserved, offline, or
  // too-small table from being chosen directly on the floor plan.
  function handleSelectBookableTable(tableId: string) {
    if (!bookableTables.some((table) => table.id === tableId)) return;
    setSelectedTableId(tableId);
    setError(null);
  }

  function continueToDetails() {
    const selectionError = tableSelectionError(
      selectedTableId,
      bookableTables.map((table) => table.id),
    );
    if (selectionError) {
      setError(selectionError);
      return;
    }
    setError(null);
    setBookingStage("details");
  }

  useEffect(() => {
    // Query-key changes and background refreshes are temporary. Only a
    // completed availability response may invalidate the current selection.
    if (created || !availability.data || availability.isFetching) return;
    if (selectedTableId && !bookableTables.some((table) => table.id === selectedTableId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedTableId(null);
      setError("That table is no longer available. Please select another table.");
      setBookingStage("plan");
    }
  }, [availability.data, availability.isFetching, bookableTables, created, selectedTableId]);

  useEffect(() => {
    if (!preselectTableNumber || selectedTableId) return;
    const match = bookableTables.find(
      (t) =>
        t.id === preselectTableNumber ||
        (t.code ?? "") === preselectTableNumber ||
        t.name === preselectTableNumber,
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) setSelectedTableId(match.id);
  }, [bookableTables, preselectTableNumber, selectedTableId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (isClosed) {
      setError("The restaurant is closed on this day.");
      return;
    }
    const selectionError = tableSelectionError(
      selectedTableId,
      bookableTables.map((table) => table.id),
    );
    if (selectionError) {
      setError(selectionError);
      setBookingStage("plan");
      return;
    }
    // tableSelectionError above confirms this is present and still bookable.
    const tableId = selectedTableId;
    if (!tableId) return;
    if (!guestName.trim()) {
      setError("Please add your name so we can hold the table.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Please add a valid email for your confirmation.");
      return;
    }
    if (!phone.trim()) {
      setError("Please add a phone number for your reservation.");
      return;
    }
    if (!selectedStartTime) {
      setError("Choose a time for your booking.");
      return;
    }
    const endTime = windowEndFor(selectedStartTime);
    setIsSubmitting(true);
    try {
      await apiRequest(`/api/public/restaurants/${restaurant.id}/reservations`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          tableId,
          guestName: guestName.trim(),
          partySize,
          date: selectedDate,
          startTime: selectedStartTime,
          email: email.trim(),
          phone: phone.trim(),
          notes: notes.trim() || undefined,
        }),
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The table could not be reserved. Please retry.",
      );
      if (
        submissionError instanceof ApiError &&
        ["RESERVATION_CONFLICT", "TABLE_UNAVAILABLE", "TABLE_CAPACITY_EXCEEDED"].includes(
          submissionError.code,
        )
      ) {
        setSelectedTableId(null);
        setBookingStage("plan");
        void availability.refetch();
      }
      return;
    } finally {
      setIsSubmitting(false);
    }
    setCreated({
      tableId,
      guestName: guestName.trim(),
      partySize,
      date: selectedDate,
      startTime: selectedStartTime,
      endTime,
    });
    setGuestName("");
    setEmail("");
    setPhone("");
    setNotes("");
    void availability.refetch();
  }

  const styleVars = {
    "--res-bg": theme.backgroundColor,
    "--res-text": theme.textColor,
    "--res-accent": theme.accentColor,
    "--res-hero-accent": theme.heroAccentColor ?? theme.accentColor,
    "--res-hero-overlay": `${(theme.heroOverlay ?? 42) / 100}`,
    "--res-hero-image": theme.heroImage ? `url("${theme.heroImage}")` : "none",
  } as CSSProperties;

  const entrance = theme.entranceAnimationPreset;
  const initial =
    entrance === "none"
      ? {}
      : entrance === "slide"
        ? { opacity: 0, y: 14 }
        : entrance === "scale"
          ? { opacity: 0, scale: 0.97 }
          : { opacity: 0 };
  const duration =
    theme.animationSpeed === "fast" ? 0.15 : theme.animationSpeed === "slow" ? 0.5 : 0.3;

  const createdTable = created ? tables.find((t) => t.id === created.tableId) : null;

  const floorPlanNode = (
    <React.Suspense
      fallback={
        <div className="res-floorplan-fallback">
          <LoaderCircle className="spin" size={20} /> Loading floor plan
        </div>
      }
    >
      {viewMode === "3d" ? (
        <TableFloorCanvas
          tables={tables}
          walls={walls}
          zones={zones}
          allowDrag={false}
          selectedTableId={selectedTableId}
          onSelect={handleSelectBookableTable}
          onMove={() => {}}
          colorByTable={colorByTable}
          initialZoomPadding={
            maximized
              ? Math.max(2.25, floorPlanTheme.initialZoomPadding + 0.35)
              : floorPlanTheme.initialZoomPadding
          }
          labelMode={floorPlanTheme.labelMode}
          statusColors={{
            available: floorPlanTheme.availableColor,
            reserved: floorPlanTheme.reservedColor,
            occupied: floorPlanTheme.occupiedColor,
          }}
          gridDensity={floorPlanTheme.snapToGrid ? 2 : 1}
        />
      ) : (
        <FloorPlan2DView
          tables={tables}
          walls={walls}
          zones={zones}
          selectedTableId={selectedTableId}
          onSelect={handleSelectBookableTable}
          colorByTable={colorByTable}
        />
      )}
    </React.Suspense>
  );

  return (
    <main
      className={`public-reservation-page width-${theme.widthPreset} reservation-layout-${theme.layoutVariant ?? "guided"} hero-${theme.heroHeight ?? "medium"} font-${theme.fontPairingId ?? "modern-sans-clean"}`}
      style={styleVars}
      data-palette={theme.paletteId}
    >
      {theme.customCss && <style>{theme.customCss}</style>}
      <div className="public-reservation-shell">
        <motion.div
          className="public-reservation-content"
          initial={initial}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
        >
          <header className="public-reservation-hero">
            {theme.logoPlacement !== "hidden" && theme.showRestaurantLogo && restaurant.logoUrl && (
              <div
                className={`public-reservation-brand brand-${theme.logoPlacement ?? "top-left"}`}
              >
                {theme.showRestaurantLogo && restaurant.logoUrl && (
                  <img className="public-reservation-logo" src={restaurant.logoUrl} alt="" />
                )}
                <span>{restaurant.name}</span>
              </div>
            )}
            <p className="public-reservation-eyebrow">Online reservations</p>
            <h1>{theme.pageTitle}</h1>
            {theme.pageSubtitle && (
              <p className="public-reservation-subtitle">{theme.pageSubtitle}</p>
            )}
            <div className="public-reservation-meta">
              <span>{restaurant.cuisineType || "Dining"}</span>
              <i />
              <span>Instant confirmation</span>
            </div>
            <div className="public-reservation-hero-note">
              <span>Choose your time</span>
              <i />
              <span>Pick your table</span>
              <i />
              <span>We&apos;ll hold it for you</span>
            </div>
            {theme.helperText && <p className="public-reservation-helper">{theme.helperText}</p>}
          </header>

          {!created && !isClosed && theme.stepIndicator !== "hidden" && (
            <div
              className={`public-reservation-progress progress-${theme.stepIndicator ?? "numbered"}`}
              aria-label="Reservation steps"
            >
              <span className="active">
                <b>1</b> Plan your visit
              </span>
              <i />
              <span>
                <b>2</b> Select a table
              </span>
              <i />
              <span>
                <b>3</b> Confirm
              </span>
            </div>
          )}

          {!created && !isClosed && (
            <aside className="res-visit-summary" aria-label="Current reservation selection">
              <span>
                <CalendarDays size={15} />{" "}
                {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span>
                <Clock size={15} /> {selectedStartTime || "Choose a time"}
              </span>
              <span>
                <Users size={15} /> {partySize} {partySize === 1 ? "guest" : "guests"}
              </span>
              <b>{bookableTables.length} tables available</b>
            </aside>
          )}

          {!created && bookingStage === "plan" && (
            <section className="res-block">
              <div className="res-block-label">
                <CalendarDays size={14} /> Date
              </div>
              <div className="res-fp-calendar">
                <div className="res-fp-cal-head">
                  <button
                    type="button"
                    className="res-fp-cal-nav"
                    onClick={goPrevMonth}
                    disabled={!canGoPrev}
                    aria-label="Previous month"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="res-fp-cal-title">{monthLabel}</span>
                  <button
                    type="button"
                    className="res-fp-cal-nav"
                    onClick={goNextMonth}
                    aria-label="Next month"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="res-fp-cal-weekdays">
                  {WEEKDAY_SHORT.map((w) => (
                    <span key={w}>{w}</span>
                  ))}
                </div>
                <div className="res-fp-cal-grid">
                  {monthCells.map((cell, i) => {
                    if (!cell)
                      return <span key={`blank-${i}`} className="res-fp-cal-cell is-empty" />;
                    const key = toDateKey(cell);
                    const isToday = key === todayKey;
                    const isSelected = key === selectedDate;
                    const isPast = key < todayKey;
                    const isClosedDay = getEffectiveDayHours(settings, cell.getDay()).closed;
                    const disabled = isPast || isClosedDay;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={disabled}
                        className={
                          "res-fp-cal-cell" +
                          (isToday ? " is-today" : "") +
                          (isSelected ? " is-selected" : "") +
                          (disabled ? " is-disabled" : "")
                        }
                        onClick={() => setSelectedDate(key)}
                      >
                        {cell.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {isClosed ? (
            <div className="public-reservation-closed">
              <CalendarX2 size={22} />
              <p>Closed on this day - pick another date above.</p>
            </div>
          ) : created ? (
            <div className="res-confirmation" role="status">
              <span className="res-confirmation-mark">
                <PartyPopper size={22} />
              </span>
              {theme.confirmationImage && (
                <img className="res-confirmation-image" src={theme.confirmationImage} alt="" />
              )}
              <h2>{theme.confirmationHeading || "Your table is held."}</h2>
              <p>
                {theme.confirmationMessage ||
                  `We’ve held your table, ${created.guestName}. See you soon.`}
              </p>
              <div className="res-confirmation-details">
                <div>
                  <span>Table</span>
                  <b>{createdTable?.name ?? "Your table"}</b>
                </div>
                <div>
                  <span>Party</span>
                  <b>{created.partySize}</b>
                </div>
                <div>
                  <span>When</span>
                  <b>
                    {created.date} · {created.startTime}–{created.endTime}
                  </b>
                </div>
              </div>
              {theme.confirmationActions !== false && (
                <div className="res-confirmation-actions">
                  <a
                    className="button"
                    href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${restaurant.name} reservation`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Add to calendar
                  </a>
                  <a
                    className="button"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.name)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get directions
                  </a>
                </div>
              )}
              <button
                type="button"
                className="button res-submit"
                onClick={() => {
                  setCreated(null);
                  setSelectedTableId(null);
                  setBookingStage("plan");
                  setError(null);
                  setIdempotencyKey(crypto.randomUUID());
                  void availability.refetch();
                }}
              >
                Make another reservation
              </button>
            </div>
          ) : (
            <>
              {bookingStage === "plan" && (
                <>
                  <section className="res-block">
                    <div className="res-block-label">
                      <Clock size={14} /> Time
                    </div>
                    <div className="res-fp-hour-list">
                      {slots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          className={
                            "res-fp-hour-item" + (slot === selectedStartTime ? " is-selected" : "")
                          }
                          onClick={() => setSelectedStartTime(slot)}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                    <p className="res-fp-hour-foot">
                      Reserved until <strong>{windowEndFor(selectedStartTime)}</strong>
                    </p>
                  </section>
                </>
              )}

              {bookingStage === "plan" && floorPlanProminence !== "hidden" && (
                <section className="res-block">
                  <div className="res-block-label">
                    <CalendarDays size={14} /> Floor plan
                    <span className="res-fp-actions">
                      {floorPlanProminence === "collapsed" && (
                        <button
                          type="button"
                          className="res-fp-btn"
                          onClick={() => setFloorPlanExpanded((value) => !value)}
                        >
                          {floorPlanExpanded ? "Collapse" : "View floor plan"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="res-fp-btn"
                        onClick={() => setViewMode((m) => (m === "3d" ? "2d" : "3d"))}
                        aria-label="Toggle 2D / 3D view"
                      >
                        {viewMode === "3d" ? <Box size={13} /> : <Square size={13} />}
                        {viewMode === "3d" ? "3D" : "2D"}
                      </button>
                      <button
                        type="button"
                        className="res-fp-btn"
                        onClick={() => setMaximized(true)}
                        aria-label="Expand floor plan"
                      >
                        <Maximize2 size={13} /> Expand
                      </button>
                    </span>
                  </div>
                  {floorPlanExpanded && <div className="res-floorplan">{floorPlanNode}</div>}
                </section>
              )}

              {bookingStage === "plan" && (
                <section className="res-block">
                  <div className="res-block-label">
                    <Users size={14} /> Choose a table
                  </div>
                  {availability.isError && !availability.data ? (
                    <p className="res-empty-availability">
                      Availability could not be refreshed.{" "}
                      <button type="button" onClick={() => availability.refetch()}>
                        Retry
                      </button>
                    </p>
                  ) : (
                    bookableTables.length === 0 && (
                      <p className="res-empty-availability">
                        No tables are available for this time. Try a different date, time, or party
                        size.
                      </p>
                    )
                  )}
                  {((theme.tableSelectionMode ?? "both") !== "floorplan" ||
                    floorPlanProminence === "hidden") && (
                    <div className="res-tables">
                      {tables.map((table) => {
                        const bookable = bookableTables.some((t) => t.id === table.id);
                        return (
                          <button
                            key={table.id}
                            type="button"
                            disabled={!bookable}
                            className={
                              "res-table-card" +
                              (table.id === selectedTableId ? " is-selected" : "") +
                              (bookable ? "" : " is-unavailable")
                            }
                            onClick={() => handleSelectBookableTable(table.id)}
                          >
                            <b>{table.name}</b>
                            <small>Seats {table.capacity}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {error && <p className="res-error">{error}</p>}
                  {bookingStage === "plan" && (
                    <button
                      type="button"
                      className="button button-primary res-stage-continue"
                      onClick={continueToDetails}
                    >
                      Continue with this table <Check size={15} />
                    </button>
                  )}
                </section>
              )}

              {bookingStage === "details" && (
                <form className="res-form" onSubmit={handleSubmit}>
                  <button
                    type="button"
                    className="res-back-to-tables"
                    onClick={() => setBookingStage("plan")}
                  >
                    ← Choose a different table
                  </button>
                  <div className="res-details-party">
                    <span className="res-block-label">
                      <Users size={14} /> Party size
                    </span>
                    <div className="res-stepper">
                      <button
                        type="button"
                        onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                        aria-label="Decrease party size"
                      >
                        <Minus size={15} />
                      </button>
                      <b>{partySize}</b>
                      <button
                        type="button"
                        onClick={() => setPartySize((n) => Math.min(maxCapacity, n + 1))}
                        aria-label="Increase party size"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                  <label className="res-form-field">
                    <span>Guest name</span>
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </label>
                  <div className="res-contact-grid">
                    <label className="res-form-field">
                      <span>Email address</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                      />
                    </label>
                    <label className="res-form-field">
                      <span>Phone number</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 555 123 4567"
                        autoComplete="tel"
                        required
                      />
                    </label>
                  </div>
                  <label className="res-form-field">
                    <span>Notes (optional)</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Allergies, occasion, seating preference…"
                    />
                  </label>

                  {selectedTableId && (
                    <p className="res-summary-line">
                      <Check size={13} /> Holding{" "}
                      <b>{tables.find((t) => t.id === selectedTableId)?.name}</b> at{" "}
                      {selectedStartTime}–{windowEndFor(selectedStartTime)} for {partySize}.
                    </p>
                  )}

                  {error && <p className="res-error">{error}</p>}

                  <button
                    type="submit"
                    disabled={isSubmitting || !availability.data}
                    className="button button-primary res-submit"
                  >
                    <Check size={15} />{" "}
                    {isSubmitting
                      ? "Reserving…"
                      : !availability.data
                        ? "Checking availability…"
                        : "Reserve table"}
                  </button>
                </form>
              )}
            </>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {maximized && (
          <motion.div
            className="res-fp-max-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMaximized(false)}
          >
            <motion.div
              className="res-fp-max-modal"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Floor plan, expanded view"
            >
              <div className="res-fp-max-head">
                <span className="res-block-label">
                  <CalendarDays size={14} /> Floor plan
                </span>
                <span className="res-fp-actions">
                  <button
                    type="button"
                    className="res-fp-btn"
                    onClick={() => setViewMode((m) => (m === "3d" ? "2d" : "3d"))}
                    aria-label="Toggle 2D / 3D view"
                  >
                    {viewMode === "3d" ? <Box size={13} /> : <Square size={13} />}
                    {viewMode === "3d" ? "3D" : "2D"}
                  </button>
                  <button
                    type="button"
                    className="res-fp-btn res-fp-max-close"
                    onClick={() => setMaximized(false)}
                    aria-label="Close expanded floor plan"
                  >
                    <X size={14} /> Close
                  </button>
                </span>
              </div>
              <div className="res-fp-max-frame">{floorPlanNode}</div>
              <div className="res-legend">
                <span className="res-legend-item">
                  <i className="res-legend-dot available" /> Available
                </span>
                <span className="res-legend-item">
                  <i className="res-legend-dot reserved" /> Reserved / unavailable
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
