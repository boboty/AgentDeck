import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ThreadEvent, ThreadItem } from "@openai/codex-sdk";

export interface ToolEventSummary {
  eventType: string;
  itemType: string;
  name: string;
  status: string;
}

export function summarizeToolEvent(event: ThreadEvent): ToolEventSummary | undefined {
  if (event.type !== "item.started" && event.type !== "item.updated" && event.type !== "item.completed") {
    return undefined;
  }

  const item: ThreadItem = event.item;
  if (item.type === "command_execution") {
    return {
      eventType: event.type,
      itemType: item.type,
      name: item.command,
      status: item.status,
    };
  }

  if (item.type === "mcp_tool_call") {
    return {
      eventType: event.type,
      itemType: item.type,
      name: `${item.server}/${item.tool}`,
      status: item.status,
    };
  }

  return undefined;
}

export async function appendRawEvent(path: string, event: ThreadEvent, secret?: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const serialized = JSON.stringify(event);
  const safeSerialized = secret ? serialized.split(secret).join("[REDACTED]") : serialized;
  await appendFile(path, `${safeSerialized}\n`, { encoding: "utf8", mode: 0o600 });
}
