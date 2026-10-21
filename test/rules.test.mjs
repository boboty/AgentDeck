import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { authoritativeSourceIds, deriveDeterministicFacts, hashSnapshotBytes, validateQueryResults, validateRecommendation } from "../dist/server/rules.js";

const fixtureBytes = await readFile(new URL("../server/fixtures/tickets.json", import.meta.url));
const snapshot = JSON.parse(fixtureBytes.toString("utf8"));
const snapshotHash = hashSnapshotBytes(fixtureBytes);

test("query output must be byte-snapshot bound and exact, not trust a repeated hash field", () => {
  const queries = ["orders", "policies"];
  const valid = queries.map((query) => ({ query, snapshotHash, records: snapshot[query] }));
  assert.equal(validateQueryResults(snapshot, snapshotHash, queries, valid), true);
  const altered = structuredClone(valid);
  altered[0].records[0].status = "altered by tool";
  assert.equal(validateQueryResults(snapshot, snapshotHash, queries, altered), false);
  assert.equal(validateQueryResults(snapshot, snapshotHash, ["orders", "orders"], valid), false);
});

test("date arithmetic is deterministic and an unqueried history remains unknown", () => {
  const ticket = { id: "tkt_test", text: "询问订单配送", createdAt: "2026-10-21T19:00:00.000Z", status: "in_progress", eventsFile: "" };
  const plan = { orderId: "OD-24081", customer: "林女士", queries: ["orders", "policies"], summary: "", taskTitle: "", acceptanceCriteria: [] };
  const facts = deriveDeterministicFacts(ticket, plan, snapshot, snapshotHash);
  assert.equal(facts.daysSinceDelivery, 2);
  assert.equal(facts.returnEligible, true);
  assert.equal(facts.historyQueried, false);
  assert.equal(facts.matchingHistoryCases, null);
  const historyPlan = { ...plan, queries: ["orders", "history", "policies"] };
  const verifiedEmptyHistorySnapshot = { ...snapshot, history: [] };
  const emptyFacts = deriveDeterministicFacts(ticket, historyPlan, verifiedEmptyHistorySnapshot, snapshotHash);
  assert.equal(emptyFacts.historyQueried, true);
  assert.deepEqual(emptyFacts.matchingHistoryCases, []);
});

test("recommendation citations are restricted to records actually queried and cannot promise a completed refund", () => {
  const sourceIds = authoritativeSourceIds(["orders", "policies"], snapshot);
  const safe = { summary: "Deadline is recorded.", customerSafeText: "Please apply by the recorded date.", disposition: "information", citations: [{ sourceId: "OD-24081", reason: "order" }], openQuestions: [] };
  assert.equal(validateRecommendation(safe, sourceIds), true);
  assert.equal(validateRecommendation({ ...safe, citations: [{ sourceId: "CS-19031", reason: "unqueried history" }] }, sourceIds), false);
  assert.equal(validateRecommendation({ ...safe, customerSafeText: "已为您退款" }, sourceIds), false);
});
