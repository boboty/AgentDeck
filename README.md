# AgentDeck

AgentDeck is a local React/Vite and lightweight Node.js customer-support collaboration demo. Work is staged so the real model collaboration backend is proven before its Web event viewer and replay are built.

This checkout currently contains the SDK selection and engineering baseline only. It does not yet include the product API or UI.

## Requirements

- Node.js 24 LTS and npm 11
- Codex CLI 0.163.0, logged in through the supported Codex/ChatGPT login
- Docker CLI may be installed for later Compose work; this machine currently has no running/reachable Docker daemon

## Install and verify

```sh
npm ci
make check
```

`make check` runs ESLint, strict TypeScript typechecking, a TypeScript build of the SDK probe/runtime event journal, and focused Node tests. No Vite build is present at this phase because the Web task has not started.

To reproduce the real model, shell-tool, independent-thread, and JSONL event probe:

```sh
codex login status
make sdk-probe
```

This invokes the configured model and writes raw per-role SDK events and a summary under `artifacts/sdk-probe/`. It requires a working Codex login and network/model availability. No credential file or token needs to be copied into this project.

## Current architecture and next boundaries

Read [AGENTS.md](AGENTS.md), [architecture](docs/architecture.md), and [SDK selection](docs/sdk-selection.md). The next task implements the actual Orchestrator/Worker/independent Verifier backend and a successful persisted demo run. A separate later task adds ticket entry, live event display, and read-only replay. The frozen product acceptance criteria remain AC1–AC6.
