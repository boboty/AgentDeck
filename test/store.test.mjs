import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { RuntimeStore } from "../dist/server/store.js";

test("event replay reads persisted JSONL without adding records or changing ticket state", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "agentdeck-store-test-"));
  try {
    const store = new RuntimeStore(root);
    const ticket = await store.createTicket("请查询订单配送进度", "ordinary");
    await store.appendEvent(ticket, "ticket.queued", "system", { source: "test" });
    const before = await readFile(resolve(root, ticket.eventsFile), "utf8");
    const stateBefore = await store.getTicket(ticket.id);
    const replayOne = await store.readEvents(ticket);
    const replayTwo = await store.readEvents(ticket, 1);
    const after = await readFile(resolve(root, ticket.eventsFile), "utf8");
    const stateAfter = await store.getTicket(ticket.id);
    assert.equal(after, before);
    assert.equal(replayOne.length, 2);
    assert.equal(replayTwo.length, 1);
    assert.equal(stateAfter?.status, stateBefore?.status);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
