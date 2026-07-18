import nodemailer from "nodemailer";
import { and, asc, eq, lt, lte } from "drizzle-orm";
import { config } from "./config";
import { db } from "../db/client";
import { emailJobs } from "../db/schema";
import { createId } from "./ids";
import { renderHtml } from "./email-html";

type ReservationDetails = {
  reservationId: string;
  restaurantName: string;
  guestName: string;
  date: string;
  startTime: string;
  partySize: number;
  startAt?: Date;
};
const branded = (body: string) => `${body}\n\n-\nAstron · Restaurant service, clearly coordinated.`;

function transport() {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS || !config.SMTP_FROM) return null;
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
}

async function deliver(to: string, subject: string, text: string) {
  const client = transport();
  if (!client) {
    if (config.NODE_ENV === "production") throw new Error("SMTP is not configured");
    console.info(`[email disabled] ${subject} → ${to}`);
    return;
  }
  await client.sendMail({
    from: config.SMTP_FROM,
    to,
    subject,
    text,
    html: renderHtml(subject, text),
  });
}

async function send(to: string, subject: string, text: string) {
  await db.insert(emailJobs).values({ id: createId("email"), to, subject, text });
}

export function emailRetryDelay(attempt: number) {
  return Math.min(6 * 3_600_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

let timer: ReturnType<typeof setInterval> | null = null,
  working = false;
async function workEmailQueue() {
  if (working) return;
  working = true;
  try {
    const now = new Date();
    await db
      .update(emailJobs)
      .set({ status: "pending", lockedAt: null })
      .where(
        and(
          eq(emailJobs.status, "processing"),
          lt(emailJobs.lockedAt, new Date(Date.now() - 10 * 60_000)),
        ),
      );
    const [candidate] = await db
      .select()
      .from(emailJobs)
      .where(and(eq(emailJobs.status, "pending"), lte(emailJobs.runAt, now)))
      .orderBy(asc(emailJobs.runAt))
      .limit(1);
    if (!candidate) return;
    const [claimed] = await db
      .update(emailJobs)
      .set({
        status: "processing",
        lockedAt: now,
        attempts: candidate.attempts + 1,
        updatedAt: now,
      })
      .where(and(eq(emailJobs.id, candidate.id), eq(emailJobs.status, "pending")))
      .returning();
    if (!claimed) return;
    try {
      await deliver(claimed.to, claimed.subject, claimed.text);
      await db
        .update(emailJobs)
        .set({
          status: "sent",
          sentAt: new Date(),
          lockedAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(emailJobs.id, claimed.id));
    } catch (error) {
      const exhausted = claimed.attempts >= claimed.maxAttempts;
      await db
        .update(emailJobs)
        .set({
          status: exhausted ? "failed" : "pending",
          runAt: new Date(Date.now() + emailRetryDelay(claimed.attempts)),
          lockedAt: null,
          lastError: (error instanceof Error ? error.message : "Delivery failed").slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(emailJobs.id, claimed.id));
    }
  } finally {
    working = false;
  }
}

export function startEmailWorker() {
  if (!timer) {
    timer = setInterval(() => void workEmailQueue(), 5_000);
    timer.unref();
    void workEmailQueue();
  }
}
export function stopEmailWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export const sendReservationConfirmation = (guestEmail: string, details: ReservationDetails) =>
  Promise.all([
    db.insert(emailJobs).values({
      id: createId("email"),
      to: guestEmail,
      subject: `Reservation confirmed - ${details.restaurantName}`,
      text: branded(
        `Hi ${details.guestName}, your table for ${details.partySize} is confirmed at ${details.restaurantName} on ${details.date} at ${details.startTime}.`,
      ),
      reservationId: details.reservationId,
      kind: "confirmation",
    }),
    ...(details.startAt && details.startAt.getTime() > Date.now() + 3_600_000
      ? [
          db.insert(emailJobs).values({
            id: createId("email"),
            to: guestEmail,
            subject: `Your reservation is coming up - ${details.restaurantName}`,
            text: branded(
              `Hi ${details.guestName}, this is a reminder for your table for ${details.partySize} at ${details.restaurantName} on ${details.date} at ${details.startTime}.`,
            ),
            runAt: new Date(Math.max(Date.now(), details.startAt.getTime() - 24 * 3_600_000)),
            reservationId: details.reservationId,
            kind: "reminder",
          }),
        ]
      : []),
  ]);
export async function sendReservationCancellation(guestEmail: string, details: ReservationDetails) {
  await db.transaction(async (tx) => {
    await tx
      .delete(emailJobs)
      .where(
        and(
          eq(emailJobs.reservationId, details.reservationId),
          eq(emailJobs.kind, "reminder"),
          eq(emailJobs.status, "pending"),
        ),
      );
    await tx.insert(emailJobs).values({
      id: createId("email"),
      to: guestEmail,
      subject: `Reservation cancelled - ${details.restaurantName}`,
      text: branded(
        `Hi ${details.guestName}, your reservation at ${details.restaurantName} on ${details.date} at ${details.startTime} has been cancelled.`,
      ),
      reservationId: details.reservationId,
      kind: "cancellation",
    });
  });
}
export async function sendReservationRescheduled(guestEmail: string, details: ReservationDetails) {
  await db.transaction(async (tx) => {
    await tx
      .delete(emailJobs)
      .where(
        and(
          eq(emailJobs.reservationId, details.reservationId),
          eq(emailJobs.kind, "reminder"),
          eq(emailJobs.status, "pending"),
        ),
      );
    await tx.insert(emailJobs).values({
      id: createId("email"),
      to: guestEmail,
      subject: `Reservation updated - ${details.restaurantName}`,
      text: branded(
        `Hi ${details.guestName}, your reservation for ${details.partySize} at ${details.restaurantName} has moved to ${details.date} at ${details.startTime}.`,
      ),
      reservationId: details.reservationId,
      kind: "rescheduled",
    });
    if (details.startAt && details.startAt.getTime() > Date.now() + 3_600_000)
      await tx.insert(emailJobs).values({
        id: createId("email"),
        to: guestEmail,
        subject: `Your reservation is coming up - ${details.restaurantName}`,
        text: branded(
          `Hi ${details.guestName}, this is a reminder for your table for ${details.partySize} at ${details.restaurantName} on ${details.date} at ${details.startTime}.`,
        ),
        runAt: new Date(Math.max(Date.now(), details.startAt.getTime() - 24 * 3_600_000)),
        reservationId: details.reservationId,
        kind: "reminder",
      });
  });
}
export const sendServiceRequestNotification = (
  email: string,
  details: { restaurantName: string; tableName: string; type: string; status: string },
) =>
  send(
    email,
    `Service request ${details.status} - ${details.restaurantName}`,
    `${details.type} at ${details.tableName} is now ${details.status}.`,
  );
export const sendPasswordReset = (email: string, token: string) =>
  send(
    email,
    "Reset your Astron password",
    `Reset your password: ${config.FRONTEND_ORIGIN}/auth/reset-password?token=${encodeURIComponent(token)}`,
  );
export const sendEmailVerification = (email: string, token: string) =>
  send(
    email,
    "Verify your Astron email",
    `Verify your email address: ${config.FRONTEND_ORIGIN}/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
  );
export const sendTeamInvitation = (email: string, restaurantName: string, inviterName: string) =>
  send(
    email,
    `You are invited to ${restaurantName}`,
    `${inviterName} invited you to join ${restaurantName} on Astron. Create an account with this email address to accept.`,
  );
