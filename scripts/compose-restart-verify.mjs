import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4317';
const project = process.env.COMPOSE_PROJECT ?? 'agentdeck-task3-check';
const ticketId = process.env.TICKET_ID;
if (!ticketId) throw new Error('Set TICKET_ID to a persisted Compose runtime ticket');
async function get(path) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}
const before = { ticket: await get(`/api/v1/tickets/${ticketId}`), replay: await get(`/api/v1/tickets/${ticketId}/replay`) };
if (!['completed', 'failed'].includes(before.ticket.status)) throw new Error('Persisted runtime ticket is not terminal');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const beforeDigest = hash({ ticket: before.ticket, events: before.replay.events, files: before.replay.files, rawEventFiles: before.replay.rawEventFiles });
execFileSync('docker', ['compose', '-p', project, 'restart', 'app'], { stdio: 'inherit', env: process.env });
let healthy = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try { const health = await get('/api/v1/health'); if (health.status === 'ok') { healthy = true; break; } }
  catch { continue; }
  await new Promise(resolve => setTimeout(resolve, 1_000));
}
if (!healthy) throw new Error('Compose app did not return healthy after restart');
const after = { ticket: await get(`/api/v1/tickets/${ticketId}`), replay: await get(`/api/v1/tickets/${ticketId}/replay`) };
const afterDigest = hash({ ticket: after.ticket, events: after.replay.events, files: after.replay.files, rawEventFiles: after.replay.rawEventFiles });
if (beforeDigest !== afterDigest) throw new Error('Ticket and replay changed across app restart');
const report = { result: 'PASS', project, ticketId, status: after.ticket.status, eventCount: after.replay.events.length, rawAgentRoles: Object.keys(after.replay.rawEventFiles ?? {}), replayFileCount: Object.keys(after.replay.files ?? {}).length, beforeDigest, afterDigest, identical: beforeDigest === afterDigest };
await mkdir('artifacts/task3-web', { recursive: true });
await writeFile('artifacts/task3-web/compose-restart-persistence.json', `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
