import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { initializeRuntimeConfig, loadProjectEnvironment, parseEnvFile, resolveAgentRuntimeConfig } from "../dist/server/config.js";
import { isolatedProviderEnvironment } from "../dist/server/agents.js";

test("project env parser handles comments, exports, quotes, and process environment precedence", async () => {
  assert.deepEqual(parseEnvFile('A=plain\nB="two\\nlines"\nexport C=three # comment\nD=\'literal # text\'\n'), {
    A: "plain", B: "two\nlines", C: "three", D: "literal # text",
  });
  const root = await mkdtemp(join(tmpdir(), "agentdeck-env-"));
  try {
    await writeFile(join(root, ".env"), "A=file\nB=file\n");
    const env = { A: "process" };
    loadProjectEnvironment(root, env);
    assert.deepEqual(env, { A: "process", B: "file" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime initialization loads project .env and gives process values precedence", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentdeck-runtime-env-"));
  try {
    await writeFile(join(root, ".env"), "AGENTDECK_MODEL_PROVIDER=deepseek\nAGENTDECK_MODEL=deepseek-flash\nAGENTDECK_MODEL_EFFORT=high\nDEEPSEEK_API_KEY=fake-env-test-key\n");
    const env = { AGENTDECK_MODEL: "process-model" };
    const config = initializeRuntimeConfig(root, env);
    assert.equal(config.worker.provider, "deepseek");
    assert.equal(config.worker.model, "process-model");
    assert.equal(config.worker.effort, "high");
    assert.equal(config.worker.apiKey, "fake-env-test-key");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("default Codex role model settings preserve existing Luna/high roles and inherited orchestrator", () => {
  const config = resolveAgentRuntimeConfig({});
  assert.deepEqual(config.orchestrator, { provider: "codex" });
  assert.deepEqual(config.worker, { provider: "codex", model: "gpt-6-luna", effort: "high" });
  assert.deepEqual(config.verifier, config.worker);
});

test("DeepSeek global settings and role overrides resolve without API key leakage into model config", () => {
  const apiKey = "test-secret-key";
  const config = resolveAgentRuntimeConfig({
    AGENTDECK_MODEL_PROVIDER: "deepseek",
    AGENTDECK_MODEL_BASE_URL: "https://api.deepseek.com",
    AGENTDECK_MODEL: "deepseek-flash",
    AGENTDECK_MODEL_EFFORT: "high",
    DEEPSEEK_API_KEY: apiKey,
    AGENTDECK_WORKER_EFFORT: "low",
    AGENTDECK_VERIFIER_MODEL: "deepseek-v4-pro",
  });
  assert.deepEqual(config.orchestrator, { provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", effort: "high", apiKey });
  assert.equal(config.worker.model, "deepseek-flash");
  assert.equal(config.worker.effort, "low");
  assert.equal(config.verifier.model, "deepseek-v4-pro");
  assert.equal(config.verifier.effort, "high");
});

test("invalid and incomplete provider settings fail closed", () => {
  assert.throws(() => resolveAgentRuntimeConfig({ AGENTDECK_MODEL_PROVIDER: "unknown" }), /must be codex or deepseek/);
  assert.throws(() => resolveAgentRuntimeConfig({ AGENTDECK_MODEL_PROVIDER: "deepseek" }), /DEEPSEEK_API_KEY is missing/);
  assert.throws(() => resolveAgentRuntimeConfig({ AGENTDECK_MODEL_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "key", AGENTDECK_MODEL_EFFORT: "fast" }), /supported Codex reasoning effort/);
  assert.throws(() => resolveAgentRuntimeConfig({ AGENTDECK_MODEL_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "key", AGENTDECK_MODEL_BASE_URL: "http://example.com" }), /must use HTTPS/);
  assert.throws(() => resolveAgentRuntimeConfig({ AGENTDECK_MODEL_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "key", AGENTDECK_MODEL_BASE_URL: "https://user:key@example.com" }), /contain no credentials/);
  assert.doesNotThrow(() => resolveAgentRuntimeConfig({ AGENTDECK_MODEL_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "key", AGENTDECK_MODEL_BASE_URL: "http://127.0.0.1:4040" }));
});

test("DeepSeek CLI environment pins private CODEX_HOME and does not inherit the user's Codex home", () => {
  const environment = isolatedProviderEnvironment("fake-environment-only", "/private/runtime/codex-home", {
    CODEX_HOME: "/user/global/codex-home", HOME: "/user/home", PATH: "/bin",
  });
  assert.equal(environment.CODEX_HOME, "/private/runtime/codex-home");
  assert.equal(environment.HOME, "/user/home");
  assert.equal(environment.PATH, "/bin");
  assert.equal(environment.DEEPSEEK_API_KEY, "fake-environment-only");
});
