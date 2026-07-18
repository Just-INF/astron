import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Maximize2,
  Pencil,
  Plus,
  Square,
  Users,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { defaultFloorPlanTheme, useLayoutStore } from "@/stores/useLayoutStore";
import {
  addMinutesToTime,
  defaultReservationTheme,
  getEffectiveDayHours,
  minutesToTime,
  normalizeReservationSettings,
  rangesOverlap,
  timeToMinutes,
  useReservationStore,
} from "@/stores/useReservationStore";
import { ReservationThemeEditor } from "@/components/reservation/ReservationThemeEditor";
import { FloorPlanThemeEditor } from "@/components/dashboard/FloorPlanThemeEditor";
import { FloorPlan2DView } from "@/components/canvas/FloorPlan2DView";
import type {
  DayHours,
  DiningTable,
  FloorZone,
  Reservation,
  ReservationSettings,
  ReservationStatus,
  WallGeometry,
} from "@/types";
import { dateKeyParts, restaurantDateKey } from "@/lib/regional";

const TableFloorCanvas = React.lazy(() =>
  import("@/components/canvas/TableFloorCanvas").then((module) => ({
    default: module.TableFloorCanvas,
  })),
);

const EMPTY_TABLES: DiningTable[] = [];
const EMPTY_WALLS: WallGeometry[] = [];
const EMPTY_ZONES: FloorZone[] = [];
const EMPTY_RESERVATIONS: Reservation[] = [];

const AVAILABLE_COLOR = "#9ee1c3";
const UNAVAILABLE_COLOR = "#56524b";
const MAX_STAY_OPTIONS = [30, 60, 90, 120, 150, 180];
const MAX_PARTY_SIZE = 12;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmed: "Confirmed",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
};

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function ReservationsStudio() {
  const restaurantId = useAuthStore((s) => s.currentUser?.activeRestaurantId ?? "");
  const timezone = useAuthStore(
    (s) =>
      s.restaurants.find((restaurant) => restaurant.id === s.currentUser?.activeRestaurantId)
        ?.timezone ?? "UTC",
  );
  const tables = useLayoutStore((s) => s.tables[restaurantId] ?? EMPTY_TABLES);
  const walls = useLayoutStore((s) => s.walls[restaurantId] ?? EMPTY_WALLS);
  const zones = useLayoutStore((s) => s.zones[restaurantId] ?? EMPTY_ZONES);
  const storedFloorPlanTheme = useLayoutStore((s) => s.floorPlanThemes[restaurantId]);
  const updateFloorPlanTheme = useLayoutStore((s) => s.updateFloorPlanTheme);
  const publishFloorPlanTheme = useLayoutStore((s) => s.publishFloorPlanTheme);
  const floorPlanTheme = storedFloorPlanTheme ?? defaultFloorPlanTheme(restaurantId);

  const reservations = useReservationStore(
    (s) => s.reservations[restaurantId] ?? EMPTY_RESERVATIONS,
  );
  const storeSettings = useReservationStore((s) => s.settings[restaurantId]);
  const updateSettings = useReservationStore((s) => s.updateSettings);
  const addReservation = useReservationStore((s) => s.addReservation);
  const rescheduleReservation = useReservationStore((s) => s.rescheduleReservation);
  const cancelReservation = useReservationStore((s) => s.cancelReservation);

  const reservationThemes = useReservationStore((s) => s.reservationThemes);
  const updateReservationTheme = useReservationStore((s) => s.updateReservationTheme);
  const publishReservationTheme = useReservationStore((s) => s.publishReservationTheme);
  const theme = reservationThemes[restaurantId] ?? defaultReservationTheme(restaurantId);

  const [activeTab, setActiveTab] = useState<"studio" | "settings" | "publish">("studio");

  const settings: ReservationSettings = useMemo(
    () => normalizeReservationSettings(storeSettings, restaurantId),
    [storeSettings, restaurantId],
  );
  const { maxStayMinutes, slotMinutes } = settings;

  const todayKey = restaurantDateKey(timezone);
  const todayParts = dateKeyParts(todayKey);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [viewDate, setViewDate] = useState<Date>(
    () => new Date(todayParts.year, todayParts.month - 1, todayParts.day),
  );
  const resolvedInitialReservationDate = useRef(false);

  const reservationDateCounts = useMemo(
    () =>
      reservations.reduce<Record<string, number>>((counts, reservation) => {
        if (reservation.status !== "cancelled")
          counts[reservation.date] = (counts[reservation.date] ?? 0) + 1;
        return counts;
      }, {}),
    [reservations],
  );

  const nearestReservationDate = useMemo(() => {
    const dates = Object.keys(reservationDateCounts).sort();
    return dates.find((date) => date >= todayKey) ?? dates.at(-1) ?? null;
  }, [reservationDateCounts, todayKey]);

  useEffect(() => {
    if (resolvedInitialReservationDate.current || reservations.length === 0) return;
    resolvedInitialReservationDate.current = true;
    if (reservationDateCounts[todayKey] || !nearestReservationDate) return;
    const date = fromDateKey(nearestReservationDate);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDate(nearestReservationDate);
    setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
  }, [nearestReservationDate, reservationDateCounts, reservations.length, todayKey]);

  const dayIndex = fromDateKey(selectedDate).getDay();
  const dayHours = getEffectiveDayHours(settings, dayIndex);
  const openTime = dayHours.open;
  const closeTime = dayHours.close;
  const isClosed = dayHours.closed;

  const [selectedStartTime, setSelectedStartTime] = useState(openTime);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedStartTime(openTime);
  }, [openTime]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("2d");
  const [maximized, setMaximized] = useState(false);

  const windowEnd = useMemo(
    () => addMinutesToTime(selectedStartTime, maxStayMinutes),
    [selectedStartTime, maxStayMinutes],
  );

  const slots = useMemo(() => {
    const start = timeToMinutes(openTime);
    const end = timeToMinutes(closeTime);
    const out: string[] = [];
    for (let t = start; t <= end; t += slotMinutes) out.push(minutesToTime(t));
    return out;
  }, [openTime, closeTime, slotMinutes]);

  const colorByTable = useMemo(() => {
    const winStart = timeToMinutes(selectedStartTime);
    const winEnd = winStart + maxStayMinutes;
    const map: Record<string, string> = {};
    for (const table of tables) {
      const isAvailable =
        table.linked !== false &&
        table.status !== "occupied" &&
        !reservations.some(
          (r) =>
            r.tableId === table.id &&
            r.date === selectedDate &&
            r.status !== "cancelled" &&
            r.id !== reschedulingId &&
            rangesOverlap(winStart, winEnd, timeToMinutes(r.startTime), timeToMinutes(r.endTime)),
        );
      map[table.id] = isAvailable ? AVAILABLE_COLOR : UNAVAILABLE_COLOR;
    }
    return map;
  }, [tables, selectedStartTime, maxStayMinutes, reservations, selectedDate, reschedulingId]);

  const dayReservations = useMemo(
    () =>
      reservations
        .filter((r) => r.date === selectedDate)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
    [reservations, selectedDate],
  );

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;

  const monthCells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewDate]);

  const monthLabel = viewDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  function goPrevMonth() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function goNextMonth() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  function handleSelectTable(id: string) {
    if (!isClosed && colorByTable[id] === AVAILABLE_COLOR) setSelectedTableId(id);
  }

  function isTableFree(tableId: string): boolean {
    const winStart = timeToMinutes(selectedStartTime);
    const winEnd = winStart + maxStayMinutes;
    return !reservations.some(
      (r) =>
        r.tableId === tableId &&
        r.date === selectedDate &&
        r.status !== "cancelled" &&
        r.id !== reschedulingId &&
        rangesOverlap(winStart, winEnd, timeToMinutes(r.startTime), timeToMinutes(r.endTime)),
    );
  }

  function handleMaxStayChange(raw: string) {
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(5, Math.min(1440, parsed));
    updateSettings(restaurantId, { maxStayMinutes: clamped });
  }

  function handleMaxStayPreset(value: number) {
    updateSettings(restaurantId, { maxStayMinutes: value });
  }

  function handleToggle247() {
    updateSettings(restaurantId, { is24_7: !settings.is24_7 });
  }

  function handleDayChange(d: number, patch: Partial<DayHours>) {
    const current = settings.weeklyHours[d] ?? {
      open: "11:00",
      close: "23:00",
      closed: false,
    };
    updateSettings(restaurantId, {
      weeklyHours: { ...settings.weeklyHours, [d]: { ...current, ...patch } },
    });
  }

  function handleCreate() {
    setError(null);
    setConfirmation(null);
    if (isClosed) {
      setError("The restaurant is closed on this day.");
      return;
    }
    if (!selectedTableId) {
      setError("Select an available table from the floor plan first.");
      return;
    }
    if (!guestName.trim()) {
      setError("Add the guest's name.");
      return;
    }
    const table = tables.find((t) => t.id === selectedTableId);
    if (!table) {
      setError("That table is no longer on the floor plan.");
      return;
    }
    if (table.linked === false || table.status === "occupied") {
      setError("That table isn't available for reservations.");
      return;
    }
    if (!isTableFree(selectedTableId)) {
      setError("That table is already booked for this time.");
      return;
    }
    if (reschedulingId) {
      rescheduleReservation(restaurantId, reschedulingId, {
        tableId: selectedTableId,
        date: selectedDate,
        startTime: selectedStartTime,
      });
      setConfirmation(`Reservation moved to ${selectedDate} at ${selectedStartTime}.`);
      setReschedulingId(null);
      setSelectedTableId(null);
      window.setTimeout(() => setConfirmation(null), 4000);
      return;
    }
    addReservation(restaurantId, {
      tableId: selectedTableId,
      guestName: guestName.trim(),
      partySize,
      date: selectedDate,
      startTime: selectedStartTime,
      endTime: windowEnd,
      status: "confirmed",
      notes: notes.trim() || undefined,
    });
    setConfirmation(`Reserved ${table.name} for ${guestName.trim()} at ${selectedStartTime}.`);
    setGuestName("");
    setNotes("");
    setPartySize(2);
    setSelectedTableId(null);
    window.setTimeout(() => setConfirmation(null), 4000);
  }

  function handleCancel(id: string) {
    cancelReservation(restaurantId, id);
  }

  function beginReschedule(reservation: Reservation) {
    setReschedulingId(reservation.id);
    setSelectedDate(reservation.date);
    setSelectedStartTime(reservation.startTime);
    setSelectedTableId(reservation.tableId);
    setGuestName(reservation.guestName);
    setPartySize(reservation.partySize);
    setNotes(reservation.notes ?? "");
    setError(null);
    setConfirmation(`Choose a new table, date, or time for ${reservation.guestName}.`);
  }

  const floorPlanNode = (
    <React.Suspense fallback={<div className="res-canvas-fallback">Loading floor plan…</div>}>
      {viewMode === "3d" ? (
        <TableFloorCanvas
          tables={tables}
          walls={walls}
          zones={zones}
          allowDrag={false}
          selectedTableId={selectedTableId}
          onSelect={handleSelectTable}
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
        />
      ) : (
        <FloorPlan2DView
          tables={tables}
          walls={walls}
          zones={zones}
          selectedTableId={selectedTableId}
          onSelect={handleSelectTable}
          colorByTable={colorByTable}
        />
      )}
    </React.Suspense>
  );

  useEffect(() => {
    if (!maximized) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMaximized(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);

  return (
    <section className="reservations-studio">
      <div className="menu-tabs reservations-subtabs" role="tablist">
        <button
          type="button"
          className={activeTab === "studio" ? "active" : ""}
          onClick={() => setActiveTab("studio")}
          role="tab"
        >
          Studio
        </button>
        <button
          type="button"
          className={activeTab === "settings" ? "active" : ""}
          onClick={() => setActiveTab("settings")}
          role="tab"
        >
          Settings
        </button>
        <button
          type="button"
          className={activeTab === "publish" ? "active" : ""}
          onClick={() => setActiveTab("publish")}
          role="tab"
        >
          Display &amp; publish
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "studio" && (
          <motion.div
            key="studio"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="reservation-board-header">
              <div>
                <p className="eyebrow">Service board</p>
                <h2>
                  {fromDateKey(selectedDate).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </h2>
              </div>
              <div className="reservation-board-stats">
                <span>
                  <b>{dayReservations.filter((item) => item.status !== "cancelled").length}</b>{" "}
                  bookings
                </span>
                <span>
                  <b>
                    {tables.filter((table) => colorByTable[table.id] === AVAILABLE_COLOR).length}
                  </b>{" "}
                  tables open
                </span>
                <span>
                  <b>{isClosed ? "Closed" : `${openTime}–${closeTime}`}</b> service
                </span>
              </div>
            </div>
            <div className="reservations-grid reservation-board">
              <div className="reservation-planning-panel">
                {/* Calendar */}
                <div className="res-calendar reservation-date-panel">
                  <div className="res-calendar-head">
                    <button
                      type="button"
                      className="res-nav-btn"
                      onClick={goPrevMonth}
                      aria-label="Previous month"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="res-calendar-title">{monthLabel}</span>
                    <button
                      type="button"
                      className="res-nav-btn"
                      onClick={goNextMonth}
                      aria-label="Next month"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="res-calendar-weekdays">
                    {WEEKDAYS.map((w) => (
                      <span key={w}>{w}</span>
                    ))}
                  </div>
                  <div className="res-calendar-grid">
                    {monthCells.map((cell, i) => {
                      if (!cell)
                        return <span key={`blank-${i}`} className="res-calendar-cell is-empty" />;
                      const key = toDateKey(cell);
                      const isToday = key === todayKey;
                      const isSelected = key === selectedDate;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={
                            "res-calendar-cell" +
                            (isToday ? " is-today" : "") +
                            (isSelected ? " is-selected" : "")
                          }
                          onClick={() => {
                            resolvedInitialReservationDate.current = true;
                            setSelectedDate(key);
                          }}
                        >
                          {cell.getDate()}
                          {(reservationDateCounts[key] ?? 0) > 0 && (
                            <i
                              className="res-calendar-booking-dot"
                              aria-label={`${reservationDateCounts[key]} reservations`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Hour selector */}
                <div className="res-hour reservation-time-panel">
                  <div className="res-hour-head">
                    <Clock size={14} />
                    <span>Start time</span>
                  </div>
                  {isClosed ? (
                    <div className="res-closed-notice">
                      <Clock size={18} />
                      <p>Closed on this day.</p>
                    </div>
                  ) : (
                    <>
                      <div className="res-hour-list">
                        {slots.map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            className={
                              "res-hour-item" + (slot === selectedStartTime ? " is-selected" : "")
                            }
                            onClick={() => setSelectedStartTime(slot)}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                      <p className="res-hour-foot">
                        Reserved until <strong>{windowEnd}</strong>
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Floor plan */}
              <div className="res-canvas reservation-floor-panel">
                <div className="res-canvas-head">
                  <span className="res-canvas-title">Floor plan</span>
                  <span className="res-canvas-date">{selectedDate}</span>
                </div>
                <div className="res-canvas-frame">{floorPlanNode}</div>
                <div className="reservation-floor-footer">
                  <div className="res-legend">
                    <span className="res-legend-item">
                      <i className="res-legend-dot available" /> Available
                    </span>
                    <span className="res-legend-item">
                      <i className="res-legend-dot reserved" /> Reserved / unavailable
                    </span>
                  </div>
                  <p className="res-canvas-hint">Click a green table to select it.</p>
                  <div className="reservation-floor-actions">
                    <div>
                      <button
                        type="button"
                        className="button button-primary res-canvas-btn"
                        onClick={() => setViewMode((m) => (m === "3d" ? "2d" : "3d"))}
                        aria-label="Toggle 2D / 3D view"
                      >
                        {viewMode === "3d" ? <Box size={13} /> : <Square size={13} />}
                        Switch to {viewMode === "3d" ? "2D" : "3D"}
                      </button>
                      <button
                        type="button"
                        className="button button-primary res-canvas-btn"
                        onClick={() => setMaximized(true)}
                        aria-label="Expand floor plan"
                      >
                        <Maximize2 size={13} /> Expand plan
                      </button>
                    </div>
                    <Link
                      to="/dashboard/layout-editor"
                      className="button button-primary res-canvas-edit"
                      aria-label="Edit floor plan"
                    >
                      <Pencil size={13} /> Edit layout
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="reservations-below reservation-desk">
              {/* New reservation form */}
              <div className="res-form reservation-create-panel">
                <header className="res-panel-head">
                  <Plus size={15} />
                  <span>New reservation</span>
                </header>

                {isClosed ? (
                  <div className="res-form-empty">
                    <Clock size={20} />
                    <p>
                      The restaurant is closed on {selectedDate}. Reservations can&apos;t be created
                      for this day.
                    </p>
                  </div>
                ) : selectedTable ? (
                  <div className="res-form-body">
                    <div className="res-form-table">
                      <span className="res-form-table-name">{selectedTable.name}</span>
                      <span className="res-form-table-meta">
                        <Users size={13} /> {selectedTable.capacity} covers
                      </span>
                    </div>

                    <label className="res-form-field">
                      <span>Guest name</span>
                      <input
                        value={guestName}
                        disabled={Boolean(reschedulingId)}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="e.g. Mara Lindqvist"
                      />
                    </label>

                    <label className="res-form-field">
                      <span>Party size</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_PARTY_SIZE}
                        value={partySize}
                        disabled={Boolean(reschedulingId)}
                        onChange={(e) =>
                          setPartySize(
                            Math.max(1, Math.min(MAX_PARTY_SIZE, Number(e.target.value) || 1)),
                          )
                        }
                      />
                    </label>

                    <div className="res-form-times">
                      <div>
                        <span>Start</span>
                        <strong>{selectedStartTime}</strong>
                      </div>
                      <div>
                        <span>End</span>
                        <strong>{windowEnd}</strong>
                      </div>
                    </div>

                    <label className="res-form-field">
                      <span>Notes</span>
                      <textarea
                        value={notes}
                        disabled={Boolean(reschedulingId)}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Allergies, occasion, seating preference…"
                      />
                    </label>

                    {error && <p className="res-error">{error}</p>}
                    {confirmation && (
                      <p className="res-confirm">
                        <Check size={14} /> {confirmation}
                      </p>
                    )}

                    <button
                      type="button"
                      className="button button-primary res-form-submit"
                      onClick={handleCreate}
                    >
                      {reschedulingId ? <Pencil size={15} /> : <Plus size={15} />}{" "}
                      {reschedulingId ? "Save new time" : "Create reservation"}
                    </button>
                  </div>
                ) : (
                  <div className="res-form-empty">
                    <CalendarDays size={20} />
                    <p>Pick a green table on the floor plan to start a reservation.</p>
                  </div>
                )}
              </div>

              {/* Reservations list */}
              <div className="res-list reservation-list-panel">
                <header className="res-panel-head">
                  <CalendarDays size={15} />
                  <span>Reservations · {selectedDate}</span>
                </header>

                {dayReservations.length === 0 ? (
                  <div className="res-list-empty">
                    <p>No reservations for this day yet.</p>
                    {nearestReservationDate && nearestReservationDate !== selectedDate && (
                      <button
                        type="button"
                        onClick={() => {
                          const date = fromDateKey(nearestReservationDate);
                          resolvedInitialReservationDate.current = true;
                          setSelectedDate(nearestReservationDate);
                          setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
                        }}
                      >
                        <CalendarDays size={13} /> Show nearest booking · {nearestReservationDate}
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="res-list-items">
                    {dayReservations.map((res) => {
                      const table = tables.find((t) => t.id === res.tableId);
                      return (
                        <li
                          key={res.id}
                          className={
                            "res-list-row" + (res.status === "cancelled" ? " is-cancelled" : "")
                          }
                        >
                          <div className="res-list-main">
                            <span className="res-list-table">{table?.name ?? "Table"}</span>
                            <span className="res-list-guest">{res.guestName}</span>
                          </div>
                          <div className="res-list-meta">
                            <span className="res-list-time">
                              {res.startTime}–{res.endTime}
                            </span>
                            <span className="res-list-party">
                              <Users size={12} /> {res.partySize}
                            </span>
                            <span className={`res-status status-${res.status}`}>
                              {STATUS_LABEL[res.status]}
                            </span>
                          </div>
                          {res.status !== "cancelled" && (
                            <div className="res-list-actions">
                              <button
                                type="button"
                                className="res-cancel-btn"
                                onClick={() => beginReschedule(res)}
                                aria-label={`Reschedule reservation for ${res.guestName}`}
                              >
                                <Pencil size={14} /> Reschedule
                              </button>
                              <button
                                type="button"
                                className="res-cancel-btn"
                                onClick={() => handleCancel(res.id)}
                                aria-label={`Cancel reservation for ${res.guestName}`}
                              >
                                <X size={14} /> Cancel
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="reservation-settings-layout">
              <section className="res-settings-row reservation-policy-card">
                <div className="reservation-settings-heading">
                  <span>
                    <Clock size={17} />
                  </span>
                  <div>
                    <p className="eyebrow">Booking policy</p>
                    <h2>Table turn time</h2>
                    <p>Automatically protect this much time for every booking.</p>
                  </div>
                </div>
                <div className="reservation-duration-control">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    step={5}
                    value={maxStayMinutes}
                    onChange={(e) => handleMaxStayChange(e.target.value)}
                    className="res-number-input"
                    aria-label="Maximum stay in minutes"
                  />
                  <span>minutes</span>
                </div>
                <div
                  className="res-segment reservation-presets"
                  role="group"
                  aria-label="Quick max-stay presets"
                >
                  {MAX_STAY_OPTIONS.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      className={maxStayMinutes === mins ? "selected" : ""}
                      aria-pressed={maxStayMinutes === mins}
                      onClick={() => handleMaxStayPreset(mins)}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </section>

              <section className="res-hours reservation-hours-card">
                <div className="res-hours-head">
                  <div className="reservation-settings-heading">
                    <span>
                      <Clock size={17} />
                    </span>
                    <div>
                      <p className="eyebrow">Availability</p>
                      <h2>Bookable hours</h2>
                      <p>Choose when guests can find a table online.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={"res-switch" + (settings.is24_7 ? " on" : "")}
                    role="switch"
                    aria-checked={settings.is24_7}
                    onClick={handleToggle247}
                  >
                    <span className="res-switch-knob" />
                    <span className="res-switch-label">
                      {settings.is24_7 ? "24/7" : "Scheduled"}
                    </span>
                  </button>
                </div>

                {settings.is24_7 ? (
                  <p className="res-hours-note">
                    Always open - guests can book any minute, every day.
                  </p>
                ) : (
                  <div className="reservation-hours-table">
                    <div className="reservation-hours-labels">
                      <span>Day</span>
                      <span>Opens</span>
                      <span>Closes</span>
                      <span>Availability</span>
                    </div>
                    <div className="res-week">
                      {WEEKDAYS.map((label, d) => {
                        const dh = settings.weeklyHours[d] ?? {
                          open: "11:00",
                          close: "23:00",
                          closed: false,
                        };
                        return (
                          <div className="res-week-row" key={d}>
                            <span className="res-week-day">{label}</span>
                            <input
                              type="time"
                              value={dh.open}
                              disabled={dh.closed}
                              onChange={(e) => handleDayChange(d, { open: e.target.value })}
                              className="res-time-input"
                              aria-label={`${label} open time`}
                            />
                            <input
                              type="time"
                              value={dh.close}
                              disabled={dh.closed}
                              onChange={(e) => handleDayChange(d, { close: e.target.value })}
                              className="res-time-input"
                              aria-label={`${label} close time`}
                            />
                            <label className="res-week-closed">
                              <input
                                type="checkbox"
                                checked={dh.closed}
                                onChange={(e) =>
                                  handleDayChange(d, {
                                    closed: e.target.checked,
                                  })
                                }
                              />
                              <span>Closed</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </motion.div>
        )}

        {activeTab === "publish" && (
          <motion.div
            key="publish"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <ReservationThemeEditor
              theme={theme}
              restaurantId={restaurantId}
              onUpdate={(patch) => updateReservationTheme(restaurantId, patch)}
              onPublish={() => publishReservationTheme(restaurantId)}
              floorPlanEditor={
                <FloorPlanThemeEditor
                  theme={floorPlanTheme}
                  onUpdate={(patch) => updateFloorPlanTheme(restaurantId, patch)}
                  onPublish={() => publishFloorPlanTheme(restaurantId)}
                />
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {maximized && (
          <motion.div
            className="res-max-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMaximized(false)}
          >
            <motion.div
              className="res-max-modal"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Floor plan, expanded view"
            >
              <div className="res-max-head">
                <span className="res-canvas-title">Floor plan · {selectedDate}</span>
                <div className="res-canvas-actions">
                  <button
                    type="button"
                    className="res-canvas-btn"
                    onClick={() => setViewMode((m) => (m === "3d" ? "2d" : "3d"))}
                    aria-label="Toggle 2D / 3D view"
                  >
                    {viewMode === "3d" ? <Box size={13} /> : <Square size={13} />}
                    {viewMode === "3d" ? "3D" : "2D"}
                  </button>
                  <button
                    type="button"
                    className="res-canvas-btn res-max-close"
                    onClick={() => setMaximized(false)}
                    aria-label="Close expanded floor plan"
                  >
                    <X size={14} /> Close
                  </button>
                </div>
              </div>
              <div className="res-max-frame">{floorPlanNode}</div>
              <div className="res-legend">
                <span className="res-legend-item">
                  <i className="res-legend-dot available" /> Available
                </span>
                <span className="res-legend-item">
                  <i className="res-legend-dot reserved" /> Reserved / unavailable
                </span>
              </div>
              <p className="res-canvas-hint">
                Click a green table to select it. Scroll to zoom, drag to pan.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
