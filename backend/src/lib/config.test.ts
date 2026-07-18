import { describe, expect, test } from "bun:test";

const validProductionEnv = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:pass@db.example.com:5432/astron",
  FRONTEND_ORIGIN: "https://app.example.com",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "user",
  SMTP_PASS: "secret",
  SMTP_FROM: "noreply@example.com",
  REDIS_URL: "rediss://default:password@redis.example.com:6379",
  LOCAL_MEDIA_DIR: "files/uploads",
  LEMONSQUEEZY_API_KEY: "test-key",
  LEMONSQUEEZY_STORE_ID: "1",
  LEMONSQUEEZY_VARIANT_ID: "2",
  LEMONSQUEEZY_WEBHOOK_SECRET: "test-webhook-secret",
};

function validate(env: Record<string, string | undefined>) {
  return Bun.spawnSync([process.execPath, "src/scripts/validate-production-env.ts"], {
    cwd: process.cwd(),
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("production environment validation", () => {
  test("accepts a complete HTTPS production configuration", () => {
    const result = validate(validProductionEnv);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('"valid": true');
    expect(result.stdout.toString()).not.toContain("secret");
  });

  test("accepts backend-local storage in the files directory", () => {
    const result = validate({
      ...validProductionEnv,
      LOCAL_MEDIA_DIR: "files/uploads",
    });
    expect(result.exitCode).toBe(0);
  });

  test("rejects local upload paths outside backend files", () => {
    const result = validate({ ...validProductionEnv, LOCAL_MEDIA_DIR: "../uploads" });
    expect(result.exitCode).not.toBe(0);
  });

  test("rejects missing provider secrets", () => {
    const env = { ...validProductionEnv, SMTP_PASS: "" };
    expect(validate(env).exitCode).not.toBe(0);
  });

  test("rejects an insecure frontend origin", () => {
    const env = { ...validProductionEnv, FRONTEND_ORIGIN: "http://app.example.com" };
    expect(validate(env).exitCode).not.toBe(0);
  });
});
