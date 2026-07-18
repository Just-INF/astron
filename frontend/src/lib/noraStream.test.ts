import { afterEach, describe, expect, test, vi } from "vitest";
import { api, type NoraStreamEvent } from "./api/client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Nora response streaming", () => {
  test("delivers incremental NDJSON events without waiting for completion", async () => {
    const body = [
      { type: "session", conversationId: "conv_1" },
      { type: "assistant_start", id: "msg_1", createdAt: "2026-01-01T00:00:00.000Z" },
      { type: "delta", delta: "Hello" },
      { type: "delta", delta: " there" },
      {
        type: "done",
        message: {
          id: "msg_1",
          role: "assistant",
          content: "Hello there",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        proposals: [],
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    globalThis.fetch = vi.fn(
      async () =>
        new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } }),
    ) as typeof fetch;
    const events: NoraStreamEvent[] = [];
    await api.noraChatStream("rest_1", "Hello", "conv_1", (event) => events.push(event));
    expect(events.map((event) => event.type)).toEqual([
      "session",
      "assistant_start",
      "delta",
      "delta",
      "done",
    ]);
    expect(
      events
        .filter((event) => event.type === "delta")
        .map((event) => event.delta)
        .join(""),
    ).toBe("Hello there");
  });
});
