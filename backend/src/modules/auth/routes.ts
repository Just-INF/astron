import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { db } from "../../db/client";
import {
  passwordResetTokens,
  emailVerificationTokens,
  restaurantMemberships,
  restaurantInvitations,
  restaurants,
  sessions,
  users,
} from "../../db/schema";
import { authenticatedUserForToken, requireAuth, type AppVariables } from "../../lib/auth";
import { config } from "../../lib/config";
import { ApiError } from "../../lib/errors";
import { createId, randomToken, sha256 } from "../../lib/ids";
import { sendEmailVerification, sendPasswordReset } from "../../lib/email";

const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(200),
});
const registerInput = credentials.extend({
  name: z.string().trim().min(2).max(120),
});
const forgotInput = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((v) => v.toLowerCase()),
});
const resetInput = z.object({
  token: z.string().min(20),
  password: z.string().min(10).max(200),
});
const changePasswordInput = z
  .object({
    currentPassword: z.string().min(10).max(200),
    newPassword: z.string().min(10).max(200),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "Choose a password you have not just used.",
  });

async function issueVerification(userId: string, email: string) {
  const token = randomToken();
  await db.transaction(async (tx) => {
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
    await tx.insert(emailVerificationTokens).values({
      id: createId("verify"),
      userId,
      tokenHash: await sha256(token),
      expiresAt: new Date(Date.now() + 24 * 3_600_000),
    });
  });
  void sendEmailVerification(email, token).catch((error) =>
    console.error("Verification email failed", error),
  );
  if (config.NODE_ENV !== "production")
    console.info(`[dev] Email verification token for ${email}: ${token}`);
}

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "Lax" as const,
    path: "/",
    ...(expires ? { expires } : {}),
  };
}

async function createSession(c: Parameters<typeof setCookie>[0], userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({
    id: createId("ses"),
    userId,
    tokenHash: await sha256(token),
    userAgent: c.req.header("User-Agent")?.slice(0, 500) ?? null,
    ipAddress:
      (config.TRUST_PROXY ? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() : undefined) ??
      null,
    expiresAt,
  });
  setCookie(c, config.SESSION_COOKIE_NAME, token, cookieOptions(expiresAt));
}

async function sessionUser(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found.");
  const memberships = await db
    .select({
      restaurantId: restaurantMemberships.restaurantId,
      role: restaurantMemberships.role,
    })
    .from(restaurantMemberships)
    .where(eq(restaurantMemberships.userId, userId));
  const restaurantIds = memberships.map((item) => item.restaurantId);
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    emailVerified: Boolean(user.emailVerifiedAt),
    activeRestaurantId: restaurantIds[0] ?? null,
    restaurantIds,
    memberships,
  };
}

export const authRoutes = new Hono<{ Variables: AppVariables }>();

authRoutes.post("/register", async (c) => {
  const input = registerInput.parse(await c.req.json());
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing.length)
    throw new ApiError(409, "EMAIL_ALREADY_EXISTS", "An account already exists for this email.", {
      email: ["Try signing in instead."],
    });
  const id = createId("user");
  const passwordHash = await Bun.password.hash(input.password, {
    algorithm: "argon2id",
    memoryCost: 65_536,
    timeCost: 3,
  });
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id, email: input.email, name: input.name, passwordHash });
    const invitations = await tx
      .select()
      .from(restaurantInvitations)
      .where(
        and(
          eq(restaurantInvitations.email, input.email),
          eq(restaurantInvitations.status, "pending"),
          gt(restaurantInvitations.expiresAt, new Date()),
        ),
      );
    if (invitations.length) {
      await tx
        .insert(restaurantMemberships)
        .values(
          invitations.map((invitation) => ({
            restaurantId: invitation.restaurantId,
            userId: id,
            role: invitation.role,
          })),
        )
        .onConflictDoNothing();
      await tx
        .update(restaurantInvitations)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(
          inArray(
            restaurantInvitations.id,
            invitations.map((invitation) => invitation.id),
          ),
        );
    }
  });
  await issueVerification(id, input.email);
  return c.json({ data: await sessionUser(id) }, 201);
});

authRoutes.post("/login", async (c) => {
  const input = credentials.parse(await c.req.json());
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (!user || !(await Bun.password.verify(input.password, user.passwordHash)))
    throw new ApiError(401, "INVALID_CREDENTIALS", "Those details do not match an account.");
  if (!user.emailVerifiedAt) {
    await issueVerification(user.id, user.email);
    throw new ApiError(
      403,
      "EMAIL_VERIFICATION_REQUIRED",
      "Verify your email address before signing in. A new link has been sent.",
    );
  }
  await createSession(c, user.id);
  const data = await sessionUser(user.id);
  return c.json({
    data: { ...data, needsOnboarding: data.restaurantIds.length === 0 },
  });
});

authRoutes.post("/resend-verification", async (c) => {
  const { email } = forgotInput.parse(await c.req.json());
  const [user] = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (user && !user.emailVerifiedAt) await issueVerification(user.id, user.email);
  return c.json({ data: { accepted: true } }, 202);
});

authRoutes.post("/verify-email", async (c) => {
  const { token } = z.object({ token: z.string().min(20) }).parse(await c.req.json());
  const [record] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, await sha256(token)),
        gt(emailVerificationTokens.expiresAt, new Date()),
        isNull(emailVerificationTokens.consumedAt),
      ),
    )
    .limit(1);
  if (!record)
    throw new ApiError(
      400,
      "INVALID_VERIFICATION_TOKEN",
      "This verification link is invalid or expired.",
    );
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, record.userId));
    await tx
      .update(emailVerificationTokens)
      .set({ consumedAt: new Date() })
      .where(eq(emailVerificationTokens.id, record.id));
    await tx.delete(sessions).where(eq(sessions.userId, record.userId));
  });
  await createSession(c, record.userId);
  return c.json({ data: await sessionUser(record.userId) });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const token = getCookie(c, config.SESSION_COOKIE_NAME);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, await sha256(token)));
  deleteCookie(c, config.SESSION_COOKIE_NAME, cookieOptions());
  return c.body(null, 204);
});

authRoutes.post("/forgot-password", async (c) => {
  const { email } = forgotInput.parse(await c.req.json());
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (user) {
    const token = randomToken();
    await db.insert(passwordResetTokens).values({
      id: createId("reset"),
      userId: user.id,
      tokenHash: await sha256(token),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    void sendPasswordReset(email, token).catch((error) =>
      console.error("Password reset email failed", error),
    );
    if (config.NODE_ENV !== "production")
      console.info(`[dev] Password reset token for ${email}: ${token}`);
  }
  return c.json(
    {
      data: {
        accepted: true,
        message: "If that account exists, reset instructions have been sent.",
      },
    },
    202,
  );
});

authRoutes.post("/reset-password", async (c) => {
  const input = resetInput.parse(await c.req.json());
  const [record] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, await sha256(input.token)),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.consumedAt),
      ),
    )
    .limit(1);
  if (!record)
    throw new ApiError(
      400,
      "INVALID_RESET_TOKEN",
      "This password reset link is invalid or expired.",
    );
  const passwordHash = await Bun.password.hash(input.password, {
    algorithm: "argon2id",
    memoryCost: 65_536,
    timeCost: 3,
  });
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, record.userId));
    await tx
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(eq(passwordResetTokens.id, record.id));
    await tx.delete(sessions).where(eq(sessions.userId, record.userId));
  });
  await createSession(c, record.userId);
  return c.json({ data: await sessionUser(record.userId) });
});

authRoutes.post("/change-password", requireAuth, async (c) => {
  const input = changePasswordInput.parse(await c.req.json());
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, c.get("user").id))
    .limit(1);
  if (!user || !(await Bun.password.verify(input.currentPassword, user.passwordHash)))
    throw new ApiError(400, "CURRENT_PASSWORD_INCORRECT", "The current password is incorrect.");
  const passwordHash = await Bun.password.hash(input.newPassword, {
    algorithm: "argon2id",
    memoryCost: 65_536,
    timeCost: 3,
  });
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
  });
  await createSession(c, user.id);
  return c.body(null, 204);
});

export const meRoutes = new Hono<{ Variables: AppVariables }>();
meRoutes.get("/", async (c) => {
  const user = await authenticatedUserForToken(getCookie(c, config.SESSION_COOKIE_NAME));
  return c.json({ data: user ? await sessionUser(user.id) : null });
});
meRoutes.use("/*", requireAuth);
meRoutes.get("/sessions", async (c) => {
  const token = getCookie(c, config.SESSION_COOKIE_NAME),
    tokenHash = token ? await sha256(token) : "";
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, c.get("user").id), gt(sessions.expiresAt, new Date())));
  return c.json({
    data: rows.map((row) => ({
      id: row.id,
      current: row.tokenHash === tokenHash,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    })),
  });
});
meRoutes.delete("/sessions/:sessionId", async (c) => {
  const token = getCookie(c, config.SESSION_COOKIE_NAME),
    tokenHash = token ? await sha256(token) : "";
  const [row] = await db
    .select({ tokenHash: sessions.tokenHash })
    .from(sessions)
    .where(and(eq(sessions.id, c.req.param("sessionId")), eq(sessions.userId, c.get("user").id)))
    .limit(1);
  if (!row) throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found.");
  await db
    .delete(sessions)
    .where(and(eq(sessions.id, c.req.param("sessionId")), eq(sessions.userId, c.get("user").id)));
  if (row.tokenHash === tokenHash) deleteCookie(c, config.SESSION_COOKIE_NAME, cookieOptions());
  return c.body(null, 204);
});
meRoutes.get("/restaurants", async (c) => {
  const rows = await db
    .select({ restaurant: restaurants, role: restaurantMemberships.role })
    .from(restaurantMemberships)
    .innerJoin(restaurants, eq(restaurants.id, restaurantMemberships.restaurantId))
    .where(eq(restaurantMemberships.userId, c.get("user").id));
  return c.json({
    data: rows.map(({ restaurant, role }) => ({
      ...restaurant,
      role,
      teamInvites: [],
      createdAt: restaurant.createdAt.toISOString(),
      updatedAt: restaurant.updatedAt.toISOString(),
    })),
  });
});
meRoutes.patch("/", async (c) => {
  const input = z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      email: z
        .string()
        .trim()
        .email()
        .max(320)
        .transform((v) => v.toLowerCase())
        .optional(),
    })
    .refine((v) => Object.keys(v).length > 0)
    .parse(await c.req.json());
  if (input.email) {
    const duplicate = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (duplicate.some((item) => item.id !== c.get("user").id))
      throw new ApiError(409, "EMAIL_ALREADY_EXISTS", "That email is already in use.");
  }
  const emailChanged = Boolean(input.email && input.email !== c.get("user").email);
  await db
    .update(users)
    .set({ ...input, ...(emailChanged ? { emailVerifiedAt: null } : {}), updatedAt: new Date() })
    .where(eq(users.id, c.get("user").id));
  if (emailChanged) await issueVerification(c.get("user").id, input.email!);
  return c.json({ data: await sessionUser(c.get("user").id) });
});
