import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Codex, type ThreadEvent } from "@openai/codex-sdk";
import { appendRawEvent, summarizeToolEvent } from "../src/runtime/event-journal.js";

const root = resolve(".agentdeck-data/sdk-probe");
const evidenceDirectory = resolve("artifacts/sdk-probe");
const roles = ["worker", "verifier"] as const;

async function runRole(role: (typeof roles)[number]) {
  const workingDirectory = resolve(root, role);
  const eventPath = resolve(evidenceDirectory, `${role}.jsonl`);
  await mkdir(workingDirectory, { recursive: true });
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(resolve(workingDirectory, "probe-input.txt"), `isolated-context:${role}\n`, { mode: 0o600 });

  const codex = new Codex();
  const thread = codex.startThread({
    model: "gpt-6-luna",
    modelReasoningEffort: "high",
    workingDirectory,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    skipGitRepoCheck: true,
  });
  const toolSummaries: ReturnType<typeof summarizeToolEvent>[] = [];
  const events: ThreadEvent[] = [];
  const { events: stream } = await thread.runStreamed(
    `Read the file ./probe-input.txt using your shell tool. Then return exactly a JSON object with role "${role}" and the exact file content in field "observed". Do not invent the file content.`,
  );

  for await (const event of stream) {
    events.push(event);
    await appendRawEvent(eventPath, event);
    const summary = summarizeToolEvent(event);
    if (summary) toolSummaries.push(summary);
  }

  const final = events.findLast((event) => event.type === "item.completed" && event.item.type === "agent_message");
  const finalText = final?.type === "item.completed" && final.item.type === "agent_message" ? final.item.text : "";
  const rawJournal = await readFile(eventPath, "utf8");
  return {
    role,
    model: "gpt-6-luna",
    reasoningEffort: "high",
    threadId: thread.id,
    workingDirectory: `.agentdeck-data/sdk-probe/${role}`,
    finalText,
    toolSummaries,
    rawEventFile: `artifacts/sdk-probe/${role}.jsonl`,
    rawEventCount: rawJournal.trim().split("\n").length,
  };
}

const results = await Promise.all(roles.map(runRole));
const summaryPath = resolve(evidenceDirectory, "summary.json");
await writeFile(summaryPath, `${JSON.stringify({ sdk: "@openai/codex-sdk", sdkVersion: "0.163.0", cliVersion: "0.163.0", results }, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ summaryPath: "artifacts/sdk-probe/summary.json", results }, null, 2));
