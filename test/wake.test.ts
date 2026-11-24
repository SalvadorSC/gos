import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectWake } from "../src/dog.js";
import { Store } from "../src/store.js";
import { handleTurn } from "../src/turn.js";

test("a long quiet gap is a wake", () => {
  const now = 1_000_000;
  const wake = detectWake({
    nowMs: now,
    lastActivityMs: now - 120_000,
    sleepGapMs: 60_000,
    processRestarted: false,
  });
  assert.deepEqual(wake, { woke: true, reason: "gap" });
});

test("a short gap stays asleep", () => {
  const now = 1_000_000;
  const wake = detectWake({
    nowMs: now,
    lastActivityMs: now - 10_000,
    sleepGapMs: 60_000,
    processRestarted: false,
  });
  assert.equal(wake.woke, false);
});

test("a gap equal to the threshold wakes", () => {
  const wake = detectWake({
    nowMs: 60_000,
    lastActivityMs: 0,
    sleepGapMs: 60_000,
    processRestarted: false,
  });
  assert.equal(wake.reason, "gap");
});

test("a process restart after a nap wakes", () => {
  const wake = detectWake({
    nowMs: 3_600_000,
    lastActivityMs: 0,
    sleepGapMs: 60_000,
    processRestarted: true,
  });
  assert.deepEqual(wake, { woke: true, reason: "restart" });
});

test("a restart a second after activity is a crash bounce, not a nap", () => {
  const wake = detectWake({
    nowMs: 5_000,
    lastActivityMs: 4_000,
    sleepGapMs: 60_000,
    processRestarted: true,
  });
  assert.equal(wake.woke, false);
});

test("the first visit wakes", () => {
  const wake = detectWake({
    nowMs: 10,
    lastActivityMs: null,
    sleepGapMs: 60_000,
    processRestarted: false,
  });
  assert.equal(wake.reason, "restart");
});

test("a wake after tea talk stores the dream", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gos-wake-"));
  try {
    const store = new Store(dir);
    await store.init();
    await store.markGrown();
    const bootId = "boot-1";
    const earlier = new Date("2026-11-24T12:00:00.000Z");
    await store.writeMessages([
      {
        role: "user",
        content: "I bought a teapot in Hefei and it smells like smoke.",
        at: earlier.toISOString(),
        from: "owner",
        kind: "chat",
      },
    ]);
    await store.writeMeta({
      ...(await store.readMeta()),
      lastActivityAt: earlier.toISOString(),
      lastOwnerVisitAt: earlier.toISOString(),
      lastBootId: bootId,
    });
    const now = new Date(earlier.getTime() + 2 * 60_000);
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
    });
    const messages = await store.readMessages();
    const dream = messages.find((message) => message.kind === "dream");
    assert.ok(dream);
    assert.match(dream.content, /teapot/);
    assert.match(dream.content, /Hefei/);
    assert.match(dream.content, /chasing/);
    const again = await handleTurn({
      store,
      now: new Date(now.getTime() + 1000),
      owner: true,
      bootId,
      sleepGapMs: 60_000,
      growAfter: 6,
      nudgeAfterMs: 48 * 3_600_000,
      nudgeCooldownMs: 24 * 3_600_000,
      strangerCooldownMs: 1_800_000,
      source: "user",
    });
    assert.equal(again.messages.filter((message) => message.content === dream.content).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
