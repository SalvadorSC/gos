import type { Config } from "./config.js";
import { chatMessages } from "./prompt.js";
import type { ModelContext } from "./types.js";

export type NotifyResult = "sent" | "skipped" | "failed";

function gatewayUrl(config: Config, provider: string, connectionId: string, providerPath: string): string {
  const suffix = providerPath.startsWith("/") ? providerPath : `/${providerPath}`;
  return `${config.gatewayBase}/${provider}/${connectionId}${suffix}`;
}

export async function completeChat(config: Config, ctx: ModelContext): Promise<string> {
  if (!config.llmConnectionId) {
    throw new Error("missing connection id");
  }
  const provider = config.llmProvider;
  const url = gatewayUrl(config, provider, config.llmConnectionId, config.llmPath);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-title": "Gos",
    },
    body: JSON.stringify(chatMessages(ctx, config.llmModel)),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`llm ${response.status}`);
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
      .join("")
      .trim();
    if (text) return text;
  }
  throw new Error("empty llm response");
}

/**
 * Pushover connector: POST /1/messages.json with JSON `{ user, title, message }`.
 * The gateway adds the application token as the `token` query parameter.
 * Do not retry a rejected request. The shared gateway IP can get blocked.
 */
export async function sendPushover(config: Config, message: string, title = "Gos"): Promise<NotifyResult> {
  if (!config.pushoverConnectionId || !config.pushoverUserKey) return "skipped";
  const url = gatewayUrl(config, "pushover", config.pushoverConnectionId, "/1/messages.json");
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user: config.pushoverUserKey,
        title: title.slice(0, 250),
        message: message.slice(0, 1024),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error(`pushover failed: ${response.status}`);
      return "failed";
    }
    return "sent";
  } catch (error) {
    const name = error instanceof Error ? error.name : "error";
    console.error(`pushover failed: ${name}`);
    return "failed";
  }
}
