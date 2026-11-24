import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bone, ChatMessage, GuestEntry, Life, Meta, Whisper } from "./types.js";

const BONE_ID = /^bone-[a-z0-9]+$/;

function emptyMeta(): Meta {
  return {
    lastActivityAt: null,
    lastOwnerVisitAt: null,
    lastNudgeAt: null,
    lastStrangerPingAt: null,
    lastBootId: null,
    yardIndex: [],
    face: null,
  };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, file);
}

export class Store {
  constructor(private readonly dir: string) {}

  get yardDir(): string {
    return path.join(this.dir, "yard");
  }

  async init(): Promise<void> {
    await mkdir(this.yardDir, { recursive: true });
    if (!(await this.exists("life.json"))) {
      const life: Life = { stage: "puppy", bornAt: new Date().toISOString(), timeWound: null };
      await writeJson(this.file("life.json"), life);
    }
    if (!(await this.exists("meta.json"))) await writeJson(this.file("meta.json"), emptyMeta());
    if (!(await this.exists("messages.json"))) await writeJson(this.file("messages.json"), []);
    if (!(await this.exists("guestbook.json"))) await writeJson(this.file("guestbook.json"), []);
    if (!(await this.exists("whispers.json"))) await writeJson(this.file("whispers.json"), []);
  }

  async readLife(): Promise<Life> {
    return readJson<Life>(this.file("life.json"), {
      stage: "puppy",
      bornAt: new Date().toISOString(),
      timeWound: null,
    });
  }

  async writeLife(life: Life): Promise<void> {
    await writeJson(this.file("life.json"), life);
  }

  async readMeta(): Promise<Meta> {
    const meta = await readJson<Meta>(this.file("meta.json"), emptyMeta());
    return { ...emptyMeta(), ...meta, yardIndex: meta.yardIndex ?? [] };
  }

  async writeMeta(meta: Meta): Promise<void> {
    await writeJson(this.file("meta.json"), meta);
  }

  async readMessages(): Promise<ChatMessage[]> {
    return readJson<ChatMessage[]>(this.file("messages.json"), []);
  }

  async writeMessages(messages: ChatMessage[]): Promise<void> {
    const capped = messages.slice(-300);
    await writeJson(this.file("messages.json"), capped);
  }

  async listBones(): Promise<Bone[]> {
    let names: string[] = [];
    try {
      names = await readdir(this.yardDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const bones: Bone[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      if (!BONE_ID.test(id)) continue;
      const bone = await readJson<Bone | null>(path.join(this.yardDir, name), null);
      if (bone && bone.id === id && typeof bone.note === "string") bones.push(bone);
    }
    bones.sort((a, b) => a.buriedAt.localeCompare(b.buriedAt));
    return bones;
  }

  async buryBone(note: string, now: Date): Promise<Bone> {
    const bone: Bone = {
      id: `bone${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`.replace(
        /^bone/,
        "bone-",
      ),
      note: note.trim(),
      buriedAt: now.toISOString(),
    };
    if (!BONE_ID.test(bone.id)) throw new Error("bone id");
    await mkdir(this.yardDir, { recursive: true });
    await writeJson(path.join(this.yardDir, `${bone.id}.json`), bone);
    const meta = await this.readMeta();
    meta.yardIndex = meta.yardIndex.filter((item) => item.id !== bone.id).concat({
      id: bone.id,
      note: bone.note,
    });
    await this.writeMeta(meta);
    return bone;
  }

  async deleteBone(id: string): Promise<boolean> {
    if (!BONE_ID.test(id)) return false;
    try {
      await rm(path.join(this.yardDir, `${id}.json`));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async readGuests(): Promise<GuestEntry[]> {
    return readJson<GuestEntry[]>(this.file("guestbook.json"), []);
  }

  async addGuest(entry: GuestEntry): Promise<void> {
    const all = await this.readGuests();
    all.push(entry);
    await writeJson(this.file("guestbook.json"), all.slice(-100));
  }

  async readWhispers(): Promise<Whisper[]> {
    return readJson<Whisper[]>(this.file("whispers.json"), []);
  }

  async addWhisper(whisper: Whisper): Promise<void> {
    const all = await this.readWhispers();
    all.push(whisper);
    await writeJson(this.file("whispers.json"), all.slice(-50));
  }

  async resetPuppy(now: Date): Promise<void> {
    await rm(this.yardDir, { recursive: true, force: true });
    await mkdir(this.yardDir, { recursive: true });
    const life: Life = { stage: "puppy", bornAt: now.toISOString(), timeWound: null };
    await writeJson(this.file("life.json"), life);
    await writeJson(this.file("messages.json"), []);
    await writeJson(this.file("guestbook.json"), []);
    await writeJson(this.file("whispers.json"), []);
    await writeJson(this.file("meta.json"), emptyMeta());
  }

  async markGrown(): Promise<void> {
    const life = await this.readLife();
    life.stage = "grown";
    await this.writeLife(life);
  }

  async markWound(now: Date): Promise<void> {
    const life = await this.readLife();
    life.stage = "grown";
    life.timeWound = { at: now.toISOString() };
    await this.writeLife(life);
  }

  private file(name: string): string {
    return path.join(this.dir, name);
  }

  private async exists(name: string): Promise<boolean> {
    try {
      await readFile(this.file(name));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}
