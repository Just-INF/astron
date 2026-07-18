import { z } from "zod";

const optionalString = (schema: z.ZodString = z.string().min(1)) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const config = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(8787),
    DATABASE_URL: z.string().min(1).default("postgres://astron:astron@localhost:5432/astron"),
    FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"),
    SESSION_COOKIE_NAME: z.string().default("astron_session"),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
    LOCAL_MEDIA_DIR: z.string().default("files/uploads"),
    TRUST_PROXY: z.preprocess(
      (value) => (value === "true" ? true : value === "false" ? false : value),
      z.boolean().default(false),
    ),
    REDIS_URL: optionalString(z.string().url()),
    SMTP_HOST: optionalString(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: optionalString(),
    SMTP_PASS: optionalString(),
    SMTP_FROM: optionalString(z.string().email()),
    LEMONSQUEEZY_API_KEY: optionalString(),
    LEMONSQUEEZY_STORE_ID: optionalString(),
    LEMONSQUEEZY_VARIANT_ID: optionalString(),
    LEMONSQUEEZY_TABLE_VARIANT_ID: optionalString(),
    LEMONSQUEEZY_GROUP_VARIANT_ID: optionalString(),
    LEMONSQUEEZY_WEBHOOK_SECRET: optionalString(z.string().min(6).max(100)),
    NORA_AI_URL: z.string().url().default("https://opencode.ai/zen/v1/chat/completions"),
    NORA_AI_MODEL: z.string().min(1).default("deepseek-v4-flash-free"),
    NORA_AI_API_KEY: optionalString(),
    NORA_AI_MAX_TOKENS: z.coerce.number().int().min(256).max(8192).default(2048),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;
    const required = [
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASS",
      "SMTP_FROM",
      "REDIS_URL",
      "LEMONSQUEEZY_API_KEY",
      "LEMONSQUEEZY_STORE_ID",
      "LEMONSQUEEZY_VARIANT_ID",
      "LEMONSQUEEZY_WEBHOOK_SECRET",
    ] as const;
    for (const key of required)
      if (!value[key])
        ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in production.` });
    if (!value.DATABASE_URL.startsWith("postgres"))
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "A PostgreSQL DATABASE_URL is required.",
      });
    if (value.FRONTEND_ORIGIN.startsWith("http://"))
      ctx.addIssue({
        code: "custom",
        path: ["FRONTEND_ORIGIN"],
        message: "Production FRONTEND_ORIGIN must use HTTPS.",
      });
    if (
      value.SESSION_COOKIE_NAME === "astron_session" &&
      value.FRONTEND_ORIGIN.includes("localhost")
    )
      ctx.addIssue({
        code: "custom",
        path: ["FRONTEND_ORIGIN"],
        message: "Production cannot use localhost.",
      });
    if (
      !value.LOCAL_MEDIA_DIR.startsWith("files/") ||
      value.LOCAL_MEDIA_DIR.split("/").includes("..")
    )
      ctx.addIssue({
        code: "custom",
        path: ["LOCAL_MEDIA_DIR"],
        message: "Local uploads must stay under backend/files/.",
      });
  })
  .parse(process.env);
