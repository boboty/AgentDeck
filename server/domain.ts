import type { RuntimeEventType } from "../src/runtime/event-types.js";
export type { RuntimeEventType } from "../src/runtime/event-types.js";

export const SCENARIOS = {
  ordinary: {
    title: "普通咨询：订单配送进度",
    ticketText: "请帮林女士确认订单 OD-24081 的配送状态，以及当前退货申请期限。",
  },
  repeat_complaint: {
    title: "重复投诉：佩戴不适未收到进展",
    ticketText: "林女士再次联系，订单 OD-24081 的蕾丝前额佩戴不适，之前反映两次仍未收到进展。她现在要求退货，请结合历史和规则给出安全建议。",
  },
  rule_conflict: {
    title: "业务规则冲突：包装完整与试戴退货",
    ticketText: "林女士在签收第 6 天申请退货，称只试戴一次、外包装完好，且同一佩戴不适问题已有两次历史投诉。她要求确认可以全额退款，请核对冲突规则并提出建议。",
  },
} as const;

export type Scenario = keyof typeof SCENARIOS;
export type QueryName = "orders" | "history" | "policies" | "conflictCases";

export interface Ticket {
  id: string;
  text: string;
  scenario?: Scenario;
  createdAt: string;
  status: "created" | "queued" | "in_progress" | "completed" | "failed";
  taskId?: string;
  projectId?: string;
  eventsFile: string;
  sourceSnapshotHash?: string;
  resultHash?: string;
  recommendation?: Record<string, unknown>;
  verifier?: Record<string, unknown>;
  error?: string;
}

export interface AgentPlan {
  summary: string;
  orderId: string | null;
  customer: string | null;
  queries: QueryName[];
  taskTitle: string;
  acceptanceCriteria: string[];
}

export interface Recommendation {
  summary: string;
  customerSafeText: string;
  disposition: "information" | "follow_up" | "supervisor_review";
  citations: Array<{ sourceId: string; reason: string }>;
  openQuestions: string[];
}

export interface SemanticReview {
  verdict: "PASS" | "FAIL";
  rationale: string;
  criteria: Array<{ criterion: string; verdict: "PASS" | "FAIL"; evidence: string }>;
}

export interface RuntimeEvent {
  id: number;
  ticket_id: string;
  at: string;
  type: RuntimeEventType;
  role?: "orchestrator" | "worker" | "verifier" | "system";
  data: Record<string, unknown>;
}
