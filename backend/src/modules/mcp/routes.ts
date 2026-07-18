import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import { mcpApiKeys, restaurantMemberships } from "../../db/schema";
import { requireAuth, requireMembership, type AppVariables } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import { createId, randomToken, sha256 } from "../../lib/ids";
import { can } from "../../lib/permissions";
import { mcpToolDefinitions, runNoraTool } from "../../lib/noraTools";
import { requireRestaurantFeature } from "../../lib/entitlements";

export const mcpManagementRoutes = new Hono<{ Variables: AppVariables }>();
mcpManagementRoutes.use("/*", requireAuth);
mcpManagementRoutes.use("/*", requireMembership("assistant:use"));
mcpManagementRoutes.use("/*", async (c, next) => {
  await requireRestaurantFeature(c.req.param("restaurantId")!, "nora");
  await next();
});
mcpManagementRoutes.get("/keys", async (c) => {
  const rows = await db
    .select({
      id: mcpApiKeys.id,
      name: mcpApiKeys.name,
      tokenPrefix: mcpApiKeys.tokenPrefix,
      lastUsedAt: mcpApiKeys.lastUsedAt,
      createdAt: mcpApiKeys.createdAt,
    })
    .from(mcpApiKeys)
    .where(
      and(eq(mcpApiKeys.restaurantId, c.req.param("restaurantId")!), isNull(mcpApiKeys.revokedAt)),
    )
    .orderBy(desc(mcpApiKeys.createdAt));
  return c.json({
    data: rows.map((row) => ({
      ...row,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});
mcpManagementRoutes.post("/keys", async (c) => {
  const { name } = z.object({ name: z.string().trim().min(2).max(80) }).parse(await c.req.json());
  const token = `astron_mcp_${randomToken(32)}`,
    id = createId("mcpkey");
  await db.insert(mcpApiKeys).values({
    id,
    restaurantId: c.req.param("restaurantId")!,
    userId: c.get("user").id,
    name,
    tokenHash: await sha256(token),
    tokenPrefix: `${token.slice(0, 18)}…`,
  });
  return c.json(
    {
      data: {
        id,
        name,
        token,
        tokenPrefix: `${token.slice(0, 18)}…`,
        createdAt: new Date().toISOString(),
      },
    },
    201,
  );
});
mcpManagementRoutes.delete("/keys/:keyId", async (c) => {
  const [row] = await db
    .update(mcpApiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpApiKeys.id, c.req.param("keyId")),
        eq(mcpApiKeys.restaurantId, c.req.param("restaurantId")!),
        isNull(mcpApiKeys.revokedAt),
      ),
    )
    .returning({ id: mcpApiKeys.id });
  if (!row) throw new ApiError(404, "MCP_KEY_NOT_FOUND", "MCP key not found.");
  return c.body(null, 204);
});

type McpContext = {
  restaurantId: string;
  userId: string;
  role: (typeof restaurantMemberships.$inferSelect)["role"];
};
async function authenticateMcp(header: string | undefined): Promise<McpContext> {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token)
    throw new ApiError(401, "MCP_AUTH_REQUIRED", "Provide the MCP key as a Bearer token.");
  const [row] = await db
    .select({
      keyId: mcpApiKeys.id,
      restaurantId: mcpApiKeys.restaurantId,
      userId: mcpApiKeys.userId,
      role: restaurantMemberships.role,
    })
    .from(mcpApiKeys)
    .innerJoin(
      restaurantMemberships,
      and(
        eq(restaurantMemberships.restaurantId, mcpApiKeys.restaurantId),
        eq(restaurantMemberships.userId, mcpApiKeys.userId),
      ),
    )
    .where(and(eq(mcpApiKeys.tokenHash, await sha256(token)), isNull(mcpApiKeys.revokedAt)))
    .limit(1);
  if (!row || !can(row.role, "assistant:use"))
    throw new ApiError(401, "INVALID_MCP_KEY", "The MCP key is invalid or no longer authorized.");
  await requireRestaurantFeature(row.restaurantId, "nora");
  void db.update(mcpApiKeys).set({ lastUsedAt: new Date() }).where(eq(mcpApiKeys.id, row.keyId));
  return row;
}

const rpcRequest = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
const result = (id: string | number | null | undefined, value: unknown) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  result: value,
});
const failure = (id: string | number | null | undefined, code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

export const mcpRoutes = new Hono();
mcpRoutes.get("/", (c) =>
  c.json({ name: "Astron MCP", protocol: "2025-03-26", transport: "streamable-http" }),
);
mcpRoutes.post("/", async (c) => {
  const auth = await authenticateMcp(c.req.header("Authorization"));
  const request = rpcRequest.parse(await c.req.json());
  if (request.method === "notifications/initialized") return c.body(null, 202);
  if (request.method === "initialize")
    return c.json(
      result(request.id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "astron", version: "1.0.0" },
      }),
    );
  if (request.method === "ping") return c.json(result(request.id, {}));
  if (request.method === "tools/list")
    return c.json(result(request.id, { tools: mcpToolDefinitions }));
  if (request.method === "tools/call") {
    const parsed = z
      .object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).default({}) })
      .parse(request.params ?? {});
    try {
      const value = await runNoraTool({ ...auth, name: parsed.name, input: parsed.arguments });
      return c.json(
        result(request.id, {
          content: [{ type: "text", text: JSON.stringify(value) }],
          structuredContent: value,
        }),
      );
    } catch (error) {
      return c.json(
        result(request.id, {
          content: [
            { type: "text", text: error instanceof Error ? error.message : "Tool call failed." },
          ],
          isError: true,
        }),
      );
    }
  }
  return c.json(failure(request.id, -32601, "Method not found"), 404);
});
