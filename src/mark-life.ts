import path from "node:path";
import { projectRoot } from "./config.js";
import { loadEnvFile } from "./env.js";
import { Store } from "./store.js";

loadEnvFile(path.join(projectRoot(), ".env"));

const command = process.argv[2];
const reset = process.argv.includes("--reset");
const dataDir = process.env.DATA_DIR?.trim() || path.join(projectRoot(), "data");
const store = new Store(dataDir);
await store.init();
const now = new Date();

if (command === "puppy") {
  if (!reset) {
    console.error("Refusing to mark a puppy without --reset. That keeps old chats on the disk.");
    process.exit(1);
  }
  await store.resetPuppy(now);
  console.log("Life is a puppy. Messages, bones, and the guestbook are cleared.");
} else if (command === "grown") {
  await store.markGrown();
  console.log("Life is grown.");
} else if (command === "wound") {
  await store.markWound(now);
  console.log("Grown Gos remembers a restore.");
} else {
  console.error("Usage: node dist/mark-life.js <puppy --reset|grown|wound>");
  process.exit(1);
}
