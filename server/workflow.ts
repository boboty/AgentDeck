import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Ticket } from "./domain.js";
import { IsolatedAboard } from "./aboard.js";
import { planTicket, runVerifier, runWorker } from "./agents.js";
import type { WorkerEvidence } from "./agents.js";
import { RuntimeStore } from "./store.js";
import type { AgentPlan } from "./domain.js";

export interface WorkflowOptions {
  appRoot: string;
  store: RuntimeStore;
  ticket: Ticket;
  forceVerifierFail?: boolean;
}

export async function executeTicket(options: WorkflowOptions): Promise<void> {
  const { appRoot, store } = options;
  const ticket = options.ticket;
  const runDirectory = resolve(store.root, "tickets", ticket.id);
  const workspace = resolve(store.root, "runs", ticket.id, "workspace");
  try {
    await mkdir(workspace, { recursive: true });
    ticket.status = "queued";
    await store.saveTicket(ticket);
    await store.appendEvent(ticket, "ticket.queued", "system", { queue: "local-demo" });

    const { plan, threadId: orchestratorThreadId } = await planTicket(store, ticket, workspace, runDirectory);
    await store.appendEvent(ticket, "orchestrator.plan", "orchestrator", { threadId: orchestratorThreadId, plan });

    const board = await IsolatedAboard.create(appRoot, workspace, ticket, plan, resolve(appRoot, "server", "fixtures", "tickets.json"));
    ticket.sourceSnapshotHash = board.sourceSnapshotHash;
    ticket.projectId = board.identity.project_id;
    await store.saveTicket(ticket);
    await store.appendEvent(ticket, "board.isolated", "system", { projectId: board.identity.project_id, projectRoot: board.identity.project_root, identityPath: board.identity.identity_path, databasePath: board.identity.database_path, developmentBoardId: process.env.AGENTDECK_DEV_BOARD_ID ?? null, sourceSnapshotHash: board.sourceSnapshotHash });

    const runtimeTask = await board.createQueuedTask(ticket, plan);
    if (typeof runtimeTask.id !== "string") throw new Error("aboard did not return a task ID");
    const taskId = runtimeTask.id;
    ticket.taskId = taskId;
    ticket.status = "in_progress";
    await store.saveTicket(ticket);
    await store.appendEvent(ticket, "task.in_progress", "system", runtimeTask);
    await writeFile(resolve(runDirectory, "board-snapshot.json"), `${JSON.stringify(board.boardSnapshot(), null, 2)}\n`, { mode: 0o600 });

    const evidence: WorkerEvidence = await runWorker(store, ticket, plan, board, runDirectory);
    const verification = await runVerifier(store, ticket, board, evidence, runDirectory);
    const forcedFail = options.forceVerifierFail === true;
    const failedProgramChecks = verification.checks.filter((check) => check.verdict !== "PASS");
    const businessVerdict = forcedFail || failedProgramChecks.length > 0 || verification.review?.verdict !== "PASS" ? "FAIL" : "PASS";
    const persistedVerdict = businessVerdict === "PASS" ? "PASS" : "RC";
    const verifierRecord = {
      businessVerdict,
      modelVerdict: verification.review?.verdict ?? null,
      forcedTestInjection: forcedFail,
      rationale: forcedFail ? "Transparent test injection forces correction routing after preserving the genuine semantic model verdict." : verification.review?.rationale ?? "Semantic review was skipped because independent programmatic checks failed.",
      criteria: verification.review?.criteria ?? [],
      programmaticChecks: verification.checks,
      sourceSnapshotHash: board.sourceSnapshotHash,
      resultHash: verification.resultHash,
      resultArtifact: verification.resultArtifact,
      verifierThreadId: verification.threadId,
    };
    await board.addFact(
      taskId,
      "verification",
      businessVerdict === "PASS"
        ? `Independent verifier PASS: programmatic checks and semantic review passed. Source snapshot ${board.sourceSnapshotHash}; result artifact SHA-256 ${verification.resultHash}. This is a non-code result, not a Git commit baseline.`
        : `Business FAIL preserved as aboard RC. Source snapshot ${board.sourceSnapshotHash}; result artifact SHA-256 ${verification.resultHash}. Model verdict ${verification.review?.verdict ?? "not run"}; test injection=${forcedFail}.`,
      verifierRecord,
      { verdict: persistedVerdict, baseline: board.sourceSnapshotHash, fingerprint: verification.resultHash },
    );
    await writeFile(resolve(runDirectory, "verification.json"), `${JSON.stringify({ ...verifierRecord, checks: verification.checks }, null, 2)}\n`, { mode: 0o600 });

    if (businessVerdict === "PASS") {
      board.setTaskState(taskId, "DONE", "Independent programmatic and semantic verification passed");
      ticket.status = "completed";
      ticket.recommendation = evidence.recommendation as unknown as Record<string, unknown>;
      ticket.verifier = verifierRecord;
      ticket.resultHash = verification.resultHash;
      await store.saveTicket(ticket);
      await writeFile(resolve(runDirectory, "board-snapshot.json"), `${JSON.stringify(board.boardSnapshot(), null, 2)}\n`, { mode: 0o600 });
      await store.appendEvent(ticket, "ticket.completed", "system", { verdict: "PASS", resultHash: verification.resultHash, sourceSnapshotHash: board.sourceSnapshotHash });
    } else {
      board.setTaskState(taskId, "BLOCKED", "Independent verifier returned FAIL; see immutable RC fact and correction task");
      const correction = await board.createCorrection(taskId, ticket, { ...verifierRecord, resultHash: verification.resultHash });
      ticket.status = "failed";
      ticket.recommendation = evidence.recommendation as unknown as Record<string, unknown>;
      ticket.verifier = { ...verifierRecord, correctionTask: correction };
      ticket.resultHash = verification.resultHash;
      await store.saveTicket(ticket);
      await writeFile(resolve(runDirectory, "board-snapshot.json"), `${JSON.stringify(board.boardSnapshot(), null, 2)}\n`, { mode: 0o600 });
      await store.appendEvent(ticket, "ticket.failed", "system", { verdict: "FAIL", aboardVerdict: "RC", correctionTask: correction, resultHash: verification.resultHash });
    }
  } catch (error) {
    ticket.status = "failed";
    ticket.error = "WORKFLOW_FAILED";
    await store.saveTicket(ticket);
    await store.appendEvent(ticket, "ticket.failed", "system", { code: "WORKFLOW_FAILED", message: "The local workflow stopped; inspect the run's restricted raw SDK diagnostics.", sourceSnapshotHash: ticket.sourceSnapshotHash ?? null, resultHash: ticket.resultHash ?? null, errorType: error instanceof Error ? error.name : "UnknownError" });
  }
}

export async function executeCorrection(options: Omit<WorkflowOptions, "forceVerifierFail">): Promise<void> {
  const { appRoot, store } = options;
  const ticket = options.ticket;
  const root = resolve(store.root, "tickets", ticket.id);
  const correction = (ticket.verifier as Record<string, unknown> | undefined)?.correctionTask as { id?: unknown; state?: unknown } | undefined;
  const originalVerifier = structuredClone(ticket.verifier ?? {});
  if (ticket.status !== "in_progress" || typeof correction?.id !== "string" || correction.state !== "READY" || !ticket.projectId || !ticket.sourceSnapshotHash) {
    throw new Error("Ticket has no queued correction task to execute");
  }
  const correctionTaskId = correction.id;
  const correctionDirectory = resolve(root, "corrections", correctionTaskId);
  const workspace = resolve(store.root, "runs", ticket.id, "workspace");
  let board: IsolatedAboard | undefined;
  let taskStarted = false;
  await mkdir(correctionDirectory, { recursive: true });
  try {
    const plan = JSON.parse(await readFile(resolve(root, "plan.json"), "utf8")) as AgentPlan;
    const priorResult = JSON.parse(await readFile(resolve(root, "result.json"), "utf8")) as Record<string, unknown>;
    const failedCriteria = Array.isArray((originalVerifier as Record<string, unknown>).criteria)
      ? ((originalVerifier as Record<string, unknown>).criteria as Array<Record<string, unknown>>).filter((criterion) => criterion.verdict === "FAIL")
      : [];
    if (failedCriteria.length === 0) throw new Error("Correction task input has no inspectable failed criteria");
    board = IsolatedAboard.open(appRoot, workspace, ticket.projectId, ticket.sourceSnapshotHash);
    board.setTaskState(correctionTaskId, "IN_PROGRESS", "A bounded correction attempt was requested through the local API");
    taskStarted = true;
    await board.addFact(correctionTaskId, "execution", `Correction started for frozen original task ${ticket.taskId}; original FAIL/RC evidence remains unchanged.`, {
      parentTaskId: ticket.taskId,
      originalResultHash: ticket.resultHash,
      sourceSnapshotHash: ticket.sourceSnapshotHash,
      attempt: 1,
      maxAttempts: 1,
    });
    await store.appendEvent(ticket, "correction.started", "system", { correctionTaskId, sourceSnapshotHash: ticket.sourceSnapshotHash, originalResultHash: ticket.resultHash, attempt: 1, maxAttempts: 1 });

    const previousWorker = priorResult.workerEvidence as Record<string, unknown> | undefined;
    const previousRecommendation = previousWorker?.recommendation as { customerSafeText?: unknown } | undefined;
    const evidence: WorkerEvidence = await runWorker(store, ticket, plan, board, correctionDirectory, {
      taskId: correctionTaskId,
      failedCriteria,
      ...(typeof previousRecommendation?.customerSafeText === "string" ? { previousDraft: previousRecommendation.customerSafeText } : {}),
    });
    await store.appendEvent(ticket, "correction.worker_proposal", "worker", { correctionTaskId, threadId: evidence.threadId, recommendation: evidence.recommendation, sourceSnapshotHash: ticket.sourceSnapshotHash, originalFailedCriteria: failedCriteria });
    const verification = await runVerifier(store, ticket, board, evidence, correctionDirectory, {
      taskId: correctionTaskId,
      resultArtifact: `tickets/${ticket.id}/corrections/${correctionTaskId}/result.json`,
    });
    const failedProgramChecks = verification.checks.filter((check) => check.verdict !== "PASS");
    const businessVerdict = failedProgramChecks.length > 0 || verification.review?.verdict !== "PASS" ? "FAIL" : "PASS";
    const correctionRecord = {
      correctionTaskId,
      originalTaskId: ticket.taskId,
      originalResultHash: ticket.resultHash,
      originalVerifier: originalVerifier,
      businessVerdict,
      modelVerdict: verification.review?.verdict ?? null,
      rationale: verification.review?.rationale ?? "Independent semantic review was skipped because deterministic checks failed.",
      criteria: verification.review?.criteria ?? [],
      programmaticChecks: verification.checks,
      sourceSnapshotHash: board.sourceSnapshotHash,
      resultHash: verification.resultHash,
      resultArtifact: `tickets/${ticket.id}/corrections/${correctionTaskId}/result.json`,
      workerThreadId: evidence.threadId,
      verifierThreadId: verification.threadId,
      maxAttempts: 1,
    };
    await board.addFact(
      correctionTaskId,
      "verification",
      businessVerdict === "PASS"
        ? `Independent verifier PASS on correction task. Original task ${ticket.taskId} remains frozen with its RC. Source snapshot ${board.sourceSnapshotHash}; corrected artifact SHA-256 ${verification.resultHash}.`
        : `Correction attempt FAIL preserved as RC. Original task ${ticket.taskId} and first result remain frozen. Source snapshot ${board.sourceSnapshotHash}; corrected artifact SHA-256 ${verification.resultHash}.`,
      correctionRecord,
      { verdict: businessVerdict === "PASS" ? "PASS" : "RC", baseline: board.sourceSnapshotHash, fingerprint: verification.resultHash },
    );
    board.setTaskState(correctionTaskId, businessVerdict === "PASS" ? "DONE" : "BLOCKED", businessVerdict === "PASS" ? "Independent correction verification passed" : "The single bounded correction attempt failed; human review is required");
    await writeFile(resolve(correctionDirectory, "board-snapshot.json"), `${JSON.stringify(board.boardSnapshot(), null, 2)}\n`, { mode: 0o600 });

    ticket.verifier = { ...originalVerifier, correction: correctionRecord, correctionTask: { id: correctionTaskId, state: businessVerdict === "PASS" ? "DONE" : "BLOCKED" }, finalBusinessVerdict: businessVerdict };
    // The ticket's aggregate result pointer always names the latest attempt; the original failed files and RC fact remain frozen.
    ticket.recommendation = evidence.recommendation as unknown as Record<string, unknown>;
    ticket.resultHash = verification.resultHash;
    if (businessVerdict === "PASS") {
      ticket.status = "completed";
      await store.saveTicket(ticket);
      await store.appendEvent(ticket, "correction.completed", "system", { correctionTaskId, originalTaskId: ticket.taskId, resultHash: verification.resultHash, originalResultHash: correctionRecord.originalResultHash, sourceSnapshotHash: board.sourceSnapshotHash });
    } else {
      ticket.status = "failed";
      await store.saveTicket(ticket);
      await store.appendEvent(ticket, "correction.failed", "system", { correctionTaskId, originalTaskId: ticket.taskId, resultHash: verification.resultHash, nextStep: "human_review", maxAttempts: 1 });
    }
  } catch (error) {
    if (board && taskStarted) {
      try {
        await board.addFact(correctionTaskId, "note", "The single correction attempt stopped because of a runtime error; no business PASS/FAIL was inferred. Human review is required.", {
          code: "CORRECTION_RUNTIME_ERROR",
          errorType: error instanceof Error ? error.name : "UnknownError",
          sourceSnapshotHash: ticket.sourceSnapshotHash,
          originalResultHash: originalVerifier.resultHash ?? null,
          maxAttempts: 1,
          nextStep: "human_review",
        });
        board.setTaskState(correctionTaskId, "BLOCKED", "The single correction attempt stopped on a runtime error; human review is required");
        await writeFile(resolve(correctionDirectory, "board-snapshot.json"), `${JSON.stringify(board.boardSnapshot(), null, 2)}\n`, { mode: 0o600 });
      } catch {
        // Retain the original runtime failure and ticket event if the board itself is unavailable.
      }
    }
    ticket.status = "failed";
    await store.saveTicket(ticket);
    await store.appendEvent(ticket, "correction.failed", "system", { correctionTaskId, code: "CORRECTION_FAILED", errorType: error instanceof Error ? error.name : "UnknownError", nextStep: "human_review", maxAttempts: 1 });
  }
}

