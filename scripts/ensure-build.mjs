import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const out = path.join("dist", "index.js");
const tsc = path.join("node_modules", "typescript", "bin", "tsc");

function newest(dir) {
  let max = 0;
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = statSync(file);
    max = Math.max(max, stat.isDirectory() ? newest(file) : stat.mtimeMs);
  }
  return max;
}

if (!existsSync(tsc)) {
  console.error("TypeScript is not installed. Run npm install, then npm start.");
  process.exit(1);
}

const stale = !existsSync(out) || newest("src") > statSync(out).mtimeMs;
if (!stale) process.exit(0);

const result = spawnSync(process.execPath, [tsc], { stdio: "inherit" });
process.exit(result.status ?? 1);
