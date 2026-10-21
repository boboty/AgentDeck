import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const port = 4391;
const dataDir = await mkdtemp(resolve(tmpdir(), 'agentdeck-http-smoke-'));
await mkdir('artifacts/task3-web', { recursive: true });
const child = spawn(process.execPath, ['dist/server/index.js'], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), AGENTDECK_APP_ROOT: process.cwd(), AGENTDECK_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
child.stdout.on('data', chunk => { logs += chunk.toString(); });
child.stderr.on('data', chunk => { logs += chunk.toString(); });
const records = [];
try {
  const base = `http://127.0.0.1:${port}`;
  let health;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { health = await fetch(`${base}/api/v1/health`, { headers: { 'x-request-id': 'smoke-health-001' } }); break; }
    catch { await new Promise(resolveWait => setTimeout(resolveWait, 200)); }
  }
  if (!health) throw new Error('Server did not become healthy');
  records.push({ name: 'health', status: health.status, requestId: health.headers.get('x-request-id'), body: await health.json() });
  if (health.status !== 200 || records.at(-1).body.status !== 'ok') throw new Error('Health check failed');
  const home = await fetch(base);
  const html = await home.text();
  records.push({ name: 'web-home', status: home.status, title: html.includes('AgentDeck') });
  if (home.status !== 200 || !html.includes('AgentDeck')) throw new Error('Web home failed');
  const list = await fetch(`${base}/api/v1/recordings`);
  const recordings = await list.json();
  records.push({ name: 'bundled-recordings', status: list.status, ids: recordings.map(item => item.id) });
  if (list.status !== 200 || recordings.length < 2) throw new Error('Bundled recordings missing');
  const replay = await fetch(`${base}/api/v1/recordings/success/replay`);
  const saved = await replay.json();
  records.push({ name: 'static-replay', status: replay.status, mode: saved.mode, ticketId: saved.ticket.id, eventCount: saved.events.length, fileCount: Object.keys(saved.files).length });
  if (replay.status !== 200 || saved.mode !== 'replay' || !saved.events.length) throw new Error('Replay fetch failed');
  const create = await fetch(`${base}/api/v1/tickets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Smoke check ticket verifies the local event stream endpoint.' }) });
  const ticket = await create.json();
  const abort = new AbortController();
  const stream = await fetch(`${base}/api/v1/tickets/${ticket.id}/events/stream`, { signal: abort.signal });
  const reader = stream.body.getReader();
  const first = await reader.read();
  abort.abort();
  const firstEvent = new TextDecoder().decode(first.value);
  records.push({ name: 'sse-live-event', status: stream.status, ticketId: ticket.id, hasCreated: firstEvent.includes('ticket.created') });
  if (stream.status !== 200 || !firstEvent.includes('ticket.created')) throw new Error('SSE event missing');
  await writeFile('artifacts/task3-web/http-smoke.json', `${JSON.stringify({ result: 'PASS', checks: records }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
} catch (error) {
  await writeFile('artifacts/task3-web/http-smoke.json', `${JSON.stringify({ result: 'FAIL', checks: records, error: error instanceof Error ? error.message : String(error), logs }, null, 2)}\n`);
  throw error;
} finally {
  child.kill('SIGTERM');
  await new Promise(resolveWait => child.once('exit', resolveWait));
  await rm(dataDir, { recursive: true, force: true });
}
