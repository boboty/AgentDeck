# AgentDeck project rules

## Purpose and current phase

AgentDeck is a local-only customer-support collaboration demo built with React, Vite, and a lightweight Node.js API. Its frozen product requirements are AC1–AC6 in the Agent Board Task history. The SDK baseline and real collaboration backend are established. Current phase is Task #3: deliver the complete MVP Web experience, portable persisted replay fixtures, and Docker Compose entrypoint.

Current phase: implement the Task #3 React 19 / TypeScript / Vite 8 Web experience, shipped replay records, and Compose runtime over the accepted Task #2 backend. Use the local BenYan Design System source snapshot from `design-system/styles.css`, tokens, components, and logo assets. Show live SSE records and corrections as returned by the real backend; replay is read-only. Do not add model-driven UI behavior, fake progress, external integrations, or features beyond the frozen product acceptance criteria.

## Engineering standard

The project adopts BenYan Engineering Standard v2.0.0 at source commit `9edd0b656dadf3c264d6f808f4f16f24a69b2684` (`boboty/benyan-engineering-standard`). Applicable rules include the shared Web frontend stack and Design System, `/api/v1` HTTP contract, structured logs with request IDs, secrets handling, meaningful lint/typecheck/test/build gates, small architecture shaped by actual complexity, and evidence-based delivery.

Project choices and justified differences are recorded in `docs/architecture.md`. Node.js 24 with TypeScript replaces Fast Track's Python/FastAPI toolchain because the authorized product is a React/Vite application and its chosen, verified agent SDK is TypeScript-first. This keeps agent orchestration, the local API, shared schemas, and later Web integration in one runtime without a Python bridge; lint, strict typecheck, automated tests, and a compiled probe are the corresponding code gates. This is a stack choice, not a reduction in quality.

## Required local commands

- `make check` runs ESLint, strict TypeScript typechecking, build, and Node's test runner.
- `make sdk-probe` performs a real model/tool probe using the installed Codex login and writes inspectable SDK event evidence under `artifacts/sdk-probe/`.
- Use `npm ci` for reproducible dependency installation.

The SDK probe sends a small prompt to the configured model. The local backend sends simulated ticket text to the configured model and stores raw SDK JSONL events under the ignored local data directory; never use real customer data. Keep stored outputs free of secrets. Never inspect, print, copy, or commit authentication tokens.

## Boundaries for later phases

- The Agent Board is the orchestration ledger for project development only. Every customer-ticket demo run must create a separate Git-initialized workspace and its own `aboard init` database.
- Before any runtime board mutation, verify the discovered runtime `project_id`, project root, identity path, and database path are confined to that run workspace and differ from the development project board. Fail closed on any mismatch. Model sessions never receive aboard mutation tools; only deterministic application code invokes the formal CLI contract.
- The application layer enforces role separation, dependencies, immutability, retries, and correction policy. Do not modify aboard's four-state protocol or kernel. Map a business `FAIL` to the existing `RC` fact while retaining the raw result; create a new correction task and preserve the failed record. A correction task gets one explicit attempt, then PASS/DONE or FAIL/BLOCKED for human review; never retry indefinitely.
- Customer-support results are non-code deliverables. Their source snapshot hash and output artifact hash are the actual review boundary. Never claim a Git commit baseline for them.
- Replay reads persisted records only. It must never invoke an agent or mutate aboard.
- Keep Orchestrator scheduling separate from SDK worker execution and from aboard facts. Do not create a custom agent loop.
- Apply minimum necessary intelligence: use one Orchestrator, one Worker, and one independent Verifier per normal ticket. Models interpret free text, select relevant read-only queries, synthesize evidence, and judge semantic sufficiency; ordinary validation, date/rule arithmetic, dependency conditions, state transitions, retries, SSE, and replay are deterministic code. Verify structure, source references, hashes, and rule arithmetic programmatically before asking a Verifier model for semantic judgment.
- The local simulated recommendation is not permission to take a real customer, order, or financial action. Any later real external mutation requires explicit Human approval.
- Keep all data simulated. No CRM, financial, telephony, voice, multi-tenant, user-management, or general-purpose agent-platform scope.
- Agent sessions use the selected official Codex SDK and `runStreamed`; persist its original JSONL events. Never implement a custom agent loop. The Orchestrator proposes a bounded plan; deterministic application code validates it and performs all task lifecycle changes. Worker data tools are read-only. Verifier starts with independent programmatic checks, then makes semantic judgments only.
- The application is local-only. Do not publish, deploy, push, or merge without explicit authorization.
- Compose serves the production Web build and API from one local-only app endpoint, persists runtime state and isolated aboard databases, and health-checks the HTTP/API path. Containers do not contain the development `.git/agent-board.json`; only the explicit container mode allows that file to be absent, and each runtime board must still use its canonical workspace root and identity path. Fail closed on any runtime project/database mismatch.
- Compose obtains Codex authentication only through an explicit read-only runtime bind mount of the host's official Codex `auth.json`; use a separate writable volume for CLI session data. Never copy credentials into image layers, project files, logs, or demo artifacts. Missing auth must fail clearly; never substitute mock agent results.

## Docker plan and present environment

Compose starts the complete app, exposes one localhost web address, health-checks the HTTP/API path, persists runtime events and isolated aboard workspaces across restart, and bind-mounts the Codex auth file read-only from the host. Add no PostgreSQL: the simulated local product uses JSONL/filesystem persistence and independent aboard SQLite projects. Docker/OrbStack is reachable in this environment (server 29.4.0); validate a clean Compose project before delivery.
