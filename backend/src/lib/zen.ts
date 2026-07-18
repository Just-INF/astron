import { config } from "./config";
import type { NoraToolDefinition } from "./noraTools";

export type ZenToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type ZenMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ZenToolCall[];
};
export type ZenResult = { content: string; toolCalls: ZenToolCall[] };

type Chunk = {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
    };
    message?: { content?: string; tool_calls?: ZenToolCall[] };
  }>;
};

function mergeChunk(chunk: Chunk, state: ZenResult) {
  const choice = chunk.choices?.[0];
  const content = choice?.delta?.content ?? choice?.message?.content ?? "";
  state.content += content;
  if (choice?.message?.tool_calls) state.toolCalls.push(...choice.message.tool_calls);
  for (const part of choice?.delta?.tool_calls ?? []) {
    const index = part.index ?? 0;
    const current = state.toolCalls[index] ?? {
      id: "",
      type: "function" as const,
      function: { name: "", arguments: "" },
    };
    current.id += part.id ?? "";
    current.function.name += part.function?.name ?? "";
    current.function.arguments += part.function?.arguments ?? "";
    state.toolCalls[index] = current;
  }
  return content;
}

export async function callZen(
  messages: ZenMessage[],
  tools: NoraToolDefinition[],
  onDelta?: (delta: string) => void | Promise<void>,
): Promise<ZenResult> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const headers = new Headers({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent": "Astron-Nora/1.0",
    });
    if (config.NORA_AI_API_KEY) headers.set("Authorization", `Bearer ${config.NORA_AI_API_KEY}`);
    const response = await fetch(config.NORA_AI_URL, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.NORA_AI_MODEL,
        temperature: 0.1,
        max_tokens: config.NORA_AI_MAX_TOKENS,
        top_p: 0.9,
        stream: true,
        messages,
        tools,
        tool_choice: "auto",
      }),
    });
    if (!response.ok)
      throw new Error(
        `Nora model request failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
      );
    const result: ZenResult = { content: "", toolCalls: [] };
    if ((response.headers.get("content-type") ?? "").includes("application/json")) {
      const delta = mergeChunk(JSON.parse(await response.text()) as Chunk, result);
      if (delta) await onDelta?.(delta);
      return result;
    }
    if (!response.body) return result;
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "";
    const consume = async (line: string) => {
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") return;
      try {
        const delta = mergeChunk(JSON.parse(data) as Chunk, result);
        if (delta) await onDelta?.(delta);
      } catch {
        /* Ignore provider keepalive/non-JSON events. */
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) await consume(line);
      if (done) break;
    }
    if (buffer) await consume(buffer);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
