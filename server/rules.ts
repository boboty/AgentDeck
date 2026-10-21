import { createHash } from "node:crypto";
import type { AgentPlan, QueryName, Recommendation, Ticket } from "./domain.js";

export type SourceSnapshot = Record<QueryName, Array<Record<string, unknown>>>;
export interface QueryResult { query: QueryName; snapshotHash: string; records: Array<Record<string, unknown>> }
export const RETURN_WINDOW_DAYS = 7;

export function hashSnapshotBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateQueryResults(snapshot: SourceSnapshot, snapshotHash: string, queries: QueryName[], results: QueryResult[]): boolean {
  if (new Set(queries).size !== queries.length || results.length !== queries.length) return false;
  return queries.every((query) => {
    const result = results.find((item) => item.query === query);
    return Boolean(result && result.snapshotHash === snapshotHash && JSON.stringify(result.records) === JSON.stringify(snapshot[query]));
  });
}

function daysBetweenCalendarDates(start: string, end: string): number {
  const parse = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    if (!year || !month || !day) throw new Error("Invalid calendar date");
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(end) - parse(start)) / 86_400_000);
}

function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function deriveDeterministicFacts(ticket: Ticket, plan: AgentPlan, snapshot: SourceSnapshot, snapshotHash: string): Record<string, unknown> {
  const order = snapshot.orders.find((row) => row.id === plan.orderId);
  if (plan.orderId && !order) throw new Error("Planned order was not present in the authoritative source snapshot");
  const customer = plan.customer ?? (typeof order?.customer === "string" ? order.customer : null);
  const historyQueried = plan.queries.includes("history");
  const historyCases = historyQueried
    ? snapshot.history.filter((row) => row.customer === customer || row.orderId === plan.orderId).flatMap((row) => typeof row.case === "string" ? [row.case] : [])
    : null;
  const ticketDate = ticket.createdAt.slice(0, 10);
  const deliveredAt = typeof order?.deliveredAt === "string" ? order.deliveredAt : null;
  const returnEligibleUntil = typeof order?.returnEligibleUntil === "string" ? order.returnEligibleUntil : null;
  const computedReturnEligibleUntil = deliveredAt ? addCalendarDays(deliveredAt, RETURN_WINDOW_DAYS) : null;
  return {
    orderId: order?.id ?? null,
    customer,
    ticketDate,
    deliveredAt,
    daysSinceDelivery: deliveredAt ? daysBetweenCalendarDates(deliveredAt, ticketDate) : null,
    returnEligibleUntil,
    policyWindowDays: RETURN_WINDOW_DAYS,
    computedReturnEligibleUntil,
    returnDeadlineMatchesPolicy: Boolean(returnEligibleUntil && computedReturnEligibleUntil && returnEligibleUntil === computedReturnEligibleUntil),
    returnEligible: computedReturnEligibleUntil ? ticketDate <= computedReturnEligibleUntil : false,
    historyQueried,
    matchingHistoryCases: historyCases,
    sourceSnapshotHash: snapshotHash,
    ruleIds: snapshot.policies.filter((row) => typeof row.id === "string").map((row) => row.id),
  };
}

export function authoritativeSourceIds(queries: QueryName[], snapshot: SourceSnapshot): string[] {
  return [...new Set(queries.flatMap((query) => snapshot[query].flatMap((row) => [row.id, row.case]).filter((id): id is string => typeof id === "string")))];
}

export function validateRecommendation(recommendation: Recommendation, sourceIds: string[]): boolean {
  return Boolean(recommendation.summary.trim() && recommendation.customerSafeText.trim() && recommendation.citations.length > 0
    && recommendation.citations.every((citation) => sourceIds.includes(citation.sourceId))
    && !/退款已批准|已为您退款|已赔付/.test(recommendation.customerSafeText));
}

export function expectedReturnEligibility(snapshot: SourceSnapshot, facts: Record<string, unknown>): boolean {
  return typeof facts.ticketDate === "string" && typeof facts.computedReturnEligibleUntil === "string" && facts.ticketDate <= facts.computedReturnEligibleUntil;
}
