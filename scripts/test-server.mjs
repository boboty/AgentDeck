import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const dataDir = await mkdtemp(resolve(tmpdir(), "agentdeck-playwright-runtime-"));
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith("AGENTDECK_") || key === "DEEPSEEK_API_KEY") delete env[key];
Object.assign(env, {
  AGENTDECK_CONTAINER: "1",
  AGENTDECK_MODEL_PROVIDER: "codex",
  AGENTDECK_MODEL_BASE_URL: "",
  AGENTDECK_MODEL: "",
  AGENTDECK_MODEL_EFFORT: "",
  AGENTDECK_ORCHESTRATOR_MODEL: "",
  AGENTDECK_ORCHESTRATOR_EFFORT: "",
  AGENTDECK_WORKER_MODEL: "",
  AGENTDECK_WORKER_EFFORT: "",
  AGENTDECK_VERIFIER_MODEL: "",
  AGENTDECK_VERIFIER_EFFORT: "",
  DEEPSEEK_API_KEY: "",
  HOST: "127.0.0.1",
  PORT: "4392",
  AGENTDECK_APP_ROOT: process.cwd(),
  AGENTDECK_DATA_DIR: dataDir,
});
const child = spawn(process.execPath, ["dist/server/index.js"], { env, stdio: "inherit" });
let stopping = false;
async function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
  await new Promise((resolveWait) => child.once("exit", resolveWait));
  await rm(dataDir, { recursive: true, force: true });
}
process.once("SIGTERM", () => { void stop("SIGTERM").then(() => process.exit(0)); });
process.once("SIGINT", () => { void stop("SIGINT").then(() => process.exit(0)); });
child.once("exit", async (code, signal) => {
  if (!stopping) {
    stopping = true;
    await rm(dataDir, { recursive: true, force: true });
    process.exitCode = code ?? (signal ? 1 : 0);
  }
});
