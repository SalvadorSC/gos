import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const tsc = path.join("node_modules", "typescript", "bin", "tsc");

function newest(dir) {
  if (!existsSync(dir)) return 0;
  let max = 0;
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = statSync(file);
    max = Math.max(max, stat.isDirectory() ? newest(file) : stat.mtimeMs);
  }
  return max;
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(tsc)) {
  console.error("TypeScript is not installed. Run npm install, then npm start.");
  process.exit(1);
}

const serverOut = path.join("dist", "index.js");
const serverStale = !existsSync(serverOut) || newest("src") > statSync(serverOut).mtimeMs;
if (serverStale) run([tsc]);

const bundleOut = path.join("public", "bundle.js");
const clientNewest = Math.max(newest("client"), statSync(path.join("src", "carve.ts")).mtimeMs);
const bundleStale = !existsSync(bundleOut) || clientNewest > statSync(bundleOut).mtimeMs;
if (bundleStale) run([path.join("scripts", "bundle-client.mjs")]);
