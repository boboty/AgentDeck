import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { resolve } from "node:path";

export type ModelProvider = "codex" | "deepseek";
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export type AgentRole = "orchestrator" | "worker" | "verifier";
export interface AgentModelConfig {
  provider: ModelProvider;
  baseUrl?: string;
  model?: string;
  effort?: ReasoningEffort;
  apiKey?: string;
}
export type AgentRuntimeConfig = Record<AgentRole, AgentModelConfig>;

const roles: AgentRole[] = ["orchestrator", "worker", "verifier"];
const efforts = new Set<ReasoningEffort>(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    const inner = trimmed.slice(1, -1);
    return trimmed.startsWith('"') ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\\\/g, "\\").replace(/\\"/g, '"') : inner;
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}

export function parseEnvFile(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) parsed[match[1]!] = unquote(match[2]!);
  }
  return parsed;
}

export function loadProjectEnvironment(projectRoot: string, target: NodeJS.ProcessEnv = process.env): void {
  let fileValues: Record<string, string>;
  try {
    fileValues = parseEnvFile(readFileSync(resolve(projectRoot, ".env"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") fileValues = {};
    else throw new Error("Unable to read the project .env file", { cause: error });
  }
  for (const [key, value] of Object.entries(fileValues)) if (target[key] === undefined) target[key] = value;
}

function readBaseConfig(env: NodeJS.ProcessEnv): AgentModelConfig {
  const providerRaw = env.AGENTDECK_MODEL_PROVIDER ?? "codex";
  if (providerRaw !== "codex" && providerRaw !== "deepseek") throw new Error("AGENTDECK_MODEL_PROVIDER must be codex or deepseek");
  const baseUrl = env.AGENTDECK_MODEL_BASE_URL?.trim() || (providerRaw === "deepseek" ? "https://api.deepseek.com" : undefined);
  if (baseUrl) {
    let parsed: URL;
    try { parsed = new URL(baseUrl); } catch { throw new Error("AGENTDECK_MODEL_BASE_URL must be a valid HTTP(S) URL"); }
    const localHttp = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost") || isIP(parsed.hostname) > 0 && (parsed.hostname === "127.0.0.1" || parsed.hostname === "::1"));
    if (parsed.protocol !== "https:" && !localHttp || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("AGENTDECK_MODEL_BASE_URL must use HTTPS, or local HTTP for testing, and contain no credentials, query, or fragment");
  }
  const model = env.AGENTDECK_MODEL?.trim() || (providerRaw === "deepseek" ? "deepseek-flash" : undefined);
  if (model && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) throw new Error("AGENTDECK_MODEL has an invalid model identifier");
  const effortRaw = env.AGENTDECK_MODEL_EFFORT?.trim();
  if (effortRaw && !efforts.has(effortRaw as ReasoningEffort)) throw new Error("AGENTDECK_MODEL_EFFORT is not a supported Codex reasoning effort");
  return { provider: providerRaw, ...(baseUrl ? { baseUrl } : {}), ...(model ? { model } : {}), ...(effortRaw ? { effort: effortRaw as ReasoningEffort } : {}), ...(env.DEEPSEEK_API_KEY?.trim() ? { apiKey: env.DEEPSEEK_API_KEY.trim() } : {}) };
}

export function resolveAgentRuntimeConfig(env: NodeJS.ProcessEnv): AgentRuntimeConfig {
  const base = readBaseConfig(env);
  const result = {} as AgentRuntimeConfig;
  for (const role of roles) {
    const prefix = `AGENTDECK_${role.toUpperCase()}`;
    const model = env[`${prefix}_MODEL`]?.trim() || base.model || (base.provider === "codex" && role !== "orchestrator" ? "gpt-6-luna" : undefined);
    const effortRaw = env[`${prefix}_EFFORT`]?.trim() || base.effort || (base.provider === "codex" && role !== "orchestrator" ? "high" : undefined);
    if (model && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) throw new Error(`${prefix}_MODEL has an invalid model identifier`);
    if (effortRaw && !efforts.has(effortRaw as ReasoningEffort)) throw new Error(`${prefix}_EFFORT is not a supported Codex reasoning effort`);
    result[role] = { ...base, ...(model ? { model } : {}), ...(effortRaw ? { effort: effortRaw as ReasoningEffort } : {}) };
    if (base.provider === "deepseek" && !base.apiKey) throw new Error("DeepSeek is selected but DEEPSEEK_API_KEY is missing; add it to the project .env and restart AgentDeck");
  }
  return result;
}

let activeConfig: AgentRuntimeConfig | undefined;
export function initializeRuntimeConfig(projectRoot: string, env: NodeJS.ProcessEnv = process.env): AgentRuntimeConfig {
  loadProjectEnvironment(projectRoot, env);
  activeConfig = resolveAgentRuntimeConfig(env);
  return activeConfig;
}
export function getRuntimeConfig(): AgentRuntimeConfig {
  if (!activeConfig) throw new Error("AgentDeck runtime model configuration has not been initialized");
  return activeConfig;
}
