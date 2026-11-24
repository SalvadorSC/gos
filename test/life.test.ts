import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { faceMood, nextStage, nudgeText, shouldNudge } from "../src/dog.js";
import { Store } from "../src/store.js";
import { handleTurn } from "../src/turn.js";

test("puppy grows only after enough owner messages", () => {
  assert.equal(nextStage("puppy", 5, 6), "puppy");
  assert.equal(nextStage("puppy", 6, 6), "grown");
  assert.equal(nextStage("grown", 0, 6), "grown");
});

test("life stage picks the face", () => {
  assert.equal(faceMood({ owner: true, puppy: true, night: false, dreaming: false, sulking: false, hurt: false }), "puppy");
  assert.equal(faceMood({ owner: true, puppy: false, night: false, dreaming: false, sulking: false, hurt: false }), "awake");
  assert.equal(faceMood({ owner: true, puppy: false, night: false, dreaming: false, sulking: false, hurt: true }), "sulking");
  assert.equal(faceMood({ owner: false, puppy: true, night: false, dreaming: false, sulking: false, hurt: false }), "barking");
  assert.equal(faceMood({ owner: true, puppy: true, night: true, dreaming: false, sulking: false, hurt: false }), "puppy");
});

test("a restored grown dog is hurt, a reset puppy is not", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gos-life-"));
  try {
    const store = new Store(dir);
    await store.init();
    await store.markWound(new Date("2026-11-24T12:00:00.000Z"));
    const hurt = await store.readLife();
    assert.equal(hurt.stage, "grown");
    assert.ok(hurt.timeWound);
    await store.resetPuppy(new Date("2026-11-24T12:05:00.000Z"));
    const puppy = await store.readLife();
    assert.equal(puppy.stage, "puppy");
    assert.equal(puppy.timeWound, null);
    assert.equal((await store.readMessages()).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("two days without a visit is the walk nudge", () => {
  const now = Date.parse("2026-11-24T12:00:00.000Z");
  const visit = now - 49 * 3_600_000;
  assert.equal(
    shouldNudge({ nowMs: now, lastOwnerVisitMs: visit, lastNudgeMs: null, afterMs: 48 * 3_600_000, cooldownMs: 24 * 3_600_000 }),
    true,
  );
  assert.equal(nudgeText(49 * 3_600_000), "you haven't walked me in 2 days");
  assert.equal(
    shouldNudge({ nowMs: now, lastOwnerVisitMs: null, lastNudgeMs: null, afterMs: 48 * 3_600_000, cooldownMs: 24 * 3_600_000 }),
    false,
  );
});

test("the nudge is sent when the owner wakes him after two days", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gos-nudge-"));
  try {
    const store = new Store(dir);
    await store.init();
    const bootId = "boot-nudge";
    const now = new Date("2026-11-24T18:00:00.000Z");
    const visit = new Date(now.getTime() - 49 * 3_600_000);
    await store.writeMeta({
      ...(await store.readMeta()),
      lastActivityAt: visit.toISOString(),
      lastOwnerVisitAt: visit.toISOString(),
      lastBootId: bootId,
    });
    const sent: string[] = [];
    await handleTurn({
      store,
      now,
      owner: true,
      bootId,
      sleepGapMs: 60_000,
      growAfter: 6,
      nudgeAfterMs: 48 * 3_600_000,
      nudgeCooldownMs: 24 * 3_600_000,
      strangerCooldownMs: 1_800_000,
      source: "user",
      notify: async (_kind, text) => {
        sent.push(text);
        return "sent";
      },
    });
    assert.deepEqual(sent, ["you haven't walked me in 2 days"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
