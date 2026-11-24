import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import type { Config } from "./config.js";
import { completeChat, sendPushover, type NotifyResult } from "./connectors.js";
import { mockReply } from "./dog.js";
import type { Store } from "./store.js";
import { handleTurn, type PublicState } from "./turn.js";
import type { ModelContext } from "./types.js";

const COOKIE = "gos_owner";
const MAX_BODY = 20_000;

type App = {
  config: Config;
  store: Store;
  bootId: string;
};

export function createApp(app: App) {
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const replyWith = (ctx: ModelContext): Promise<string> => {
    if (app.config.mockLlm) {
      return Promise.resolve(
        mockReply({
          message: ctx.message,
          night: ctx.night,
          puppy: ctx.stage === "puppy",
          hurt: ctx.hurt,
          language: ctx.language,
        }),
      );
    }
    return completeChat(app.config, ctx);
  };

  const notify = (kind: "stranger" | "nudge", text: string): Promise<NotifyResult> => {
    void kind;
    return sendPushover(app.config, text);
  };

  const turn = (owner: boolean, source: "user" | "cron", message?: string) =>
    exclusive(() =>
      handleTurn({
        store: app.store,
        now: new Date(),
        owner,
        bootId: app.bootId,
        sleepGapMs: app.config.sleepGapMs,
        growAfter: app.config.growAfter,
        nudgeAfterMs: app.config.nudgeAfterMs,
        nudgeCooldownMs: app.config.nudgeCooldownMs,
        strangerCooldownMs: app.config.strangerCooldownMs,
        source,
        message,
        reply: replyWith,
        notify,
      }),
    );

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        sendJson(res, 200, await turn(isOwner(req, app.config.ownerToken), "user"));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/chat") {
        const body = await readBody(req);
        const message = typeof body.message === "string" ? body.message : "";
        if (!message.trim() || message.length > 2000) {
          sendJson(res, 400, { error: "Write a message under 2000 characters." });
          return;
        }
        sendJson(res, 200, await turn(isOwner(req, app.config.ownerToken), "user", message));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/login") {
        const body = await readBody(req);
        const token = typeof body.token === "string" ? body.token : "";
        if (!tokenMatches(token, app.config.ownerToken)) {
          sendJson(res, 401, { error: "Wrong token." });
          return;
        }
        res.setHeader("set-cookie", cookieValue(token, req));
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/logout") {
        res.setHeader("set-cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/bones") {
        if (!isOwner(req, app.config.ownerToken)) {
          sendJson(res, 401, { error: "Wrong token." });
          return;
        }
        const body = await readBody(req);
        const note = typeof body.note === "string" ? body.note.trim() : "";
        if (!note || note.length > 500) {
          sendJson(res, 400, { error: "Write a tea note under 500 characters." });
          return;
        }
        const bone = await exclusive(() => app.store.buryBone(note, new Date()));
        sendJson(res, 200, { bone });
        return;
      }
      if (req.method === "DELETE" && url.pathname.startsWith("/api/bones/")) {
        if (!isOwner(req, app.config.ownerToken)) {
          sendJson(res, 401, { error: "Wrong token." });
          return;
        }
        const id = decodeURIComponent(url.pathname.slice("/api/bones/".length));
        const removed = await exclusive(() => app.store.deleteBone(id));
        sendJson(res, removed ? 200 : 404, removed ? { ok: true } : { error: "That bone is already gone." });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/guestbook") {
        const body = await readBody(req);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const note = typeof body.note === "string" ? body.note.trim() : "";
        if (!name || name.length > 40 || note.length > 280) {
          sendJson(res, 400, { error: "Sign with a name, and keep the note under 280 characters." });
          return;
        }
        await exclusive(() =>
          app.store.addGuest({
            id: `guest-${Date.now().toString(36)}`,
            name,
            note,
            at: new Date().toISOString(),
          }),
        );
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/nudge") {
        if (!app.config.cronToken) {
          sendJson(res, 404, { error: "Nudge endpoint is off." });
          return;
        }
        const header = headerValue(req, "x-gos-cron");
        if (!tokenMatches(header, app.config.cronToken)) {
          sendJson(res, 401, { error: "Wrong token." });
          return;
        }
        const state = await turn(false, "cron");
        sendJson(res, 200, { ok: true, madrid: state.madrid });
        return;
      }
      if (req.method === "GET") {
        await serveStatic(app.config.publicDir, url.pathname, res);
        return;
      }
      sendJson(res, 404, { error: "Not found." });
    } catch (error) {
      console.error(error instanceof Error ? error.message : "request error");
      if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong. Try again." });
    }
  });
}

function isOwner(req: IncomingMessage, ownerToken: string): boolean {
  return tokenMatches(cookies(req)[COOKIE] ?? "", ownerToken);
}

function tokenMatches(given: string, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function cookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function cookieValue(token: string, req: IncomingMessage): string {
  const proto = headerValue(req, "x-forwarded-proto");
  const secure = proto === "https" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`;
}

function headerValue(req: IncomingMessage, name: string): string {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buf.length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(buf);
  }
  if (size === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(raw);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function serveStatic(publicDir: string, pathname: string, res: ServerResponse): Promise<void> {
  const artDir = path.resolve(publicDir, "../art");
  if (pathname.startsWith("/art/")) {
    const file = path.resolve(artDir, pathname.slice("/art/".length));
    if (!file.startsWith(artDir + path.sep) && file !== artDir) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
    await sendFile(file, res);
    return;
  }
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = path.resolve(publicDir, `.${requested}`);
  if (!file.startsWith(path.resolve(publicDir) + path.sep) && file !== path.resolve(publicDir)) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }
  await sendFile(file, res);
}

async function sendFile(file: string, res: ServerResponse): Promise<void> {
  try {
    const body = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
    throw error;
  }
}

export type { PublicState };
