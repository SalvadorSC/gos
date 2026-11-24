import assert from "node:assert/strict";
import test from "node:test";
import { faceMood, isNight, madridParts, mockReply } from "../src/dog.js";

test("02:30 Madrid in November is night", () => {
  const date = new Date("2026-11-24T01:30:00.000Z");
  assert.equal(madridParts(date).hour, 2);
  assert.equal(isNight(date), true);
});

test("03:00 Madrid in July is night", () => {
  const date = new Date("2026-07-15T01:00:00.000Z");
  assert.equal(madridParts(date).hour, 3);
  assert.equal(isNight(date), true);
});

test("07:00 Madrid is morning", () => {
  const date = new Date("2026-11-24T06:00:00.000Z");
  assert.equal(madridParts(date).hour, 7);
  assert.equal(isNight(date), false);
});

test("15:00 Madrid is day", () => {
  const date = new Date("2026-11-24T14:00:00.000Z");
  assert.equal(madridParts(date).hour, 15);
  assert.equal(isNight(date), false);
});

test("midnight Madrid is night", () => {
  const date = new Date("2026-11-23T23:00:00.000Z");
  assert.equal(madridParts(date).hour, 0);
  assert.equal(isNight(date), true);
});

test("night face is sleepy for a grown dog", () => {
  assert.equal(
    faceMood({ owner: true, puppy: false, night: true, dreaming: false, sulking: false, hurt: false }),
    "sleepy",
  );
});

test("mock night replies grumble in Catalan", () => {
  const reply = mockReply({ message: "hello", night: true, puppy: false, hurt: false, language: "en" });
  assert.match(reply, /És de matinada/);
  assert.equal(reply.includes("!"), false);
});
