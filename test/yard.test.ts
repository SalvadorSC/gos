import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { missingBones } from "../src/dog.js";
import { Store } from "../src/store.js";
import { handleTurn } from "../src/turn.js";

test("yard diff lists bones that disappeared", () => {
  assert.deepEqual(missingBones(["bone-a", "bone-b"], ["bone-b"]), ["bone-a"]);
  assert.deepEqual(missingBones(["bone-a"], ["bone-a", "bone-c"]), []);
});

test("deleting a bone file is noticed on the next visit", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gos-yard-"));
  try {
    const store = new Store(dir);
    await store.init();
    const bootId = "boot-yard";
    const start = new Date("2026-11-24T15:00:00.000Z");
    await handleTurn({
      store,
      now: start,
      owner: true,
      bootId,
      sleepGapMs: 60_000,
      growAfter: 6,
      nudgeAfterMs: 48 * 3_600_000,
      nudgeCooldownMs: 24 * 3_600_000,
      strangerCooldownMs: 1_800_000,
      source: "user",
    });
    const bone = await store.buryBone("sheng from Hefei, smoky", start);
    assert.equal((await store.listBones()).length, 1);
    assert.equal(await store.deleteBone(bone.id), true);
    assert.equal((await store.listBones()).length, 0);
    const state = await handleTurn({
      store,
      now: new Date(start.getTime() + 1000),
      owner: true,
      bootId,
      sleepGapMs: 60_000,
      growAfter: 6,
      nudgeAfterMs: 48 * 3_600_000,
      nudgeCooldownMs: 24 * 3_600_000,
      strangerCooldownMs: 1_800_000,
      source: "user",
    });
    assert.equal(state.mood, "sulking");
    const sulk = state.messages.find((message) => message.content.includes("sheng from Hefei"));
    assert.ok(sulk);
    assert.match(sulk.content, /sulking/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
