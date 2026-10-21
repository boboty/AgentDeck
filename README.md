# AgentDeck

AgentDeck is a local React/Vite and lightweight Node.js customer-support collaboration demo. Work is staged so the real model collaboration backend is proven before its Web event viewer and replay are built.

This checkout contains the local collaboration backend and simulated support workflows. The React/Vite event viewer and Compose packaging are the next delivery phase; this task is backend-only.

## Requirements

- Node.js 24 LTS and npm 11
- Codex CLI 0.163.0, logged in through the supported Codex/ChatGPT login
- Docker/OrbStack is currently reachable on this development host; Compose packaging remains outside this backend task

## Install and verify

```sh
npm ci
make check
```

`make check` runs ESLint, strict TypeScript typechecking, the backend build, and focused Node tests.

To reproduce the real model, shell-tool, independent-thread, and JSONL event probe:

```sh
codex login status
make sdk-probe
```

The backend uses the configured Codex login and writes raw role-specific SDK JSONL events under `.agentdeck-data/runtime/`. It requires a working login and model availability. No credential file or token needs to be copied into this project.

## Run the local backend

```sh
npm ci
npm run build
npm start
```

The server binds only to `127.0.0.1:4317`. Check `GET /health`, list the three supported presets at `GET /api/v1/scenarios`, create a ticket with `POST /api/v1/tickets`, then start the real model workflow with `POST /api/v1/tickets/:id/run`. Ticket status and append-only events are available from `GET /api/v1/tickets/:id` and `/events`; live updates use `/events/stream` (SSE), and `/replay` returns persisted JSONL, source-linked artifacts, and correction records without calling an SDK or mutating aboard.

An existing READY correction task can be advanced once with `POST /api/v1/tickets/:id/correction/run`. Its Worker and independent Verifier get fresh SDK contexts. A correction PASS completes that new task; a correction FAIL or runtime failure is visibly BLOCKED for human review. Attempts are capped at one. Neither path changes the original failed task's RC fact or first result artifact.

The service invokes the official Codex SDK with a read-only, network-disabled shell sandbox. Worker/Verifier use `gpt-6-luna` with high reasoning effort. The Orchestrator uses the configured default. The logged-in Codex CLI must be available for the SDK's supported local authentication flow.

## Current architecture and next boundaries

Read [AGENTS.md](AGENTS.md), [architecture](docs/architecture.md), and [SDK selection](docs/sdk-selection.md). The backend smoke and real-model traces are under `artifacts/backend-smoke/`; the initial contradictory/incorrectly accepted run is explicitly marked diagnostic and is not acceptance evidence. `make check` is the local deterministic gate. The following Web task adds browser-based ticket entry, live event display, replay, and Compose packaging. The frozen product acceptance criteria remain AC1–AC6.
