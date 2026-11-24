import {
  barkLine,
  buildDream,
  detectLanguage,
  detectWake,
  faceMood,
  growLine,
  isNight,
  madridParts,
  missingBones,
  mockReply,
  MOOD_CAPTION,
  nextStage,
  nudgeText,
  shouldNudge,
  shouldPingStranger,
  sulkLine,
} from "./dog.js";
import type { NotifyResult } from "./connectors.js";
import type { Store } from "./store.js";
import type { ChatMessage, Life, Meta, Mood, ModelContext } from "./types.js";

export type TurnInput = {
  store: Store;
  now: Date;
  owner: boolean;
  bootId: string;
  sleepGapMs: number;
  growAfter: number;
  nudgeAfterMs: number;
  nudgeCooldownMs: number;
  strangerCooldownMs: number;
  source: "user" | "cron";
  message?: string;
  reply?: (ctx: ModelContext) => Promise<string>;
  notify?: (kind: "stranger" | "nudge", text: string) => Promise<NotifyResult>;
};

export type PublicState = {
  owner: boolean;
  mood: Mood;
  caption: string;
  madrid: string;
  night: boolean;
  life: Life["stage"];
  hurt: boolean;
  messages: { role: "user" | "gos"; content: string; at: string }[];
  bones: { id: string; note: string; buriedAt: string }[];
  gossip: string[];
  greeting: string | null;
  reply: string | null;
};

function gossipLines(
  guests: { name: string; note: string }[],
  whispers: { text: string }[],
): string[] {
  const lines = guests.slice(-8).map((guest) => {
    const name = guest.name.trim() || "Someone";
    const note = guest.note.trim();
    return note ? `${name} signed the book: ${note}` : `${name} signed the book.`;
  });
  for (const whisper of whispers.slice(-5)) lines.push(whisper.text);
  return lines.slice(-8);
}

function activeFace(meta: Meta, now: Date): Mood | null {
  if (!meta.face) return null;
  if (new Date(meta.face.until).getTime() <= now.getTime()) return null;
  return meta.face.mood;
}

export async function handleTurn(input: TurnInput): Promise<PublicState> {
  const { store, now, owner } = input;
  const life = await store.readLife();
  const meta = await store.readMeta();
  const night = isNight(now);
  const clock = madridParts(now);

  if (input.source === "cron") {
    await maybeNudge(input, meta, now);
    await store.writeMeta(meta);
    return snapshot(input, life, meta, [], null);
  }

  const previousOwnerVisit = meta.lastOwnerVisitAt;
  const bones = await store.listBones();
  const gone = missingBones(
    meta.yardIndex.map((item) => item.id),
    bones.map((bone) => bone.id),
  );
  const goneNotes = meta.yardIndex.filter((item) => gone.includes(item.id)).map((item) => item.note);
  const messages = await store.readMessages();
  const restarted = meta.lastBootId !== input.bootId;
  const wake = detectWake({
    nowMs: now.getTime(),
    lastActivityMs: meta.lastActivityAt ? new Date(meta.lastActivityAt).getTime() : null,
    sleepGapMs: input.sleepGapMs,
    processRestarted: restarted,
  });

  const appended: ChatMessage[] = [];
  let dreaming = false;
  let sulking = false;
  if (wake.woke) {
    const texts = messages.filter((message) => message.role === "user" && message.from === "owner").map((message) => message.content);
    appended.push({
      role: "gos",
      content: buildDream(texts, life.stage),
      at: now.toISOString(),
      from: "owner",
      kind: "dream",
    });
    dreaming = true;
  }
  if (goneNotes.length) {
    appended.push({
      role: "gos",
      content: sulkLine(goneNotes),
      at: now.toISOString(),
      from: "owner",
      kind: "sulk",
    });
    sulking = true;
  }

  if (dreaming || sulking) {
    const mood: Mood = sulking ? "sulking" : "dreaming";
    const hold = sulking ? 300_000 : 90_000;
    meta.face = { mood, until: new Date(now.getTime() + hold).toISOString() };
  }
  meta.yardIndex = bones.map((bone) => ({ id: bone.id, note: bone.note }));
  meta.lastActivityAt = now.toISOString();
  meta.lastBootId = input.bootId;

  if (owner && wake.woke && previousOwnerVisit) {
    await maybeNudge(input, meta, now, new Date(previousOwnerVisit).getTime());
  }
  if (owner) meta.lastOwnerVisitAt = now.toISOString();

  if (!owner && shouldPingStranger(
    now.getTime(),
    meta.lastStrangerPingAt ? new Date(meta.lastStrangerPingAt).getTime() : null,
    input.strangerCooldownMs,
  )) {
    const result = input.notify ? await input.notify("stranger", "someone's at the door 🐕") : "skipped";
    if (result === "sent" || result === "failed") meta.lastStrangerPingAt = now.toISOString();
  }

  let reply: string | null = null;
  const trimmed = input.message?.trim() ?? "";
  if (trimmed) {
    if (!owner) {
      const salt = trimmed.length + now.getTime();
      reply = barkLine(night, salt);
      await store.addWhisper({
        text: `A stranger said: ${trimmed.slice(0, 140)}`,
        at: now.toISOString(),
      });
    } else {
      const userMessage: ChatMessage = {
        role: "user",
        content: trimmed,
        at: now.toISOString(),
        from: "owner",
        kind: "chat",
      };
      appended.push(userMessage);
      const withUser = messages.concat(appended);
      const ownerCount = withUser.filter((message) => message.role === "user" && message.from === "owner").length;
      const stage = nextStage(life.stage, ownerCount, input.growAfter);
      if (stage !== life.stage) {
        life.stage = stage;
        await store.writeLife(life);
        appended.push({
          role: "gos",
          content: growLine(),
          at: now.toISOString(),
          from: "owner",
          kind: "grow",
        });
      }
      const guests = await store.readGuests();
      const whispers = await store.readWhispers();
      const ctx: ModelContext = {
        madrid: clock.clock,
        night,
        language: detectLanguage(trimmed),
        stage: life.stage,
        hurt: Boolean(life.timeWound),
        bones: bones.map((bone) => bone.note),
        losses: goneNotes,
        gossip: gossipLines(guests, whispers),
        history: withUser.filter((message) => message.from === "owner"),
        message: trimmed,
      };
      try {
        reply = input.reply ? await input.reply(ctx) : await defaultReply(ctx);
      } catch (error) {
        console.error(error instanceof Error ? error.message : "llm error");
        reply = "I could not answer. Try again.";
      }
      appended.push({
        role: "gos",
        content: reply,
        at: now.toISOString(),
        from: "owner",
        kind: "chat",
      });
    }
  }

  if (appended.length) await store.writeMessages(messages.concat(appended));
  await store.writeMeta(meta);
  if (life.timeWound || life.stage) await store.writeLife(life);

  const greeting = owner || trimmed ? null : barkLine(night, now.getHours());
  return snapshot(input, life, meta, goneNotes, reply, greeting, dreaming, sulking);
}

async function defaultReply(ctx: ModelContext): Promise<string> {
  return mockReply({
    message: ctx.message,
    night: ctx.night,
    puppy: ctx.stage === "puppy",
    hurt: ctx.hurt,
    language: ctx.language,
  });
}

async function maybeNudge(input: TurnInput, meta: Meta, now: Date, lastOwnerVisitMs?: number): Promise<void> {
  const visitMs =
    lastOwnerVisitMs ??
    (meta.lastOwnerVisitAt ? new Date(meta.lastOwnerVisitAt).getTime() : null);
  const nudgeMs = meta.lastNudgeAt ? new Date(meta.lastNudgeAt).getTime() : null;
  if (!shouldNudge({
    nowMs: now.getTime(),
    lastOwnerVisitMs: visitMs,
    lastNudgeMs: nudgeMs,
    afterMs: input.nudgeAfterMs,
    cooldownMs: input.nudgeCooldownMs,
  })) {
    return;
  }
  const absent = visitMs === null ? 0 : now.getTime() - visitMs;
  const result = input.notify ? await input.notify("nudge", nudgeText(absent)) : "skipped";
  if (result === "sent" || result === "failed") meta.lastNudgeAt = now.toISOString();
}

async function snapshot(
  input: TurnInput,
  life: Life,
  meta: Meta,
  losses: string[],
  reply: string | null,
  greeting: string | null = null,
  dreaming = false,
  sulking = false,
): Promise<PublicState> {
  const { now, owner, store } = input;
  const night = isNight(now);
  const clock = madridParts(now);
  const held = activeFace(meta, now);
  const mood =
    held && owner
      ? held
      : faceMood({
          owner,
          puppy: life.stage === "puppy",
          night,
          dreaming,
          sulking: sulking || losses.length > 0,
          hurt: Boolean(life.timeWound),
        });
  const messages = owner
    ? (await store.readMessages()).slice(-40).map((message) => ({
        role: message.role,
        content: message.content,
        at: message.at,
      }))
    : [];
  const bones = owner
    ? (await store.listBones()).map((bone) => ({
        id: bone.id,
        note: bone.note,
        buriedAt: bone.buriedAt,
      }))
    : [];
  const guests = owner ? await store.readGuests() : [];
  const whispers = owner ? await store.readWhispers() : [];
  let caption = MOOD_CAPTION[mood];
  if (owner && life.timeWound && mood === "sulking" && losses.length === 0 && !sulking) {
    caption = "Sulking";
  }
  return {
    owner,
    mood,
    caption,
    madrid: clock.clock,
    night,
    life: life.stage,
    hurt: owner && Boolean(life.timeWound),
    messages,
    bones,
    gossip: owner ? gossipLines(guests, whispers) : [],
    greeting,
    reply,
  };
}
