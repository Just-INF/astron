import { afterEach, describe, expect, test } from "bun:test";
import { callZen } from "./zen";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Nora OpenCode Zen client", () => {
  test("requests streaming tool calls and reconstructs split arguments", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const stream = [
        'data: {"choices":[{"delta":{"content":"Checking the menu"}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search_menu","arguments":"{\\"query\\":"}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"pasta\\"}"}}]}}]}',
        "data: [DONE]",
      ].join("\n\n");
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;
    const tools = [
      {
        type: "function" as const,
        function: { name: "search_menu", description: "Search", parameters: { type: "object" } },
      },
    ];
    const deltas: string[] = [];
    const response = await callZen([{ role: "user", content: "Find pasta" }], tools, (delta) => {
      deltas.push(delta);
    });
    expect(requestBody?.stream).toBe(true);
    expect(requestBody?.model).toBe("deepseek-v4-flash-free");
    expect(response.toolCalls[0]?.id).toBe("call_1");
    expect(response.toolCalls[0]?.function.name).toBe("search_menu");
    expect(JSON.parse(response.toolCalls[0]?.function.arguments ?? "{}")).toEqual({
      query: "pasta",
    });
    expect(deltas).toEqual(["Checking the menu"]);
  });
});
