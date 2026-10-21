import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4317';
const project = process.env.COMPOSE_PROJECT ?? 'agentdeck-task3-check';
const checks = [];
async function get(path) {
  const response = await fetch(`${base}${path}`);
  const body = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  checks.push({ path, status: response.status, requestId: response.headers.get('x-request-id'), ok: response.ok });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return body;
}
const health = await get('/api/v1/health');
if (health.status !== 'ok') throw new Error('Container health API returned an unexpected state');
const home = await get('/');
if (!home.includes('AgentDeck')) throw new Error('Container homepage is missing');
const recordings = await get('/api/v1/recordings');
if (recordings.length !== 3) throw new Error('Bundled recordings are not available in this container');
const replay = await get('/api/v1/recordings/success/replay');
if (replay.mode !== 'replay' || replay.events.length !== 18) throw new Error('Bundled replay is incomplete');
const container = execFileSync('docker', ['compose', '-p', project, 'ps', '--format', 'json', 'app'], { encoding: 'utf8' }).trim();
const imageId = execFileSync('docker', ['image', 'inspect', 'agentdeck-local:task3', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
const mounts = JSON.parse(execFileSync('docker', ['inspect', 'agentdeck-task3-check-app-1', '--format', '{{json .Mounts}}'], { encoding: 'utf8' }));
const auth = mounts.find(item => item.Destination === '/home/node/.codex/auth.json');
if (!auth || auth.RW !== false) throw new Error('Codex auth file is not mounted read-only');
await mkdir('artifacts/task3-web', { recursive: true });
const evidencePath = process.env.COMPOSE_SMOKE_OUTPUT ?? 'artifacts/task3-web/compose-smoke.json';
await writeFile(resolve(evidencePath), `${JSON.stringify({ result: 'PASS', project, health, imageId, container, authMount: { destination: auth.Destination, readOnly: !auth.RW }, checks }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ result: 'PASS', health: health.status, recordingCount: recordings.length, replayEvents: replay.events.length, imageId, authMountedReadOnly: !auth.RW }, null, 2)}\n`);
