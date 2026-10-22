import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { existsSync } from "node:fs";
import { SCENARIOS, type Scenario, type Ticket } from "./domain.js";
import { assertDevelopmentBoard } from "./aboard.js";
import { initializeRuntimeConfig } from "./config.js";
import { RuntimeStore } from "./store.js";
import { executeCorrection, executeTicket } from "./workflow.js";

const appRoot = resolve(process.env.AGENTDECK_APP_ROOT ?? process.cwd());
initializeRuntimeConfig(appRoot);
const store = new RuntimeStore();
const devBoard = assertDevelopmentBoard(appRoot);
if (devBoard) process.env.AGENTDECK_DEV_BOARD_ID = devBoard.project_id;
else delete process.env.AGENTDECK_DEV_BOARD_ID;
const bundledRecordings = [
  { id: "success", title: "订单配送与退货期限", ticketId: "tkt_c5baa5d2-c0eb-4045-9b25-fd17414a6430", outcome: "PASS" },
  { id: "correction", title: "重复投诉与纠正复核", ticketId: "tkt_e9048d2b-7f0c-400e-be26-2fdefd1c339d", outcome: "HUMAN_REVIEW" },
  { id: "live", title: "现场运行：配送状态与退货期限", ticketId: "tkt_b2755e67-af0f-4eb5-99d9-dd132716b94a", outcome: "PASS" },
];

function requestId(request: IncomingMessage): string {
  const supplied = request.headers["x-request-id"];
  if (typeof supplied === "string" && /^[A-Za-z0-9._:-]{8,100}$/.test(supplied)) return supplied;
  return `req_${randomUUID()}`;
}

function json(response: ServerResponse, status: number, requestID: string, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "x-request-id": requestID, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(`${JSON.stringify(value)}\n`);
}

function safeError(code: string, message: string, requestID: string, details?: unknown) {
  return { error: { code, message, request_id: requestID, ...(details ? { details } : {}) } };
}

async function bodyJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const part of request) {
    body += part.toString();
    if (body.length > 16_384) throw Object.assign(new Error("Request body is too large"), { status: 413, code: "BODY_TOO_LARGE" });
  }
  if (!body) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected JSON object");
    return parsed as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error("Request body must be a JSON object"), { status: 400, code: "INVALID_JSON" });
  }
}

function parseAfter(url: URL): number {
  const value = Number(url.searchParams.get("after") ?? "0");
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function log(requestID: string, method: string, path: string, status: number, startedAt: number): void {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), level: status >= 500 ? "error" : "info", request_id: requestID, method, path, status, duration_ms: Date.now() - startedAt })}\n`);
}

function routeId(pathname: string, suffix: string): string | undefined {
  const match = pathname.match(new RegExp(`^/api/v1/tickets/([^/]+)/${suffix}$`));
  return match?.[1];
}

async function replay(ticket: Ticket): Promise<Record<string, unknown>> {
  const events = await store.readEvents(ticket);
  const root = resolve(store.root, "tickets", ticket.id);
  const run = root;
  const files: Record<string, unknown> = {};
  for (const name of ["plan.json", "query-results.json", "deterministic-facts.json", "recommendation.json", "worker-evidence.json", "programmatic-checks.json", "result.json", "verification.json", "board-snapshot.json"]) {
    try {
      const content = await readFile(resolve(run, name));
      files[name] = { sha256: createHash("sha256").update(content).digest("hex"), content: JSON.parse(content.toString("utf8")) as unknown };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const rawEventFiles: Record<string, string> = {};
  for (const role of ["orchestrator", "worker", "verifier"]) {
    try {
      rawEventFiles[role] = await readFile(resolve(root, "agents", `${role}.jsonl`), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  let correctionReplay: Record<string, unknown> | null = null;
  const verifier = ticket.verifier as Record<string, unknown> | undefined;
  const correction = verifier?.correction as Record<string, unknown> | undefined;
  const correctionTask = verifier?.correctionTask as { id?: unknown } | undefined;
  if (correction && typeof correctionTask?.id === "string") {
    const correctionRoot = resolve(root, "corrections", correctionTask.id);
    const correctionFiles: Record<string, unknown> = {};
    for (const name of ["query-results.json", "deterministic-facts.json", "recommendation.json", "worker-evidence.json", "programmatic-checks.json", "result.json", "verification.json", "board-snapshot.json"]) {
      try {
        const content = await readFile(resolve(correctionRoot, name));
        correctionFiles[name] = { sha256: createHash("sha256").update(content).digest("hex"), content: JSON.parse(content.toString("utf8")) as unknown };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const correctionRawEvents: Record<string, string> = {};
    for (const role of ["worker", "verifier"]) {
      try {
        correctionRawEvents[role] = await readFile(resolve(correctionRoot, "agents", `${role}.jsonl`), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    correctionReplay = { taskId: correctionTask.id, outcome: correction, files: correctionFiles, rawEventFiles: correctionRawEvents };
  }
  return { mode: "replay", ticket, events, files, rawEventFiles, correction: correctionReplay };
}

async function sse(request: IncomingMessage, response: ServerResponse, ticket: Ticket, after: number, requestID: string): Promise<void> {
  response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-request-id": requestID, "x-accel-buffering": "no" });
  response.flushHeaders();
  let cursor = after;
  let heartbeat = 0;
  while (!request.destroyed && !response.destroyed) {
    const batch = await store.readEvents(ticket, cursor);
    for (const event of batch) {
      response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      cursor = event.id;
    }
    const latest = await store.getTicket(ticket.id);
    if (latest && ["completed", "failed"].includes(latest.status) && batch.length === 0) break;
    if (batch.length === 0 && heartbeat++ % 15 === 0) response.write(": keepalive\n\n");
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  response.end();
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const startedAt = Date.now();
  const id = requestId(request);
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;
  let status = 200;
  try {
    if (request.method === "GET" && (path === "/health" || path === "/api/v1/health")) {
      json(response, 200, id, { status: "ok", service: "agentdeck-backend", api: "/api/v1", developmentBoardId: devBoard?.project_id ?? null });
      return;
    }
    if (request.method === "GET" && path === "/api/v1/recordings") {
      json(response, 200, id, bundledRecordings);
      return;
    }
    const recordingMatch = path.match(/^\/api\/v1\/recordings\/([a-z-]+)\/replay$/);
    if (request.method === "GET" && recordingMatch) {
      const recording = bundledRecordings.find(({ id: recordingId }) => recordingId === recordingMatch[1]);
      if (!recording) {
        status = 404;
        json(response, status, id, safeError("RECORDING_NOT_FOUND", "Recording was not found", id));
        return;
      }
      const content = await readFile(resolve(appRoot, "server", "fixtures", "replays", `${recording.id}.json`), "utf8");
      json(response, 200, id, JSON.parse(content) as unknown);
      return;
    }
    if (request.method === "GET" && path === "/api/v1/scenarios") {
      json(response, 200, id, Object.entries(SCENARIOS).map(([key, value]) => ({ id: key, ...value })));
      return;
    }
    if (request.method === "GET" && path === "/api/v1/tickets") {
      json(response, 200, id, await store.listTickets());
      return;
    }
    if (request.method === "POST" && path === "/api/v1/tickets") {
      const body = await bodyJson(request);
      const scenario = body.scenario;
      if (scenario !== undefined && (typeof scenario !== "string" || !Object.hasOwn(SCENARIOS, scenario))) {
        status = 400;
        json(response, status, id, safeError("INVALID_SCENARIO", "scenario must be one of the preset local scenarios", id));
        return;
      }
      const canonicalScenario = scenario as Scenario | undefined;
      const text = typeof body.text === "string" ? body.text.trim() : canonicalScenario ? SCENARIOS[canonicalScenario].ticketText : "";
      if (text.length < 8 || text.length > 3000) {
        status = 400;
        json(response, status, id, safeError("INVALID_TICKET", "text must contain 8 to 3000 characters", id));
        return;
      }
      const ticket = await store.createTicket(text, canonicalScenario);
      status = 201;
      json(response, 201, id, ticket);
      return;
    }
    const runId = routeId(path, "run");
    const correctionRunId = routeId(path, "correction/run");
    if (request.method === "POST" && correctionRunId) {
      const ticket = await store.getTicket(correctionRunId);
      if (!ticket) {
        status = 404;
        json(response, status, id, safeError("TICKET_NOT_FOUND", "Ticket was not found", id));
        return;
      }
      const correction = (ticket.verifier as Record<string, unknown> | undefined)?.correctionTask as { id?: unknown; state?: unknown } | undefined;
      if (ticket.status !== "failed" || typeof correction?.id !== "string" || correction.state !== "READY") {
        status = 409;
        json(response, status, id, safeError("NO_READY_CORRECTION", "Ticket has no queued correction task", id));
        return;
      }
      ticket.status = "in_progress";
      await store.saveTicket(ticket);
      await store.appendEvent(ticket, "correction.run_requested", "system", { requestId: id, correctionTaskId: correction.id, maxAttempts: 1 });
      status = 202;
      json(response, status, id, { ticketId: ticket.id, correctionTaskId: correction.id, status: "in_progress", eventPath: `/api/v1/tickets/${ticket.id}/events/stream` });
      void executeCorrection({ appRoot, store, ticket });
      return;
    }
    if (request.method === "POST" && runId) {
      const ticket = await store.getTicket(runId);
      if (!ticket) {
        status = 404;
        json(response, status, id, safeError("TICKET_NOT_FOUND", "Ticket was not found", id));
        return;
      }
      if (ticket.status !== "created") {
        status = 409;
        json(response, status, id, safeError("INVALID_TICKET_STATE", "Only a newly created ticket can be started", id));
        return;
      }
      const body = await bodyJson(request);
      const forceVerifierFail = body.testInjection === "force-verifier-fail";
      if (body.testInjection !== undefined && !forceVerifierFail) {
        status = 400;
        json(response, status, id, safeError("INVALID_TEST_INJECTION", "testInjection value is unsupported", id));
        return;
      }
      if (forceVerifierFail && process.env.AGENTDECK_ENABLE_TEST_INJECTION !== "1") {
        status = 403;
        json(response, status, id, safeError("TEST_INJECTION_DISABLED", "Failure injection is disabled in this runtime", id));
        return;
      }
      ticket.status = "queued";
      await store.saveTicket(ticket);
      await store.appendEvent(ticket, "ticket.run_requested", "system", { requestId: id, testInjection: forceVerifierFail ? "force-verifier-fail" : null });
      status = 202;
      json(response, 202, id, { ticketId: ticket.id, status: "queued", eventPath: `/api/v1/tickets/${ticket.id}/events/stream` });
      void executeTicket({ appRoot, store, ticket, forceVerifierFail });
      return;
    }
    const eventsId = routeId(path, "events");
    if (request.method === "GET" && eventsId) {
      const ticket = await store.getTicket(eventsId);
      if (!ticket) {
        status = 404;
        json(response, status, id, safeError("TICKET_NOT_FOUND", "Ticket was not found", id));
        return;
      }
      json(response, 200, id, await store.readEvents(ticket, parseAfter(url)));
      return;
    }
    const streamId = routeId(path, "events/stream");
    if (request.method === "GET" && streamId) {
      const ticket = await store.getTicket(streamId);
      if (!ticket) {
        status = 404;
        json(response, status, id, safeError("TICKET_NOT_FOUND", "Ticket was not found", id));
        return;
      }
      await sse(request, response, ticket, parseAfter(url), id);
      return;
    }
    const replayId = routeId(path, "replay");
    if (request.method === "GET" && replayId) {
      const ticket = await store.getTicket(replayId);
      if (!ticket) {
        status = 404;
        json(response, status, id, safeError("TICKET_NOT_FOUND", "Ticket was not found", id));
        return;
      }
      json(response, 200, id, await replay(ticket));
      return;
    }
    const ticketMatch = path.match(/^\/api\/v1\/tickets\/([^/]+)$/);
    if (request.method === "GET" && ticketMatch) {
      const ticket = await store.getTicket(ticketMatch[1]!);
      if (!ticket) {
        status = 404;
        json(response, status, id, safeError("TICKET_NOT_FOUND", "Ticket was not found", id));
        return;
      }
      json(response, 200, id, ticket);
      return;
    }
    if (request.method === "GET" && !path.startsWith("/api/") && !path.includes("..")) {
      const webRoot = resolve(appRoot, "web", "dist");
      const requested = path === "/" ? "index.html" : path.slice(1);
      const target = resolve(webRoot, requested);
      if (target.startsWith(`${webRoot}${sep}`) && existsSync(target)) {
        const contentType: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
        response.writeHead(200, { "content-type": contentType[extname(target)] ?? "application/octet-stream", "x-request-id": id, "x-content-type-options": "nosniff" });
        response.end(await readFile(target));
        return;
      }
      if (existsSync(resolve(webRoot, "index.html"))) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-request-id": id, "x-content-type-options": "nosniff" });
        response.end(await readFile(resolve(webRoot, "index.html")));
        return;
      }
    }
    status = 404;
    json(response, status, id, safeError("NOT_FOUND", "Route was not found", id));
  } catch (error) {
    const maybeHttp = error as Error & { status?: number; code?: string };
    status = maybeHttp.status ?? 500;
    json(response, status, id, safeError(maybeHttp.code ?? "INTERNAL_ERROR", maybeHttp.status ? maybeHttp.message : "The request could not be completed", id));
  } finally {
    if (!response.headersSent || !response.getHeader("content-type")?.toString().startsWith("text/event-stream")) log(id, request.method ?? "GET", path, status, startedAt);
  }
}

const server = createServer((request, response) => {
  void handle(request, response);
});
const port = Number(process.env.PORT ?? "4317");
const host = process.env.HOST ?? "127.0.0.1";
const allowedHost = host === "127.0.0.1" || host === "localhost" || process.env.AGENTDECK_CONTAINER === "1" && host === "0.0.0.0";
if (!Number.isInteger(port) || port < 1 || port > 65535 || !allowedHost) throw new Error("Server is local-only; container mode may bind 0.0.0.0 behind a loopback-only host mapping");
await store.initialize();
server.listen(port, host, () => process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), level: "info", event: "server.started", host, port, api: "/api/v1", developmentBoardId: devBoard?.project_id ?? null })}\n`));
