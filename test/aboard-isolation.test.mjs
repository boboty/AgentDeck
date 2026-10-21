import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { IsolatedAboard, assertDevelopmentBoard } from "../dist/server/aboard.js";

const appRoot = process.cwd();

function runAboard(args, cwd) {
  return JSON.parse(execFileSync("aboard", args, { cwd, encoding: "utf8" }));
}

test("demo workspace uses a distinct aboard database and legal state/fact transitions", async () => {
  const before = assertDevelopmentBoard(appRoot);
  const base = await mkdtemp(join(tmpdir(), "agentdeck-isolated-board-"));
  const workspace = resolve(base, "workspace");
  try {
    const ticket = {
      id: "tkt_test_isolation",
      text: "Check a simulated order using read-only policy evidence.",
      createdAt: new Date(0).toISOString(),
      status: "in_progress",
      eventsFile: "events.jsonl",
    };
    const plan = {
      summary: "Read the policy source and record a reviewable result.",
      orderId: null,
      customer: null,
      queries: ["policies"],
      taskTitle: "Isolation lifecycle test",
      acceptanceCriteria: ["Use source-backed evidence", "Keep the original development board unchanged"],
    };
    const board = await IsolatedAboard.create(appRoot, workspace, ticket, plan, resolve(appRoot, "server", "fixtures", "tickets.json"));
    assert.notEqual(board.identity.project_id, before.project_id);
    assert.notEqual(board.identity.database_path, before.database_path);
    assert.equal(board.identity.project_root, realpathSync(workspace));

    const task = await board.createQueuedTask(ticket, plan);
    assert.equal(task.state, "IN_PROGRESS");
    await board.addFact(task.id, "verification", "A test-only business FAIL maps to the supported RC fact.", { sourceSnapshotHash: board.sourceSnapshotHash }, {
      verdict: "RC",
      baseline: board.sourceSnapshotHash,
      fingerprint: "a".repeat(64),
    });
    board.setTaskState(task.id, "BLOCKED", "The isolated test task needs review");

    const persisted = runAboard(["task", "get", task.id], workspace).task;
    const facts = runAboard(["fact", "list", task.id], workspace).facts;
    assert.equal(persisted.state, "BLOCKED");
    assert.ok(facts.some((fact) => fact.kind === "verification" && fact.verdict === "RC"));
    assert.equal(assertDevelopmentBoard(appRoot).project_id, before.project_id);
  } finally {
    try {
      execFileSync("aboard", ["clean", "--yes"], { cwd: workspace, stdio: "ignore" });
    } catch {
      // The identity may not have been initialized if setup failed early.
    }
    await rm(base, { recursive: true, force: true });
  }
});
