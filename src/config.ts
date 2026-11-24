import path from "node:path";
import { fileURLToPath } from "node:url";

export type LlmProvider = "openrouter" | "ollama";

export type Config = {
  port: number;
  dataDir: string;
  publicDir: string;
  mockLlm: boolean;
  ownerToken: string;
  gatewayBase: string;
  llmProvider: LlmProvider;
  llmConnectionId: string;
  llmPath: string;
  llmModel: string;
  pushoverConnectionId: string;
  pushoverUserKey: string;
  sleepGapMs: number;
  growAfter: number;
  nudgeAfterMs: number;
  nudgeCooldownMs: number;
  strangerCooldownMs: number;
  cronToken: string;
};

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

export function projectRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const root = projectRoot();
  const provider: LlmProvider = env.LLM_PROVIDER === "ollama" ? "ollama" : "openrouter";
  const openrouterId = env.OPENROUTER_CONNECTION_ID?.trim() ?? "";
  const ollamaId = env.OLLAMA_CONNECTION_ID?.trim() ?? "";
  return {
    port: intEnv("PORT", 8080),
    dataDir: env.DATA_DIR?.trim() || path.join(root, "data"),
    publicDir: path.join(root, "public"),
    mockLlm: env.MOCK_LLM === "1",
    ownerToken: env.OWNER_TOKEN?.trim() ?? "",
    gatewayBase: (env.GATEWAY_BASE?.trim() || "https://api.sprites.dev/v1/gateway").replace(/\/$/, ""),
    llmProvider: provider,
    llmConnectionId: provider === "ollama" ? ollamaId : openrouterId,
    llmPath:
      provider === "ollama"
        ? env.OLLAMA_PATH?.trim() || "/v1/chat/completions"
        : env.OPENROUTER_PATH?.trim() || "/api/v1/chat/completions",
    llmModel:
      provider === "ollama"
        ? env.OLLAMA_MODEL?.trim() || "kimi-k3"
        : env.OPENROUTER_MODEL?.trim() || "google/gemini-2.5-flash",
    pushoverConnectionId: env.PUSHOVER_CONNECTION_ID?.trim() ?? "",
    pushoverUserKey: env.PUSHOVER_USER_KEY?.trim() ?? "",
    sleepGapMs: intEnv("SLEEP_GAP_MS", 60_000),
    growAfter: intEnv("GROW_AFTER_MESSAGES", 6),
    nudgeAfterMs: intEnv("NUDGE_AFTER_HOURS", 48) * 3_600_000,
    nudgeCooldownMs: intEnv("NUDGE_COOLDOWN_HOURS", 24) * 3_600_000,
    strangerCooldownMs: intEnv("STRANGER_COOLDOWN_MS", 1_800_000),
    cronToken: env.CRON_TOKEN?.trim() ?? "",
  };
}
