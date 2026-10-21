# AgentDeck

AgentDeck is a local customer-support collaboration demo. It turns a typed support request into a real Codex SDK Orchestrator → read-only Worker → independent Verifier run, tracks formal task state in a per-ticket Agent Board workspace, and shows the resulting evidence through a React/Vite interface. It uses synthetic fixture data and does not connect to a real CRM, send customer replies, or perform financial actions.

## Run locally

Requirements: Node.js 24, npm 11, Codex CLI 0.163.0 with its supported login, and a local Agent Board CLI v0.2.3 on `PATH`.

```sh
npm ci
make check
npm run build
npm start
```

Open <http://127.0.0.1:4317>. Use **创建工单** to enter a local support request, then **启动协作** to run it. The UI consumes live backend events and SSE; it does not write Agent Board state. `GET /api/v1/recordings` exposes the bundled immutable recordings and `/api/v1/recordings/:id/replay` reads one without starting an agent or mutating a board. The system-status screen reports API health and visible errors.

To run the browser checks, install Playwright Chromium once (`npx playwright install chromium`) or set `PLAYWRIGHT_CHANNEL=chrome` if Chrome is installed. `make check` includes a deterministic HTTP/SSE smoke and Playwright UI checks. The real-model three-role run is a separate explicit verification described below.

## Run with Compose

Compose runs a self-contained image with the official Agent Board v0.2.3 binary. It verifies the release archive digest during build. The local Codex auth file is mounted read-only at the SDK's standard path; it is never copied into the image or project. Runtime records, board databases, and non-secret Codex state use dedicated Compose volumes.

```sh
CODEX_AUTH_FILE="$HOME/.codex/auth.json" docker compose -p agentdeck-demo up --build -d
```

Open <http://127.0.0.1:4317>. Health is available at <http://127.0.0.1:4317/api/v1/health>. Stop the demo while keeping its runtime data with:

```sh
docker compose -p agentdeck-demo down
```

Remove the demo and its persisted volumes with:

```sh
docker compose -p agentdeck-demo down -v
```

Compose maps the service only to host loopback. Container mode is explicit, permits the missing source `.git` identity inside the image, and still requires every customer runtime board to have its own isolated canonical workspace and identity.

**Environment limitation (2026-10-22):** this machine's Compose image passes health, home, bundled replay, read-only auth-mount, and restart-persistence checks. A real model workflow was also submitted from the Web UI in Compose, but the official Codex SDK could not reach the configured ChatGPT provider from inside the container (`network.provider_reachability` failed in `codex doctor`; authentication, configuration, app-server, and general network checks passed). The run is preserved as a failed attempt and is not counted as a completed workflow. The same current Web UI and SDK completed a real three-role workflow on the host. Use native mode for live runs in this environment; Compose live-model execution remains unverified until provider reachability is available in the container.

## Live workflow and checks

Run the end-to-end real model workflow against the local service after authentication and provider reachability are available:

```sh
BASE_URL=http://127.0.0.1:4317 AGENTDECK_LIVE_E2E=1 npx playwright test e2e/live-workflow.spec.ts
```

The test creates and starts one synthetic ticket in the Web UI, waits for its actual terminal state, fetches its persisted replay, and saves the response and screenshot under `artifacts/task3-web/`. It requires network access, Codex login, an available model, and Agent Board CLI 0.2.3. Worker and Verifier use `gpt-6-luna` with high reasoning effort; Orchestrator keeps the configured default. A returned `HUMAN REVIEW` is displayed as a real outcome rather than silently retried.

`make check` runs ESLint, backend and frontend TypeScript checks, the backend/Vite production build, focused Node tests, isolated HTTP/SSE/replay smoke checks, a browser regression that streams the saved real-run events through the actual HTTP SSE endpoint, and the Playwright UI suite. The SSE regression uses an isolated temporary runtime and makes no model call; the real model workflow remains a separate explicit verification.

## Acceptance evidence

- **AC1 — intake:** typed ticket entry, three local presets, validation, request errors, and a local-only disclaimer.
- **AC2 — orchestration and isolation:** the live ticket endpoint runs the actual SDK and isolated Agent Board lifecycle; the browser presents plan, project ID, and task state without board mutation controls.
- **AC3 — Worker:** live timeline, read-only query evidence, source snapshot, and raw SDK JSONL are available in the saved run.
- **AC4 — Verifier and correction:** independent programmatic/semantic outcome and criterion evidence are shown; a queued correction can be advanced once, while exhausted/failed correction stays in human review with original history retained.
- **AC5 — live state:** the ticket view consumes actual SSE events and persisted terminal results; health, loading, empty, and error states are visible.
- **AC6 — replay:** two real Task 2 recordings and one real Task 3 Web-submitted recording ship as read-only server fixtures and work in a clean Compose volume; replay requests cannot call SDKs or Agent Board.

The UI uses the byte-for-byte BenYan AI design-system snapshot in `web/src/design-system/`. Runtime tickets and their correction results are synthetic non-code work: the Agent Board task description records that exception, the source snapshot hash identifies the input, and the result artifact hash identifies the output. No Git baseline is fabricated for those customer-service tasks.

## Architecture and artifacts

The API and deterministic workflow are under `server/`; UI sources are under `web/src/`; browser and HTTP evidence is under `artifacts/task3-web/`. Previous backend raw traces remain under `artifacts/backend-smoke/`. See [architecture](docs/architecture.md), [SDK selection](docs/sdk-selection.md), and [AGENTS.md](AGENTS.md) for engineering boundaries and role rules.
