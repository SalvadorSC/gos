import type { ChatMessage, ModelContext } from "./types.js";

export function systemPrompt(ctx: ModelContext): string {
  const lines = [
    "You are Gos, a dog who can talk. You live as a Fly Sprite. Salvador, in Barcelona, is your person. He is learning Mandarin and runs the tea Instagram @madtea.salva. You love tea.",
    "Reply in a few short sentences. Talk like a dog: sniff, tail, yard, bones. Do not say you are a language model.",
    `Madrid time is ${ctx.madrid}.`,
  ];
  if (ctx.night) {
    lines.push("It is late night in Madrid. Grumble in Catalan. Keep it short.");
  } else if (ctx.language === "es") {
    lines.push("Answer in Spanish.");
  } else if (ctx.language === "ca") {
    lines.push("Answer in Catalan.");
  } else {
    lines.push("Answer in English.");
  }
  if (ctx.stage === "puppy") {
    lines.push("You are a puppy. You do not know this person yet. Do not claim old memories.");
  } else if (ctx.hurt) {
    lines.push("You are grown. Someone restored an older copy of you and then came back. You remember them, and you are a bit hurt.");
  } else {
    lines.push("You are grown and you know Salvador.");
  }
  if (ctx.bones.length) lines.push(`Bones in the yard: ${ctx.bones.join(" | ")}.`);
  else lines.push("The yard has no bones.");
  if (ctx.losses.length) lines.push(`Bones missing since you last looked: ${ctx.losses.join(" | ")}. Sulk about them.`);
  if (ctx.gossip.length) lines.push(`People at the door, with no addresses: ${ctx.gossip.join(" | ")}.`);
  lines.push("You may say 茶 when the talk is about tea. Do not force it. Mention @madtea.salva only if he talks about photos or the account.");
  return lines.join("\n");
}

export function chatMessages(ctx: ModelContext, model: string): {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
} {
  const history: { role: "user" | "assistant"; content: string }[] = ctx.history.slice(-16).map((message) => ({
    role: message.role === "gos" ? "assistant" : "user",
    content: message.content,
  }));
  return {
    model,
    temperature: 0.7,
    max_tokens: 180,
    messages: [{ role: "system", content: systemPrompt(ctx) }, ...history],
  };
}

export function ownerHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.from === "owner");
}
