import { describe, expect, test } from "bun:test";
import { app } from "./app";

describe("operational HTTP behavior", () => {
  test("liveness does not depend on external services", async () => {
    const response = await app.request("/health/live");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "astron-api" });
  });

  test("propagates a bounded request ID", async () => {
    const response = await app.request("/health/live", {
      headers: { "X-Request-Id": "release-smoke-123" },
    });
    expect(response.headers.get("X-Request-Id")).toBe("release-smoke-123");
    expect(response.headers.get("Server-Timing")).toMatch(/^app;dur=/);
  });

  test("does not expose MCP tools without a bearer credential", async () => {
    const response = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(response.status).toBe(401);
  });
});
