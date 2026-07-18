import { DateTime } from "luxon";
import { ApiError } from "../../lib/errors";

export type DayHours = { open: string; close: string; closed: boolean };
export type ReservationSettingsValue = {
  maxStayMinutes: number;
  slotMinutes: number;
  is24_7: boolean;
  weeklyHours: Record<string | number, DayHours>;
};

export function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new ApiError(422, "INVALID_TIME", "Time must use HH:mm format.");
  const hour = Number(match[1]),
    minute = Number(match[2]);
  if (hour === 24 && minute === 0) return 1_440;
  if (hour > 23 || minute > 59)
    throw new ApiError(422, "INVALID_TIME", "Time must use HH:mm format.");
  return hour * 60 + minute;
}

export function localInterval(
  date: string,
  time: string,
  durationMinutes: number,
  timezone: string,
) {
  const requested = `${date}T${time}`;
  const start = DateTime.fromISO(requested, { zone: timezone });
  if (!start.isValid || start.toFormat("yyyy-MM-dd'T'HH:mm") !== requested)
    throw new ApiError(
      422,
      "INVALID_LOCAL_TIME",
      "That local time does not exist in the restaurant timezone, likely because of daylight-saving time.",
    );
  const end = start.plus({ minutes: durationMinutes });
  return {
    startAt: start.toUTC().toJSDate(),
    endAt: end.toUTC().toJSDate(),
    localEndTime: end.toFormat("HH:mm"),
  };
}

export function assertWithinHours(
  date: string,
  time: string,
  durationMinutes: number,
  timezone: string,
  settings: ReservationSettingsValue,
) {
  const interval = localInterval(date, time, durationMinutes, timezone);
  if (settings.is24_7) return interval;
  const local = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  const dayIndex = local.weekday % 7;
  const hours = settings.weeklyHours[dayIndex];
  if (!hours || hours.closed)
    throw new ApiError(422, "RESTAURANT_CLOSED", "The restaurant is closed on that day.");
  const startMinutes = timeToMinutes(time),
    stayEnd = startMinutes + durationMinutes,
    open = timeToMinutes(hours.open),
    closeRaw = timeToMinutes(hours.close),
    close = closeRaw <= open ? closeRaw + 1_440 : closeRaw;
  if (startMinutes < open || stayEnd > close)
    throw new ApiError(
      422,
      "OUTSIDE_BOOKING_HOURS",
      "The requested reservation falls outside bookable hours.",
    );
  if ((startMinutes - open) % settings.slotMinutes !== 0)
    throw new ApiError(
      422,
      "INVALID_SLOT",
      `Reservations start every ${settings.slotMinutes} minutes.`,
    );
  return interval;
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
