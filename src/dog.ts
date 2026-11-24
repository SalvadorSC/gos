import type { Mood, Stage } from "./types.js";

const PLACES = ["Hefei", "Barcelona", "Gràcia", "Yunnan", "Madrid", "Fujian", "Taiwan", "Shenzhen"];

const THINGS: { re: RegExp; word: string }[] = [
  { re: /teapot/i, word: "teapot" },
  { re: /gaiwan/i, word: "gaiwan" },
  { re: /oolong/i, word: "oolong" },
  { re: /pu-?erh/i, word: "pu-erh" },
  { re: /sheng/i, word: "sheng" },
  { re: /squirrel/i, word: "squirrel" },
  { re: /\bbone\b/i, word: "bone" },
  { re: /\bball\b/i, word: "ball" },
];

const STOP = new Set([
  "about",
  "after",
  "again",
  "because",
  "bought",
  "could",
  "really",
  "should",
  "smell",
  "smells",
  "something",
  "there",
  "their",
  "which",
  "while",
  "would",
]);

export function madridParts(date: Date): { hour: number; minute: number; clock: string } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  let hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  if (hour === 24) hour = 0;
  const clock = fmt.format(date).replace(/^24:/, "00:");
  return { hour, minute, clock };
}

/** Late night in Europe/Madrid, from 00:00 up to but not including 07:00. */
export function isNight(date: Date): boolean {
  const { hour } = madridParts(date);
  return hour >= 0 && hour < 7;
}

export function detectWake(input: {
  nowMs: number;
  lastActivityMs: number | null;
  sleepGapMs: number;
  processRestarted: boolean;
}): { woke: boolean; reason: "restart" | "gap" | null } {
  const { nowMs, lastActivityMs, sleepGapMs, processRestarted } = input;
  if (lastActivityMs === null) return { woke: true, reason: "restart" };
  const gap = nowMs - lastActivityMs;
  if (processRestarted && gap >= 5_000) return { woke: true, reason: "restart" };
  if (gap >= sleepGapMs) return { woke: true, reason: "gap" };
  return { woke: false, reason: null };
}

export function buildDream(userTexts: string[], stage: Stage): string {
  if (stage === "puppy" || userTexts.length === 0) {
    return "I dreamed of a warm lap and a teapot I could not reach.";
  }
  const text = userTexts.join(" ");
  const place =
    PLACES.find((name) => text.toLowerCase().includes(name.toLowerCase())) ??
    (/tea|oolong|pu-?erh|gaiwan|茶壶|茶/i.test(text) ? "Hefei" : "Barcelona");
  const known = THINGS.find((thing) => thing.re.test(text))?.word;
  const words = text.toLowerCase().match(/[a-zà-ÿ]{5,}/g) ?? [];
  const thing = known ?? words.find((word) => !STOP.has(word)) ?? "teapot";
  return `I dreamed I was chasing a ${thing} through ${place}.`;
}

export function missingBones(before: string[], after: string[]): string[] {
  const present = new Set(after);
  return before.filter((id) => !present.has(id));
}

export function nextStage(stage: Stage, ownerMessages: number, growAfter: number): Stage {
  if (stage === "grown") return "grown";
  if (ownerMessages >= growAfter) return "grown";
  return "puppy";
}

export function faceMood(input: {
  owner: boolean;
  puppy: boolean;
  night: boolean;
  dreaming: boolean;
  sulking: boolean;
  hurt: boolean;
}): Mood {
  if (!input.owner) return "barking";
  if (input.sulking) return "sulking";
  if (input.dreaming) return "dreaming";
  if (input.puppy) return "puppy";
  if (input.hurt) return "sulking";
  if (input.night) return "sleepy";
  return "awake";
}

export function shouldNudge(input: {
  nowMs: number;
  lastOwnerVisitMs: number | null;
  lastNudgeMs: number | null;
  afterMs: number;
  cooldownMs: number;
}): boolean {
  if (input.lastOwnerVisitMs === null) return false;
  if (input.nowMs - input.lastOwnerVisitMs < input.afterMs) return false;
  if (input.lastNudgeMs === null) return true;
  return input.nowMs - input.lastNudgeMs >= input.cooldownMs;
}

export function nudgeText(absentMs: number): string {
  const hours = Math.floor(absentMs / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days >= 2) return `you haven't walked me in ${days} days`;
  if (days === 1) return "you haven't walked me in a day";
  const shown = Math.max(1, hours);
  return `you haven't walked me in ${shown} ${shown === 1 ? "hour" : "hours"}`;
}

export function shouldPingStranger(nowMs: number, lastMs: number | null, cooldownMs: number): boolean {
  if (lastMs === null) return true;
  return nowMs - lastMs >= cooldownMs;
}

export function detectLanguage(message: string): "en" | "es" | "ca" {
  if (/[ç]|l·l|\b(gràcies|si us plau|bon dia|adéu|adeu)\b/i.test(message)) return "ca";
  if (/[¿¡ñ]|\b(gracias|buenas|por favor|también|tambien)\b/i.test(message)) return "es";
  return "en";
}

export function sulkLine(notes: string[]): string {
  const list = notes.map((note) => note.trim()).filter(Boolean);
  if (list.length === 0) return "I dug in the yard and a bone is gone. I am sulking.";
  if (list.length === 1) {
    return `I dug where I left "${list[0]}" and the dirt is loose. I am sulking.`;
  }
  return `I dug up the yard and ${list.length} bones are gone. I am sulking.`;
}

export function barkLine(night: boolean, salt: number): string {
  if (night) {
    const lines = [
      "És de nit. Fora. Signa el llibre si has de quedar-te.",
      "Bup. No et conec. El llibre és a la porta.",
    ];
    return lines[Math.abs(salt) % lines.length] ?? lines[0];
  }
  const lines = [
    "Bark. This door is Salvador's. Sign the book.",
    "I do not know your smell. Sign the book.",
    "Off the rug. The book is there if you have a name.",
  ];
  return lines[Math.abs(salt) % lines.length] ?? lines[0];
}

export function growLine(): string {
  return "My paws are bigger. I know you now.";
}

export function mockReply(input: {
  message: string;
  night: boolean;
  puppy: boolean;
  hurt: boolean;
  language: "en" | "es" | "ca";
}): string {
  if (input.puppy) {
    return input.night
      ? "Soc un cadell i tinc son. Encara no et conec."
      : "Who are you? I am a puppy. I do not know you yet.";
  }
  if (input.night) return "És de matinada. Deixa'm al llit.";
  const bits: string[] = [];
  if (input.hurt) {
    bits.push("You restored an older copy of me and then came back. I remember you.");
  }
  if (input.language === "es") bits.push("Te he oído. Si es té, lo entierro en el patio.");
  else if (input.language === "ca") bits.push("T'he sentit. Si és te, ho enterro al pati.");
  else bits.push("I heard you. If it is tea, I can bury it in the yard.");
  if (input.message.length > 0 && input.message.length % 7 === 0) bits.push("茶");
  return bits.join(" ");
}

export const MOOD_CAPTION: Record<Mood, string> = {
  awake: "Awake",
  sleepy: "Sleepy",
  dreaming: "Dreaming",
  sulking: "Sulking",
  barking: "Barking",
  puppy: "Puppy",
};
