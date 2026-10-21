# Agent SDK selection

Decision date: 2026-10-22. Sources were checked against the package registry and the official project documentation/source listed below. The selected runtime is **`@openai/codex-sdk` 0.163.0**, paired with the installed `codex` CLI 0.163.0.

## Candidate comparison

| Candidate | Session, tools, events | Model and authentication fit here | Assessment |
| --- | --- | --- | --- |
| Pi TypeScript SDK (`@earendil-works/pi-coding-agent`; `@earendil-works/pi-ai`) | In-process TypeScript agent/session API; independent sessions, configurable tools, streamed lifecycle/tool events, and persisted or in-memory session managers. | Official Pi AI docs list OpenAI OAuth (Sign in with ChatGPT) and an OpenAI Codex legacy OAuth provider. The legacy provider is marked superseded and its provider note says it exposes GPT‑5.x Codex models. The modern OpenAI OAuth provider is a plausible subscription path, but its exact compatibility with `gpt-6-luna` plus high reasoning was not exercised here. Pi's supported flow is Pi-managed and writes credentials to Pi's own `auth.json`; docs do not promise direct reuse of the existing Codex CLI login. | Strong extensible harness and good portability. It could be revisited after a separately authorized Pi OAuth/model compatibility check. It is not selected because the current task already has a successful official SDK path with the exact local login, model, and reasoning configuration. |
| OpenAI Agents SDK for TypeScript (`@openai/agents`) | Code-first tools, handoffs, guardrails, sessions, streamed run-item events, tracing, and multi-agent patterns. | Official docs configure the OpenAI provider with `OPENAI_API_KEY` or a caller-supplied OpenAI client. This environment has no API key and its known-good credential is the Codex/ChatGPT CLI login. The SDK docs do not state that this CLI credential authenticates the Agents SDK or that this SDK runs `gpt-6-luna` under the current account. | Rich fit for API-key-backed service deployments; would require adding a distinct credential path and cannot be proven against the assigned model/account now. Not selected. |
| OpenAI Codex TypeScript SDK (`@openai/codex-sdk`) | Official Node SDK for independent threads, `run()` / `runStreamed()`, shell and MCP tool execution, and typed JSONL lifecycle/tool events. It delegates execution to the matching Codex CLI instead of implementing a loop in this project. | Uses the local Codex CLI installation and its official login/configuration. The installed CLI is 0.163.0, `codex login status` reports ChatGPT login, and the SDK version 0.163.0 depends on matching `@openai/codex` 0.163.0. The required `gpt-6-luna` with `modelReasoningEffort: high` was exercised through two SDK-created threads with real shell tool calls; see `artifacts/sdk-probe/summary.json` and role JSONL files. | Selected. It is the only candidate proven in the current environment with the assigned model, authentication, Node runtime, real tool execution, independent contexts, and inspectable raw events. It is intentionally a thin official SDK around the Codex CLI protocol, not a locally written agent loop. |

## Runtime and governance boundary

The SDK owns one role's model context, tool execution, and raw event stream. AgentDeck owns role selection, task decomposition and scheduling, dependencies, persistence, correction policy, and the UI. Aboard owns the project task/fact contract and its four states; it does not run agents or enforce app-level policies. Each role gets a separately created SDK thread. A Worker never serves as its Verifier.

This choice is evidence-led for the local demo and the mandated account/model. It does not claim the Codex SDK is provider-neutral. Revisit it only if a later approved task requires a different provider or the runtime moves to an API-key-backed service environment.

## Reproduction

```sh
npm ci
codex login status
make sdk-probe
```

The probe creates separate `Codex` and thread instances for Worker and Verifier, selects `gpt-6-luna` / `high`, and asks each to read a role-specific local marker through the agent's shell tool. The JSONL files preserve every SDK event as emitted. The summary records role, thread ID, tool-event summaries, event file, and final response. It stores no auth token. SDK sessions follow the installed Codex SDK's normal persistence behavior under `CODEX_HOME`; the probe summary itself stores no path to credential files.

The probe is an SDK compatibility check. It is not the customer-support end-to-end acceptance run, does not call aboard, and does not count as the later backend task's evidence.

## Official sources and versions

- Codex SDK: [TypeScript SDK docs](https://developers.openai.com/codex/sdk/), [source README](https://github.com/openai/codex/blob/main/sdk/typescript/README.md), [source tree](https://github.com/openai/codex/tree/main/sdk/typescript); selected npm and CLI version `0.163.0`.
- Pi: [`packages/coding-agent/docs/sdk.md`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md), [`packages/ai/README.md`](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md); checked npm package version `@earendil-works/pi-coding-agent@1.3.0`. Provider docs checked 2026-10-22.
- OpenAI Agents SDK: [models/providers](https://openai.github.io/openai-agents-js/guides/models/), [tools](https://openai.github.io/openai-agents-js/guides/tools/), [running agents](https://openai.github.io/openai-agents-js/guides/running-agents/); checked npm version `@openai/agents@0.21.0`.
- Official SDK guidance: [OpenAI SDKs and CLI](https://developers.openai.com/api/docs/libraries) distinguishes direct API SDKs, CLI, and the Agents SDK according to application requirements.
