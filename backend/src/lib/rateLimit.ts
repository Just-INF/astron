import { createMiddleware } from "hono/factory";
import { ApiError } from "./errors";
import { config } from "./config";
import { createClient } from "redis";

const buckets = new Map<string, { count: number; resetAt: number }>();
const redis = config.REDIS_URL ? createClient({ url: config.REDIS_URL }) : null;
redis?.on("error", (error) =>
  console.error(JSON.stringify({ level: "error", event: "redis_error", message: error.message })),
);
let connecting: Promise<unknown> | null = null;

async function redisClient() {
  if (!redis) return null;
  if (!redis.isOpen)
    connecting ??= redis.connect().finally(() => {
      connecting = null;
    });
  if (connecting) await connecting;
  return redis;
}

async function incrementShared(key: string, windowMs: number) {
  const client = await redisClient();
  if (!client) return null;
  const result = (await client.eval(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('PTTL',KEYS[1])}",
    { keys: [`astron:ratelimit:${key}`], arguments: [String(windowMs)] },
  )) as [number, number];
  return { count: Number(result[0]), resetAt: Date.now() + Math.max(0, Number(result[1])) };
}

export async function closeRateLimitStore() {
  if (redis?.isOpen) await redis.quit();
}
export async function pingRateLimitStore() {
  const client = await redisClient();
  return client ? (await client.ping()) === "PONG" : true;
}

export function rateLimit(name: string, limit: number, windowMs: number) {
  return createMiddleware(async (c, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
    const forwarded = config.TRUST_PROXY
      ? c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      : undefined;
    const identity =
      forwarded ||
      (config.TRUST_PROXY
        ? c.req.header("cf-connecting-ip") || c.req.header("x-real-ip")
        : undefined) ||
      "local";
    const key = `${name}:${identity}`;
    const now = Date.now();
    let bucket: { count: number; resetAt: number };
    try {
      const shared = await incrementShared(key, windowMs);
      const current = buckets.get(key);
      bucket =
        shared ??
        (!current || current.resetAt <= now
          ? { count: 1, resetAt: now + windowMs }
          : { ...current, count: current.count + 1 });
      if (!shared) buckets.set(key, bucket);
    } catch {
      throw new ApiError(
        503,
        "RATE_LIMIT_STORE_UNAVAILABLE",
        "The security service is temporarily unavailable.",
      );
    }
    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
    c.header("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > limit) {
      c.header("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again shortly.");
    }
    if (buckets.size > 10_000)
      for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    await next();
  });
}
