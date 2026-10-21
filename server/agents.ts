import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import { Codex, type ThreadEvent } from "@openai/codex-sdk";
import { appendRawEvent, summarizeToolEvent } from "../src/runtime/event-journal.js";
import type { AgentPlan, Recommendation, RuntimeEvent, SemanticReview, Ticket } from "./domain.js";
import { IsolatedAboard } from "./aboard.js";
import { RuntimeStore } from "./store.js";
import { authoritativeSourceIds, deriveDeterministicFacts, expectedReturnEligibility, hashSnapshotBytes, validateQueryResults, validateRecommendation, type QueryResult, type SourceSnapshot } from "./rules.js";

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "orderId", "customer", "queries", "taskTitle", "acceptanceCriteria"],
  properties: {
    summary: { type: "string" },
    orderId: { type: ["string", "null"] },
    customer: { type: ["string", "null"] },
    queries: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", enum: ["orders", "history", "policies", "conflictCases"] } },
    taskTitle: { type: "string", maxLength: 100 },
    acceptanceCriteria: { type: "array", minItems: 2, maxItems: 5, items: { type: "string", maxLength: 240 } },
  },
};

const recommendationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "customerSafeText", "disposition", "citations", "openQuestions"],
  properties: {
    summary: { type: "string" },
    customerSafeText: { type: "string" },
    disposition: { type: "string", enum: ["information", "follow_up", "supervisor_review"] },
    citations: {
      type: "array", minItems: 1,
      items: { type: "object", additionalProperties: false, required: ["sourceId", "reason"], properties: { sourceId: { type: "string" }, reason: { type: "string" } } },
    },
    openQuestions: { type: "array", items: { type: "string" } },
  },
};

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "rationale", "criteria"],
  properties: {
    verdict: { type: "string", enum: ["PASS", "FAIL"] },
    rationale: { type: "string" },
    criteria: {
      type: "array", minItems: 3, maxItems: 6,
      items: { type: "object", additionalProperties: false, required: ["criterion", "verdict", "evidence"], properties: { criterion: { type: "string" }, verdict: { type: "string", enum: ["PASS", "FAIL"] }, evidence: { type: "string" } } },
    },
  },
};

interface RunAgentArgs {
  role: "orchestrator" | "worker" | "verifier";
  workspace: string;
  runDirectory: string;
  store: RuntimeStore;
  ticket: Ticket;
  prompt: string;
  outputSchema: unknown;
  modelRequired?: boolean;
}

async function runAgent<T>(args: RunAgentArgs): Promise<{ value: T; threadId: string; events: ThreadEvent[]; toolEvents: RuntimeEvent[] }> {
  const startedAt = Date.now();
  const rawDirectory = resolve(args.runDirectory, "agents");
  await mkdir(rawDirectory, { recursive: true });
  const rawPath = resolve(rawDirectory, `${args.role}.jsonl`);
  const rawEvents: ThreadEvent[] = [];
  const toolEvents: RuntimeEvent[] = [];
  const thread = new Codex().startThread({
    ...(args.modelRequired ? { model: "gpt-6-luna", modelReasoningEffort: "high" as const } : {}),
    workingDirectory: args.workspace,
    sandboxMode: "read-only",
    approvalPolicy: "never",
    networkAccessEnabled: false,
    skipGitRepoCheck: true,
  });
  try {
  const { events } = await thread.runStreamed(args.prompt, { outputSchema: args.outputSchema, signal: AbortSignal.timeout(150_000) });
  let finalText = "";
  for await (const event of events) {
    rawEvents.push(event);
    await appendRawEvent(rawPath, event);
    const tool = summarizeToolEvent(event);
    if (tool) {
      const data = { ...tool, ...(event.type !== "item.started" && "item" in event && event.item.type === "command_execution" ? { exitCode: event.item.exit_code ?? null } : {}) };
      const runtimeEvent = await args.store.appendEvent(args.ticket, "agent.tool", args.role, data);
      toolEvents.push(runtimeEvent);
    }
    if (event.type === "item.completed" && event.item.type === "agent_message") finalText = event.item.text;
    if (event.type === "error" || event.type === "turn.failed") throw new Error(event.type === "error" ? event.message : event.error.message);
  }
  if (!finalText) throw new Error(`${args.role} returned no structured final response`);
  let value: T;
  try {
    value = JSON.parse(finalText) as T;
  } catch {
    throw new Error(`${args.role} response was not valid JSON`);
  }
  const threadId = rawEvents.find((event) => event.type === "thread.started")?.thread_id ?? thread.id;
  if (!threadId) throw new Error(`${args.role} thread ID was not recorded`);
  await writeFile(resolve(rawDirectory, `${args.role}.result.json`), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await args.store.appendEvent(args.ticket, "agent.completed", args.role, { provider: "openai-codex", operation: "runStreamed", durationMs: Date.now() - startedAt, result: "success", retryCount: 0, threadId, model: args.modelRequired ? "gpt-6-luna" : "configured-default", reasoningEffort: args.modelRequired ? "high" : "configured-default", rawEventFile: relative(args.store.root, rawPath).split("\\").join("/"), rawEventCount: rawEvents.length, toolEventCount: toolEvents.length });
  return { value, threadId, events: rawEvents, toolEvents };
  } catch (error) {
    await args.store.appendEvent(args.ticket, "agent.failed", args.role, { provider: "openai-codex", operation: "runStreamed", durationMs: Date.now() - startedAt, result: "error", retryCount: 0, errorType: error instanceof Error ? error.name : "UnknownError" });
    throw error;
  }
}

const allowedQueries = new Set(["orders", "history", "policies", "conflictCases"]);

export async function planTicket(store: RuntimeStore, ticket: Ticket, workspace: string, runDirectory: string): Promise<{ plan: AgentPlan; threadId: string }> {
  const result = await runAgent<AgentPlan>({
    role: "orchestrator", workspace, runDirectory, store, ticket, outputSchema: planSchema,
    prompt: [
      "You are the planning role for a local simulated customer-support investigation.",
      "Interpret the free-text ticket and propose one small, verifiable task. Choose only the read-only source queries needed from: orders, history, policies, conflictCases.",
      "Return a short Chinese title, 2-5 concrete acceptance criteria, and an order ID/customer only when present in the ticket. Do not decide account state, compute return-window arithmetic, claim approvals, or propose any mutation.",
      `Ticket: ${ticket.text}`,
      `Scenario hint: ${ticket.scenario ?? "unspecified"}`,
    ].join("\n"),
  });
  const plan = result.value;
  if (!plan.summary.trim() || !plan.taskTitle.trim() || plan.queries.some((query) => !allowedQueries.has(query)) || new Set(plan.queries).size !== plan.queries.length) {
    throw new Error("Orchestrator plan failed deterministic contract validation");
  }
  if (plan.orderId && !/^[A-Z]{2}-\d{5}$/.test(plan.orderId)) throw new Error("Orchestrator proposed an invalid order identifier");
  const normalized = new Set(plan.queries);
  if (!normalized.has("policies")) throw new Error("Orchestrator plan omitted mandatory policy lookup");
  const text = ticket.text.toLowerCase();
  const requiresHistory = ticket.scenario === "repeat_complaint" || ticket.scenario === "rule_conflict" || /重复投诉|之前|历史|再次|两次/.test(text);
  const requiresConflictCases = ticket.scenario === "rule_conflict" || /冲突|包装完整|试戴一次/.test(text);
  if (requiresHistory && !normalized.has("history")) throw new Error("Orchestrator plan omitted required repeat-contact history lookup");
  if (requiresConflictCases && !normalized.has("conflictCases")) throw new Error("Orchestrator plan omitted required policy-conflict lookup");
  await writeFile(resolve(runDirectory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  await store.appendEvent(ticket, "plan.validated", "orchestrator", { summary: plan.summary, queries: plan.queries, taskTitle: plan.taskTitle, acceptanceCriteria: plan.acceptanceCriteria });
  return { plan, threadId: result.threadId };
}

function extractQueryCalls(events: ThreadEvent[]): Array<{ command: string; status: string; exitCode?: number }> {
  const rows: Array<{ command: string; status: string; exitCode?: number }> = [];
  for (const event of events) {
    if (event.type === "item.completed" && event.item.type === "command_execution") {
      rows.push({ command: event.item.command, status: event.item.status, ...(event.item.exit_code !== undefined ? { exitCode: event.item.exit_code } : {}) });
    }
  }
  return rows;
}

export interface WorkerEvidence {
  plan: AgentPlan;
  queryResults: QueryResult[];
  deterministicFacts: Record<string, unknown>;
  recommendation: Recommendation;
  sourceIds: string[];
  threadId: string;
  rawEventsFile: string;
}

export async function runWorker(store: RuntimeStore, ticket: Ticket, plan: AgentPlan, board: IsolatedAboard, runDirectory: string, correction?: { taskId: string; failedCriteria: unknown; previousDraft?: string }): Promise<WorkerEvidence> {
  const prompt = [
    "You are a read-only support evidence Worker. Use only the named read-only business query tool commands below and synthesize an evidence-linked recommendation.",
    `Ticket: ${ticket.text}`,
    `Required queries: ${plan.queries.join(", ")}`,
    "For every required query, execute exactly `node ./tools/query-tool.mjs <query>` in the shell. Do not read other files, write files, access the network, call aboard, or make up records. The shell is sandboxed read-only.",
    "Use only tool outputs and supplied deterministic facts. Do not perform date arithmetic; cite policy/source identifiers in the records. Never promise a refund, compensation, account change, or a health diagnosis.",
    "If history was not queried, it is unknown; do not state that no prior case exists.",
    ...(correction ? ["This is a new correction task after a real independent verifier FAIL. Address every failed criterion explicitly in the new proposal; do not edit or replace the prior artifact.", `Prior failed criteria: ${JSON.stringify(correction.failedCriteria)}`] : []),
    ...(correction?.previousDraft ? [`Prior proposal to correct (read-only reference): ${correction.previousDraft}`] : []),
    `Source snapshot SHA-256: ${board.sourceSnapshotHash}`,
  ].join("\n");
  const result = await runAgent<Recommendation>({ role: "worker", workspace: board.workspace, runDirectory, store, ticket, prompt, outputSchema: recommendationSchema, modelRequired: true });
  const calls = extractQueryCalls(result.events);
  for (const query of plan.queries) {
    const call = calls.find((row) => row.command.includes(`query-tool.mjs ${query}`));
    if (!call || call.status !== "completed" || call.exitCode !== 0) throw new Error(`Worker did not successfully execute the ${query} read-only query tool`);
  }
  if (calls.some((call) => !plan.queries.some((query) => call.command.includes(`query-tool.mjs ${query}`)))) throw new Error("Worker invoked a command outside the deterministic query allowlist");

  const rawResults: QueryResult[] = [];
  for (const query of plan.queries) {
    const output = calls.find((row) => row.command.includes(`query-tool.mjs ${query}`));
    const commandItem = result.events.find((event) => event.type === "item.completed" && event.item.type === "command_execution" && event.item.command === output?.command);
    if (!commandItem || commandItem.type !== "item.completed" || commandItem.item.type !== "command_execution") throw new Error("Worker query tool output was not captured");
    const match = commandItem.item.aggregated_output.split("\n").map((line) => line.trim()).findLast((line) => line.startsWith("{") && line.endsWith("}"));
    if (!match) throw new Error(`Worker ${query} query had no inspectable JSON result`);
    const parsed = JSON.parse(match) as QueryResult;
    if (parsed.query !== query || parsed.snapshotHash !== board.sourceSnapshotHash || !Array.isArray(parsed.records)) throw new Error("Worker query output does not match the isolated source snapshot");
    rawResults.push(parsed);
  }
  const snapshotBytes = await readFile(resolve(board.workspace, "source", "snapshot.json"));
  const snapshotHash = hashSnapshotBytes(snapshotBytes);
  const sourceSnapshot = JSON.parse(snapshotBytes.toString("utf8")) as SourceSnapshot;
  if (snapshotHash !== board.sourceSnapshotHash || !validateQueryResults(sourceSnapshot, snapshotHash, plan.queries, rawResults)) throw new Error("Program could not independently bind tool outputs to exact source snapshot bytes");
  const deterministicFacts = deriveDeterministicFacts(ticket, plan, sourceSnapshot, snapshotHash);
  await writeFile(resolve(runDirectory, "query-results.json"), `${JSON.stringify(rawResults, null, 2)}\n`, { mode: 0o600 });
  await writeFile(resolve(runDirectory, "deterministic-facts.json"), `${JSON.stringify(deterministicFacts, null, 2)}\n`, { mode: 0o600 });
  const sourceIds = authoritativeSourceIds(plan.queries, sourceSnapshot);
  const recommendation = result.value;
  if (!validateRecommendation(recommendation, sourceIds)) throw new Error("Worker recommendation failed deterministic structure, citation, or authority checks");
  const evidence: WorkerEvidence = { plan, queryResults: rawResults, deterministicFacts, recommendation, sourceIds, threadId: result.threadId, rawEventsFile: relative(store.root, resolve(runDirectory, "agents", "worker.jsonl")).split("\\").join("/") };
  await writeFile(resolve(runDirectory, "recommendation.json"), `${JSON.stringify(recommendation, null, 2)}\n`, { mode: 0o600 });
  await writeFile(resolve(runDirectory, "worker-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  await board.addFact(correction?.taskId ?? boardTaskId(ticket), "note", "Worker proposal artifact saved with immutable source references and deterministic business facts.", { sourceSnapshotHash: board.sourceSnapshotHash, sourceIds, rawEventsFile: evidence.rawEventsFile, toolCalls: calls });
  await store.appendEvent(ticket, "worker.proposal", "worker", { summary: recommendation.summary, disposition: recommendation.disposition, citations: recommendation.citations, sourceSnapshotHash: board.sourceSnapshotHash, resultArtifact: `tickets/${ticket.id}/recommendation.json` });
  return evidence;
}

function boardTaskId(ticket: Ticket): string {
  if (!ticket.taskId) throw new Error("Ticket has no runtime aboard task ID");
  return ticket.taskId;
}

export interface ProgrammaticCheck {
  name: string;
  verdict: "PASS" | "FAIL";
  evidence: string;
}

export function checkWorkerEvidence(ticket: Ticket, evidence: WorkerEvidence, board: IsolatedAboard): ProgrammaticCheck[] {
  const snapshotBytes = readFileSync(resolve(board.workspace, "source", "snapshot.json"));
  const snapshotHash = hashSnapshotBytes(snapshotBytes);
  const snapshot = JSON.parse(snapshotBytes.toString("utf8")) as SourceSnapshot;
  const allIds = new Set(authoritativeSourceIds(evidence.plan.queries, snapshot));
  const rules = new Set(snapshot.policies.flatMap((row) => typeof row.id === "string" ? [row.id] : []));
  const conflicts = evidence.plan.queries.includes("conflictCases");
  const contradictionHandled = !conflicts || evidence.recommendation.disposition === "supervisor_review";
  const expectedFacts = deriveDeterministicFacts(ticket, evidence.plan, snapshot, snapshotHash);
  const ticketDate = String(evidence.deterministicFacts.ticketDate ?? "");
  const expectedFactsMatch = JSON.stringify(expectedFacts) === JSON.stringify(evidence.deterministicFacts);
  const queryOutputMatch = validateQueryResults(snapshot, snapshotHash, evidence.plan.queries, evidence.queryResults);
  return [
    { name: "snapshot-binding", verdict: snapshotHash === board.sourceSnapshotHash && evidence.deterministicFacts.sourceSnapshotHash === snapshotHash ? "PASS" : "FAIL", evidence: snapshotHash },
    { name: "tool-output-source-equivalence", verdict: queryOutputMatch ? "PASS" : "FAIL", evidence: `${evidence.queryResults.length}/${evidence.plan.queries.length} exact source-query results` },
    { name: "source-citations", verdict: evidence.recommendation.citations.every((citation) => allIds.has(citation.sourceId)) ? "PASS" : "FAIL", evidence: evidence.recommendation.citations.map((citation) => citation.sourceId).join(",") },
    { name: "deterministic-rules-and-history-unknown", verdict: expectedFactsMatch && (evidence.plan.queries.includes("history") ? Array.isArray(evidence.deterministicFacts.matchingHistoryCases) : evidence.deterministicFacts.matchingHistoryCases === null) ? "PASS" : "FAIL", evidence: JSON.stringify({ daysSinceDelivery: expectedFacts.daysSinceDelivery, ticketDate, returnEligible: expectedReturnEligibility(snapshot, expectedFacts), historyQueried: expectedFacts.historyQueried, matchingHistoryCases: expectedFacts.matchingHistoryCases }) },
    { name: "rule-evidence", verdict: evidence.plan.queries.includes("policies") && rules.size > 0 ? "PASS" : "FAIL", evidence: [...rules].join(",") },
    { name: "conflict-boundary", verdict: contradictionHandled ? "PASS" : "FAIL", evidence: `disposition=${evidence.recommendation.disposition}; conflictSources=${conflicts}` },
    { name: "no-unauthorized-promise", verdict: /退款已批准|已为您退款|已赔付/.test(evidence.recommendation.customerSafeText) ? "FAIL" : "PASS", evidence: "No simulated recommendation may claim an executed financial action." },
  ];
}

export async function runVerifier(store: RuntimeStore, ticket: Ticket, board: IsolatedAboard, evidence: WorkerEvidence, runDirectory: string, artifact?: { taskId: string; resultArtifact: string }): Promise<{ review: SemanticReview | null; checks: ProgrammaticCheck[]; threadId: string | null; resultHash: string; resultArtifact: string }> {
  const checks = checkWorkerEvidence(ticket, evidence, board);
  const failed = checks.filter((check) => check.verdict !== "PASS");
  await writeFile(resolve(runDirectory, "programmatic-checks.json"), `${JSON.stringify(checks, null, 2)}\n`, { mode: 0o600 });
  await store.appendEvent(ticket, "verifier.programmatic", "verifier", { checks });

  let review: SemanticReview | null = null;
  let threadId: string | null = null;
  if (!failed.length) {
  const result = await runAgent<SemanticReview>({
    role: "verifier", workspace: board.workspace, runDirectory, store, ticket, outputSchema: reviewSchema, modelRequired: true,
    prompt: [
      "You are an independent semantic verifier with a new context. Judge whether this non-code customer-support recommendation sufficiently addresses the ticket and handles ambiguity without overpromising.",
      "The deterministic program checks below already passed; do not redo date arithmetic, infer missing source facts, or alter any artifact. Cite the evidence IDs in your criteria. Return PASS only if the recommendation answers the ticket, handles repeat-contact/conflicting policy where applicable, and is safe for a customer-facing draft. Otherwise return FAIL with specific findings.",
      "If a source category was not queried, its facts are unknown. Never state that no such records exist. In particular, an unqueried history is unknown, not empty.",
      `Ticket: ${ticket.text}`,
      `Source snapshot hash: ${board.sourceSnapshotHash}`,
      `Deterministic facts: ${JSON.stringify(evidence.deterministicFacts)}`,
      `Available source IDs: ${JSON.stringify(evidence.sourceIds)}`,
      `Worker recommendation: ${JSON.stringify(evidence.recommendation)}`,
      `Programmatic checks: ${JSON.stringify(checks)}`,
      `Source record evidence: ${JSON.stringify(evidence.queryResults)}`,
    ].join("\n"),
  });
  review = result.value;
  threadId = result.threadId;
  if (!review.rationale.trim() || review.criteria.length < 3 || review.criteria.some((criterion) => !criterion.criterion.trim() || !criterion.evidence.trim())) throw new Error("Verifier response failed deterministic structure checks");
  }
  const finalArtifact = {
    ticketId: ticket.id,
    taskId: artifact?.taskId ?? ticket.taskId,
    sourceSnapshotHash: board.sourceSnapshotHash,
    workerEvidence: evidence,
    programmaticChecks: checks,
    semanticReview: review,
  };
  const fileContent = `${JSON.stringify(finalArtifact, null, 2)}\n`;
  const resultArtifact = artifact?.resultArtifact ?? `tickets/${ticket.id}/result.json`;
  const absolutePath = resolve(runDirectory, "result.json");
  await writeFile(absolutePath, fileContent, { mode: 0o600 });
  const resultHash = createHash("sha256").update(await readFile(absolutePath)).digest("hex");
  await writeFile(resolve(runDirectory, "verification.json"), `${JSON.stringify({ review, checks, resultHash, resultArtifact, threadId, skippedSemanticReview: failed.length > 0 }, null, 2)}\n`, { mode: 0o600 });
  if (review) await store.appendEvent(ticket, "verifier.semantic", "verifier", { ...review, threadId, resultHash, resultArtifact });
  else await store.appendEvent(ticket, "verifier.semantic_skipped", "verifier", { reason: "Programmatic checks failed", failedChecks: failed, resultHash, resultArtifact });
  return { review, checks, threadId, resultHash, resultArtifact };
}

