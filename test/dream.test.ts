import assert from "node:assert/strict";
import test from "node:test";
import { buildDream } from "../src/dog.js";

test("a grown dream chases something he was told", () => {
  const dream = buildDream(["I bought a teapot in Hefei and it smells like smoke."], "grown");
  assert.equal(dream, "I dreamed I was chasing a teapot through Hefei.");
});

test("tea with no city still runs through Hefei", () => {
  const dream = buildDream(["this oolong is smoky"], "grown");
  assert.match(dream, /oolong/);
  assert.match(dream, /Hefei/);
});

test("a puppy dream does not use the old chats", () => {
  const dream = buildDream(["I bought a teapot in Hefei"], "puppy");
  assert.equal(dream.includes("Hefei"), false);
  assert.match(dream, /teapot I could not reach/);
});

test("no chats yet still produces a dream", () => {
  const dream = buildDream([], "grown");
  assert.match(dream, /dreamed/);
});
