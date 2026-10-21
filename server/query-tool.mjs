#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const query = process.argv[2];
const allowed = new Set(["orders", "history", "policies", "conflictCases"]);
if (!allowed.has(query)) {
  process.stderr.write("Unsupported read-only business query.\n");
  process.exitCode = 2;
} else {
  try {
    const snapshot = JSON.parse(await readFile(resolve("source", "snapshot.json"), "utf8"));
    process.stdout.write(`${JSON.stringify({ query, snapshotHash: JSON.parse(await readFile(resolve("source", "ticket.json"), "utf8")).snapshot_hash, records: snapshot[query] })}\n`);
  } catch {
    process.stderr.write("Source snapshot unavailable.\n");
    process.exitCode = 1;
  }
}
