import path from "node:path";
import { randomUUID } from "node:crypto";
import { readConfig, projectRoot } from "./config.js";
import { loadEnvFile } from "./env.js";
import { createApp } from "./server.js";
import { Store } from "./store.js";

loadEnvFile(path.join(projectRoot(), ".env"));
const config = readConfig();
const store = new Store(config.dataDir);
await store.init();

const server = createApp({ config, store, bootId: randomUUID() });
server.listen(config.port, "0.0.0.0", () => {
  const mode = config.mockLlm ? "mock" : config.llmProvider;
  console.log(`Gos listening on 0.0.0.0:${config.port} (${mode})`);
});
