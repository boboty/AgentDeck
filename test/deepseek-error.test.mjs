import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

test("an upstream DeepSeek HTTP error that echoes the key is not returned or persisted", async () => {
  const apiKey = "fake-error-test-only-never-a-real-secret";
  const dataDirectory = await mkdtemp(join(tmpdir(), "agentdeck-deepseek-error-"));
  const upstream = createServer(async (request, response) => {
    request.resume();
    await new Promise((resolveEnd) => request.once("end", resolveEnd));
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: `Rejected credential ${apiKey}` } }));
  });
  await new Promise((resolveListen) => upstream.listen(0, "127.0.0.1", resolveListen));
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress === "object");

  const appPort = await new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.once("error", rejectPort);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") return rejectPort(new Error("Could not allocate test port"));
      void new Promise((resolveClose) => probe.close(resolveClose)).then(() => resolvePort(address.port));
    });
  });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("AGENTDECK_") || key === "DEEPSEEK_API_KEY") delete env[key];
  Object.assign(env, {
    HOST: "127.0.0.1", PORT: String(appPort), AGENTDECK_APP_ROOT: process.cwd(), AGENTDECK_DATA_DIR: dataDirectory,
    AGENTDECK_MODEL_PROVIDER: "deepseek", AGENTDECK_MODEL_BASE_URL: `http://127.0.0.1:${upstreamAddress.port}`,
    AGENTDECK_MODEL: "deepseek-flash", AGENTDECK_MODEL_EFFORT: "high", DEEPSEEK_API_KEY: apiKey,
    AGENTDECK_ORCHESTRATOR_MODEL: "deepseek-flash", AGENTDECK_ORCHESTRATOR_EFFORT: "high",
    AGENTDECK_WORKER_MODEL: "deepseek-flash", AGENTDECK_WORKER_EFFORT: "high",
    AGENTDECK_VERIFIER_MODEL: "deepseek-flash", AGENTDECK_VERIFIER_EFFORT: "high",
    AGENTDECK_CONTAINER: "1",
  });
  const child = spawn(process.execPath, [resolve("dist/server/index.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  const base = `http://127.0.0.1:${appPort}`;
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Test server exited early: ${logs}`);
      try {
        const response = await fetch(`${base}/api/v1/health`);
        if (response.ok) { healthy = true; break; }
      } catch { /* server is still starting */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    assert.ok(healthy, "test server should start");
    const createResponse = await fetch(`${base}/api/v1/tickets`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "A synthetic ticket to check an upstream provider failure." }),
    });
    assert.equal(createResponse.status, 201);
    const ticket = await createResponse.json();
    const runResponse = await fetch(`${base}/api/v1/tickets/${ticket.id}/run`, { method: "POST" });
    assert.equal(runResponse.status, 202);

    let finalTicket;
    for (let attempt = 0; attempt < 200; attempt++) {
      const response = await fetch(`${base}/api/v1/tickets/${ticket.id}`);
      finalTicket = await response.json();
      if (finalTicket.status === "failed") break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    assert.equal(finalTicket?.status, "failed");
    const eventsResponse = await fetch(`${base}/api/v1/tickets/${ticket.id}/events`);
    const events = await eventsResponse.json();
    const replayResponse = await fetch(`${base}/api/v1/tickets/${ticket.id}/replay`);
    const replay = await replayResponse.json();
    const runFiles = await readdir(join(dataDirectory, "tickets", ticket.id), { recursive: true });
    const fileContents = await Promise.all(runFiles.filter((name) => typeof name === "string").map(async (name) => {
      try { return await readFile(join(dataDirectory, "tickets", ticket.id, name), "utf8"); }
      catch { return ""; }
    }));

    assert.ok(!JSON.stringify(finalTicket).includes(apiKey));
    assert.ok(!JSON.stringify(events).includes(apiKey));
    assert.ok(!JSON.stringify(replay).includes(apiKey));
    assert.ok(!fileContents.join("\n").includes(apiKey));
    assert.ok(!logs.includes(apiKey));
    assert.ok(events.some((event) => event.type === "ticket.failed"));
    assert.ok(!JSON.stringify(replay.rawEventFiles).includes(apiKey));
    const failedAttempt = events.find((event) => event.type === "agent.failed" && event.role === "orchestrator");
    assert.ok(failedAttempt, "the failed provider attempt should be recorded");
    assert.deepEqual(
      { provider: failedAttempt.data.provider, model: failedAttempt.data.model, reasoningEffort: failedAttempt.data.reasoningEffort },
      { provider: "deepseek", model: "deepseek-flash", reasoningEffort: "high" },
    );
    assert.ok(!JSON.stringify(failedAttempt).includes(apiKey));
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolveClose) => child.once("exit", resolveClose));
    await new Promise((resolveClose) => upstream.close(resolveClose));
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
