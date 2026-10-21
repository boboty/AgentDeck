import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendRawEvent, summarizeToolEvent } from "../dist/src/runtime/event-journal.js";

test("raw SDK events are appended as independent JSONL records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agentdeck-event-journal-"));
  const path = join(directory, "run", "events.jsonl");
  const first = { type: "thread.started", thread_id: "thread-one" };
  const second = { type: "turn.started" };

  try {
    await appendRawEvent(path, first);
    await appendRawEvent(path, second);
    assert.deepEqual((await readFile(path, "utf8")).trim().split("\n").map(JSON.parse), [first, second]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("tool summaries include command events without rewriting their source record", () => {
  const event = {
    type: "item.completed",
    item: { type: "command_execution", command: "cat evidence.txt", status: "completed", exit_code: 0 },
  };

  assert.deepEqual(summarizeToolEvent(event), {
    eventType: "item.completed",
    itemType: "command_execution",
    name: "cat evidence.txt",
    status: "completed",
  });
  assert.equal(summarizeToolEvent({ type: "turn.started" }), undefined);
});
