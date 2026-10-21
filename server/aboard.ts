import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentPlan, Ticket } from "./domain.js";

interface BoardIdentity {
  project_root: string;
  identity_path: string;
  project_id: string;
  database_path: string;
}

function command(args: string[], cwd: string): string {
  return execFileSync("aboard", args, { cwd, encoding: "utf8", timeout: 20_000, maxBuffer: 2_000_000 }).trim();
}

function parseObject(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("aboard returned an unexpected response");
  }
}

function identity(cwd: string): BoardIdentity {
  const parsed = parseObject(command(["check"], cwd));
  const { project_root, identity_path, project_id, database_path } = parsed;
  if (typeof project_root !== "string" || typeof identity_path !== "string" || typeof project_id !== "string" || typeof database_path !== "string") {
    throw new Error("aboard identity is incomplete");
  }
  return { project_root: resolve(project_root), identity_path: resolve(identity_path), project_id, database_path: resolve(database_path) };
}

export function assertDevelopmentBoard(appRoot: string): BoardIdentity | null {
  const expectedRoot = realpathSync(resolve(appRoot));
  const gitDirectory = resolve(expectedRoot, ".git");
  const expectedIdentityPath = resolve(gitDirectory, "agent-board.json");
  if (!existsSync(gitDirectory)) {
    if (process.env.AGENTDECK_CONTAINER === "1") return null;
    throw new Error("development aboard identity is missing outside explicit container mode");
  }
  const result = identity(expectedRoot);
  if (result.project_root !== expectedRoot || result.identity_path !== expectedIdentityPath) {
    throw new Error("development aboard project identity does not match this application checkout");
  }
  return result;
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function extractTask(value: Record<string, unknown>): Record<string, unknown> {
  if (value.task && typeof value.task === "object") return value.task as Record<string, unknown>;
  return value;
}

export class IsolatedAboard {
  readonly workspace: string;
  readonly appRoot: string;
  readonly identity: BoardIdentity;
  readonly sourceSnapshotHash: string;

  private constructor(appRoot: string, workspace: string, boardIdentity: BoardIdentity, sourceSnapshotHash: string) {
    this.appRoot = resolve(appRoot);
    this.workspace = workspace;
    this.identity = boardIdentity;
    this.sourceSnapshotHash = sourceSnapshotHash;
  }

  static async create(appRoot: string, workspace: string, ticket: Ticket, plan: AgentPlan, fixturePath: string): Promise<IsolatedAboard> {
    const appIdentity = assertDevelopmentBoard(appRoot);
    await mkdir(workspace, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: workspace, encoding: "utf8", timeout: 20_000 });
    command(["init", "--name", `AgentDeck demo ${ticket.id}`], workspace);
    const canonicalWorkspace = realpathSync(workspace);
    const runtimeIdentity = identity(workspace);
    if (runtimeIdentity.project_root !== canonicalWorkspace
      || (appIdentity !== null && runtimeIdentity.project_id === appIdentity.project_id)
      || runtimeIdentity.identity_path !== resolve(canonicalWorkspace, ".git", "agent-board.json")
      || (appIdentity !== null && runtimeIdentity.database_path === appIdentity.database_path)) {
      throw new Error("runtime aboard workspace is not isolated from the development project");
    }

    const snapshot = await readFile(fixturePath);
    const sourceSnapshotHash = sha256(snapshot);
    await mkdir(resolve(workspace, "tools"), { recursive: true });
    await mkdir(resolve(workspace, "source"), { recursive: true });
    await writeFile(resolve(workspace, "source", "snapshot.json"), snapshot, { mode: 0o600 });
    await copyFile(resolve(appRoot, "server", "query-tool.mjs"), resolve(workspace, "tools", "query-tool.mjs"));
    const input = {
      ticket_id: ticket.id,
      ticket_text: ticket.text,
      scenario: ticket.scenario ?? null,
      snapshot_hash: sourceSnapshotHash,
      project_id: runtimeIdentity.project_id,
    };
    await writeFile(resolve(workspace, "source", "ticket.json"), `${JSON.stringify(input, null, 2)}\n`, { mode: 0o600 });
    return new IsolatedAboard(appRoot, canonicalWorkspace, runtimeIdentity, sourceSnapshotHash);
  }

  static open(appRoot: string, workspace: string, expectedProjectId: string, sourceSnapshotHash: string): IsolatedAboard {
    const dev = assertDevelopmentBoard(appRoot);
    const canonicalWorkspace = realpathSync(workspace);
    const current = identity(canonicalWorkspace);
    if (current.project_root !== canonicalWorkspace || current.project_id !== expectedProjectId || (dev !== null && current.project_id === dev.project_id)
      || current.identity_path !== resolve(canonicalWorkspace, ".git", "agent-board.json") || (dev !== null && current.database_path === dev.database_path)) {
      throw new Error("stored runtime aboard identity does not match the isolated ticket workspace");
    }
    return new IsolatedAboard(appRoot, canonicalWorkspace, current, sourceSnapshotHash);
  }

  assertIsolation(): void {
    const appIdentity = assertDevelopmentBoard(this.appRoot);
    const current = identity(this.workspace);
    if (current.project_id !== this.identity.project_id || current.project_root !== this.identity.project_root
      || current.identity_path !== this.identity.identity_path || (appIdentity !== null && current.database_path === appIdentity.database_path)) {
      throw new Error("runtime aboard identity changed or points at the development board");
    }
  }

  async createQueuedTask(ticket: Ticket, plan: AgentPlan): Promise<Record<string, unknown>> {
    this.assertIsolation();
    const description = [
      `Customer ticket ${ticket.id} is a simulated, non-code service result.`,
      `Runtime project_id: ${this.identity.project_id}. Source snapshot SHA-256: ${this.sourceSnapshotHash}.`,
      "The result artifact SHA-256 is the review fingerprint; this task deliberately has no Git commit baseline.",
      "All sources and operations are synthetic and read-only. A customer reply or financial action is not authorized.",
      `Ticket: ${ticket.text}`,
      `Orchestrator plan: ${plan.summary}`,
    ].join("\n");
    const created = extractTask(parseObject(command([
      "task", "create", "--title", plan.taskTitle, "--description", description,
      "--acceptance", plan.acceptanceCriteria.join("; "), "--actor", "agentdeck/orchestrator",
    ], this.workspace)));
    const taskId = created.id ?? created.number;
    const version = created.version;
    if ((typeof taskId !== "string" && typeof taskId !== "number") || typeof version !== "number") {
      throw new Error("aboard task creation response omitted task identity or version");
    }
    this.assertIsolation();
    command(["task", "queue", String(taskId), "--version", String(version), "--actor", "agentdeck/orchestrator"], this.workspace);
    const queued = extractTask(parseObject(command(["task", "get", String(taskId)], this.workspace)));
    if (queued.state !== "READY" || typeof queued.version !== "number") throw new Error("aboard did not place the runtime task in READY");
    this.assertIsolation();
    command(["task", "set-state", String(taskId), "IN_PROGRESS", "--version", String(queued.version), "--reason", "Deterministic runtime scheduler started the planned investigation", "--actor", "agentdeck/orchestrator"], this.workspace);
    const started = extractTask(parseObject(command(["task", "get", String(taskId)], this.workspace)));
    if (started.state !== "IN_PROGRESS") throw new Error("aboard did not record the runtime task as IN_PROGRESS");
    this.assertIsolation();
    command([
      "fact", "record", String(taskId), "--kind", "execution", "--body",
      `Orchestrator created and queued this synthetic non-code investigation from ticket ${ticket.id}. Source SHA-256 ${this.sourceSnapshotHash}; result is tracked by artifact hash, without a Git baseline.`,
      "--data", JSON.stringify({ ticketId: ticket.id, projectId: this.identity.project_id, sourceSnapshotHash: this.sourceSnapshotHash, queryNames: plan.queries }),
      "--actor", "agentdeck/orchestrator",
    ], this.workspace);
    return { id: String(taskId), number: created.number, projectId: this.identity.project_id, state: "IN_PROGRESS", version: started.version };
  }

  async addFact(taskId: string, kind: string, body: string, data: Record<string, unknown>, options: { verdict?: string; baseline?: string; fingerprint?: string } = {}): Promise<void> {
    this.assertIsolation();
    const args = ["fact", "record", taskId, "--kind", kind, "--body", body, "--data", JSON.stringify(data), "--actor", `agentdeck/${kind}`];
    if (options.verdict) args.push("--verdict", options.verdict);
    if (options.baseline) args.push("--baseline", options.baseline);
    if (options.fingerprint) args.push("--fingerprint", options.fingerprint);
    command(args, this.workspace);
  }

  setTaskState(taskId: string, state: "IN_PROGRESS" | "DONE" | "BLOCKED", reason: string): void {
    this.assertIsolation();
    const task = extractTask(parseObject(command(["task", "get", taskId], this.workspace)));
    const legalFrom: Record<string, string[]> = { IN_PROGRESS: ["READY"], DONE: ["IN_PROGRESS"], BLOCKED: ["IN_PROGRESS"] };
    if (!legalFrom[state]?.includes(String(task.state))) throw new Error(`runtime task cannot transition from ${String(task.state)} to ${state}`);
    if (typeof task.version !== "number") throw new Error("aboard task version unavailable");
    command(["task", "set-state", taskId, state, "--version", String(task.version), "--reason", reason, "--actor", "agentdeck/scheduler"], this.workspace);
  }

  async createCorrection(taskId: string, ticket: Ticket, failure: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.assertIsolation();
    const title = `Correction: ${ticket.id} verifier findings`;
    const description = [
      `Correction task for frozen failed task ${taskId}.`,
      `Source snapshot SHA-256: ${this.sourceSnapshotHash}. Original non-code result hash: ${String(failure.resultHash ?? "pending")}.`,
      "This is a new aboard task; the original task and FAIL evidence are immutable and remain available for replay.",
      `Verifier findings: ${JSON.stringify(failure)}`,
    ].join("\n");
    const created = extractTask(parseObject(command([
      "task", "create", "--title", title, "--description", description,
      "--acceptance", "Address the preserved verifier findings using source-backed evidence; do not erase the failed attempt.", "--actor", "agentdeck/correction",
    ], this.workspace)));
    const id = created.id ?? created.number;
    if ((typeof id !== "string" && typeof id !== "number") || typeof created.version !== "number") throw new Error("correction task response was invalid");
    command(["task", "queue", String(id), "--version", String(created.version), "--actor", "agentdeck/correction"], this.workspace);
    await this.addFact(taskId, "note", `A new correction task ${String(id)} was created; this failed task is retained unchanged.`, { correctionTaskId: String(id), originalVerdict: "FAIL", resultHash: failure.resultHash ?? null });
    return { id: String(id), state: "READY" };
  }

  boardSnapshot(): Record<string, unknown> {
    this.assertIsolation();
    return parseObject(command(["board"], this.workspace));
  }
}
