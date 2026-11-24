export type Mood = "awake" | "sleepy" | "dreaming" | "sulking" | "barking" | "puppy";

export type Stage = "puppy" | "grown";

export type Speaker = "owner" | "visitor";

export type ChatMessage = {
  role: "user" | "gos";
  content: string;
  at: string;
  from: Speaker;
  kind?: "dream" | "sulk" | "grow" | "chat";
};

export type Bone = {
  id: string;
  note: string;
  buriedAt: string;
};

export type GuestEntry = {
  id: string;
  name: string;
  note: string;
  at: string;
};

export type Whisper = {
  text: string;
  at: string;
};

export type Face = {
  mood: Mood;
  until: string;
};

export type Life = {
  stage: Stage;
  bornAt: string;
  timeWound: { at: string } | null;
};

export type Meta = {
  lastActivityAt: string | null;
  lastOwnerVisitAt: string | null;
  lastNudgeAt: string | null;
  lastStrangerPingAt: string | null;
  lastBootId: string | null;
  yardIndex: { id: string; note: string }[];
  face: Face | null;
};

export type ModelContext = {
  madrid: string;
  night: boolean;
  language: "en" | "es" | "ca";
  stage: Stage;
  hurt: boolean;
  bones: string[];
  losses: string[];
  gossip: string[];
  history: ChatMessage[];
  message: string;
};
