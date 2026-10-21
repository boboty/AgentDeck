# AgentDeck architecture and delivery boundaries

## Current baseline

The Node.js 24 / TypeScript backend now exposes a local-only HTTP API, source-bound simulated query tools, isolated aboard workspaces, real SDK Orchestrator/Worker/Verifier runs, event persistence, SSE, and read-only replay. This task deliberately has no Web UI or Compose packaging. The locked SDK remains `@openai/codex-sdk` 0.163.0.

The product UI remains React 19 + TypeScript + Vite 8 and follows BenYan AI Design System directly. The later API remains a lightweight Node process. Do not introduce framework or storage layers before an acceptance requirement needs them.

## Runtime responsibilities

The selected SDK owns individual model sessions, tool execution, and streamed event delivery. The application orchestrator owns ticket intake, task decomposition, dependency scheduling, and which role/session runs next. A Worker produces a proposal and cited evidence. A separate Verifier checks the proposal against the source snapshot. Agent Board remains the durable task/fact ledger; it does not become the application scheduler and its kernel/state protocol is unchanged.

Each demo ticket gets a separate Git-initialized working directory with its own `aboard init` database. Runtime workspace discovery must be explicit so it cannot reach the development project's `.git/agent-board.json`. A source snapshot is copied into the run workspace and content-hashed. Customer-task descriptions identify that snapshot hash and explain that the deliverable is a non-code artifact. The verification fact records the source hash as its target baseline and the actual result artifact hash as its fingerprint; neither is represented as a Git commit.

For a business `FAIL`, preserve the original verifier output in the verification data, record the supported aboard verdict `RC`, and freeze that task's evidence. Application policy creates and queues a new correction task with the failed result as input. The explicit correction endpoint advances that READY task once, using a new Worker and independent Verifier context; the Worker sees the failed criteria but the Verifier does not inherit the old verdict. A correction PASS completes the new task; a correction FAIL or runtime failure blocks it for human review. There are no automatic repeated correction loops. The ticket's replay retains both attempts and the original RC fact/result remain immutable. `PASS` can only come from an independent verifier session.

## Minimum necessary intelligence and authority

Prefer deterministic code whenever inputs and rules are structured. The agents exist only for decisions that require language understanding or evidence judgment which a fixed rule set cannot safely replace.

| Role | Why an agent is needed | Deterministic responsibilities | Permission and approval boundary |
| --- | --- | --- | --- |
| Orchestrator | A customer ticket may express several issues, missing context, repeated contact, or conflicting intent in free text. A model can identify the likely investigation needs and propose a small task plan. | The application validates the returned schema, task count, allowed tools, dependency graph, ready-to-run conditions, queue/state transitions, timeout, retry budget, and task IDs. The Orchestrator can request only bounded aboard create/queue/state operations through the formal contract. | A customer submission authorizes local simulated ticket/task creation. There is no authority to send a customer response, issue a refund, or mutate a real CRM. Any real external action would require explicit Human approval and remains outside this MVP. |
| Worker | After tool results are gathered, deciding which facts answer a messy request and synthesizing a clear, empathetic, evidence-linked recommendation requires judgment over unstructured language. | Order IDs, timestamps, return-window arithmetic, rule predicates, query execution, source-reference validation, output schema, hashing, and artifact persistence are ordinary code/API work. Data tools are read-only. | The Worker may query simulated order, case, and policy APIs and write only its proposal artifact. It has no aboard writes or customer-facing side effects. |
| Independent Verifier | Determining whether evidence is relevant and sufficient, whether the proposal answers the actual customer intent, and whether the wording overstates conflicting rules is a separate semantic judgment. | A program first validates required fields, source references, artifact hashes, applicable date/rule calculations, and the presence of required evidence. Only after those checks does the independent model assess semantic completeness, contradiction handling, and reasonableness. Application code stores the raw model verdict and maps business `FAIL` to aboard `RC`. | The verifier has read-only source and result tools and a separate SDK thread. It cannot amend the proposal or write aboard; deterministic application code persists its immutable result. |

Use one Orchestrator, one Worker, and one independent Verifier per ordinary ticket. Add a new Worker and Verifier pair only when an actual failed review creates a correction task. Do not use extra agents for parallelism or role count alone. Agents return proposed actions; deterministic code enforces dependencies, execution conditions, state changes, retries, artifact immutability, and replay. The simulated demo presents recommendations only. A human must approve any future non-simulated customer or financial action before execution.

Live events are append-only JSONL records from the SDK, paired with immutable source and result artifacts. The UI may derive display summaries, but raw records remain available for audit. Replay uses persisted artifacts and event data only: no model request, tool call, or aboard write is allowed in replay mode.

## API contract for the backend task

Expose versioned routes under `/api/v1`. Browser code calls relative paths and Vite's development proxy forwards to the local Node API; product code does not embed a machine-specific backend address.

Use the standard HTTP status meanings and direct business objects on success. Error responses use `{"error":{"code":"...","message":"...","request_id":"req_..."}}`, with optional `details`; never return stack traces, local paths, authorization data, or tokens. Accept a valid `X-Request-ID` or create one, return it in response headers and errors, and include it in structured JSON logs. Log lifecycle events and external SDK calls with provider, operation, duration, result, and retry count while excluding secrets and sensitive customer text.

## State and persistence plan

The initial product scope has simulated data and local-only execution, so it does not justify PostgreSQL, an ORM, migrations, Redis, or repository/service shells. Persist each immutable run record, source snapshot, result artifact, and JSONL event stream in a local application data directory. Keep runtime board files inside their isolated demo workspaces. Add a database only if a later task requires concurrent durable shared state or query behavior that local files cannot support.

Create Compose files in the Web task. Compose should start the complete app, expose one local web address, health-check required services, and persist required state. Do not add a Postgres container unless product scope adds a demonstrated database requirement. The current development host has a reachable Docker/OrbStack daemon (Docker server 29.4.0); this task does not build or validate Compose.

## Planned independent delivery boundaries

1. **SDK and engineering baseline (this task):** decisions, project rules, documentation, locked dependencies, executable quality gates, and real SDK/tool/event probe. No product API or UI.
2. **Real collaboration backend (this task):** deterministic simulated source APIs and query tools, isolated per-ticket aboard workspaces, bounded model Orchestrator planning through formal task/queue/state operations, one independent Worker and Verifier session, programmatic validation before semantic verification, failure-to-RC mapping, a bounded runnable correction path, raw event and artifact persistence, SSE/read-only replay, and saved real model runs. No real customer, order, or financial side effects.
3. **Web presentation and replay:** manual/demo ticket entry, deterministic ticket queue and dependency display, live SDK event summaries, evidence and verdicts, final recommendation, and a complete read-only replay path. UI state, SSE delivery, and replay selection are ordinary deterministic application behavior, never agent output.

Product acceptance criteria AC1–AC6 remain frozen in the parent product definition. The staged task boundaries do not weaken them; the full MVP is complete only after the backend and Web tasks jointly satisfy all six.

## Backend run evidence

The `artifacts/backend-smoke/` directory contains HTTP responses, live traces, replay exports, and a manifest distinguishing valid evidence from the first diagnostic run. Ticket `tkt_c5baa5d2-c0eb-4045-9b25-fd17414a6430` is the post-fix real successful run: its source snapshot hash is `36ea969b1ed7ed1f41763b2c4252579d48779eeb40c57f931685bd920eeaaca7`, and its result hash is `3c8e3c7398c553e2243002c05b73b88955a818d42f524988f2fab85cc3735da9`. It leaves unqueried history as unknown (`matchingHistoryCases: null`), which the independent Verifier accepts without claiming there are no records.

Ticket `tkt_e9048d2b-7f0c-400e-be26-2fdefd1c339d` preserves a genuine initial business FAIL/aboard RC at result hash `26556addf0e0a9bd6d5d54ecca416f23c3dcb0c47eaa6f498e83e4f545042987`. One real correction run addressed the missed return deadline but failed a separate completeness criterion: it omitted the questions required by policy for wear duration, size, and care method. The correction task is BLOCKED for human review, with its own result hash `fc7a1fa4c40a0870e5ba550564a2ef4e5f5e5901b9676694549270b512415677`. The original RC and artifact are retained. `correction-final-replay.json` contains the complete 35-event history, the new correction evidence, and raw Worker/Verifier SDK JSONL.
