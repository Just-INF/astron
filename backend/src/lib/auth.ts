import { and, eq, gt } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { db } from "../db/client";
import { restaurantMemberships, sessions, users } from "../db/schema";
import { config } from "./config";
import { ApiError } from "./errors";
import { can, type MembershipRole, type Permission } from "./permissions";
import { sha256 } from "./ids";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  emailVerifiedAt: Date;
};
export type AppVariables = {
  user: AuthUser;
  membership: { restaurantId: string; role: MembershipRole };
};

export async function authenticatedUserForToken(
  token: string | undefined,
): Promise<AuthUser | null> {
  if (!token) return null;
  const tokenHash = await sha256(token);
  const [record] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (record && record.lastSeenAt.getTime() < Date.now() - 5 * 60_000)
    void db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, record.sessionId));
  return record && record.emailVerifiedAt
    ? {
        id: record.id,
        email: record.email,
        name: record.name,
        createdAt: record.createdAt,
        emailVerifiedAt: record.emailVerifiedAt,
      }
    : null;
}

export const requireAuth = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const token = getCookie(c, config.SESSION_COOKIE_NAME);
  const record = await authenticatedUserForToken(token);
  if (!record)
    throw new ApiError(
      401,
      token ? "SESSION_EXPIRED" : "AUTH_REQUIRED",
      token ? "Your session has expired. Please sign in again." : "Please sign in to continue.",
    );
  c.set("user", record);
  await next();
});

export function requireMembership(permission: Permission) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const user = c.get("user");
    const restaurantId = c.req.param("restaurantId")!;
    const [membership] = await db
      .select({
        restaurantId: restaurantMemberships.restaurantId,
        role: restaurantMemberships.role,
      })
      .from(restaurantMemberships)
      .where(
        and(
          eq(restaurantMemberships.restaurantId, restaurantId),
          eq(restaurantMemberships.userId, user.id),
        ),
      )
      .limit(1);
    if (!membership || !can(membership.role, permission))
      throw new ApiError(
        403,
        "RESTAURANT_ACCESS_DENIED",
        "You do not have permission to access this restaurant resource.",
      );
    c.set("membership", membership);
    await next();
  });
}
