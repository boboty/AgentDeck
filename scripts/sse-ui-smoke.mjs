import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const root = process.cwd();
const replayPath = resolve(root, 'artifacts/task3-web/live-web-run-tkt_b2755e67-af0f-4eb5-99d9-dd132716b94a.json');
const replayBytes = await readFile(replayPath);
const replay = JSON.parse(replayBytes.toString('utf8'));
const requiredTypes = ['plan.validated', 'agent.completed', 'agent.tool', 'worker.proposal', 'verifier.programmatic', 'verifier.semantic'];
const absent = requiredTypes.filter((type) => !replay.events.some((event) => event.type === type));
if (absent.length) throw new Error(`Saved real run does not contain required SSE event types: ${absent.join(', ')}`);

const dataDir = await mkdtemp(resolve(tmpdir(), 'agentdeck-sse-ui-'));
const ticket = { ...replay.ticket, status: 'in_progress' };
const eventsPath = resolve(dataDir, ticket.eventsFile);
await mkdir(resolve(dataDir, 'tickets', ticket.id), { recursive: true });
await writeFile(resolve(dataDir, 'tickets.json'), `${JSON.stringify([ticket], null, 2)}\n`);
await writeFile(eventsPath, `${JSON.stringify(replay.events[0])}\n`);

const portProbe = createServer();
await new Promise((resolveListen, reject) => portProbe.listen(0, '127.0.0.1', resolveListen).once('error', reject));
const port = portProbe.address().port;
await new Promise((resolveClose) => portProbe.close(resolveClose));
const child = spawn(process.execPath, ['dist/server/index.js'], {
  cwd: root,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), AGENTDECK_APP_ROOT: root, AGENTDECK_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
let browser;
const result = { result: 'FAIL', source: replayPath, fixtureSha256: createHash('sha256').update(replayBytes).digest('hex'), ticketId: ticket.id, stream: {}, requiredTypes, observed: [] };
try {
  const base = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { healthy = (await fetch(`${base}/api/v1/health`)).ok; break; }
    catch { await new Promise((resolveWait) => setTimeout(resolveWait, 200)); }
  }
  if (!healthy) throw new Error(`Isolated SSE server failed to start: ${logs}`);

  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', headless: true });
  const page = await browser.newPage();
  const streamResponsePromise = page.waitForResponse((response) => response.url().includes(`/api/v1/tickets/${ticket.id}/events/stream`));
  await page.goto(base);
  await page.locator('.queue-item').filter({ hasText: ticket.text }).click();
  const streamResponse = await streamResponsePromise;
  result.stream = { status: streamResponse.status(), contentType: streamResponse.headers()['content-type'] };
  if (streamResponse.status() !== 200 || !result.stream.contentType?.startsWith('text/event-stream')) throw new Error('Browser did not receive an HTTP text/event-stream response');
  await page.locator('.timeline li').filter({ hasText: 'ticket · created' }).waitFor({ state: 'visible' });

  // Deliver the rest of a saved real run only after the browser has opened the real server SSE endpoint.
  const remaining = replay.events.slice(1);
  await writeFile(eventsPath, `${remaining.map((event) => JSON.stringify(event)).join('\n')}\n`, { flag: 'a' });
  ticket.status = 'completed';
  await writeFile(resolve(dataDir, 'tickets.json'), `${JSON.stringify([ticket], null, 2)}\n`);

  for (const type of requiredTypes) {
    const count = replay.events.filter((event) => event.type === type).length;
    const rows = page.locator(`.timeline li[data-event-type="${type}"]`);
    await rows.first().waitFor({ state: 'visible', timeout: 10_000 });
    const observedCount = await rows.count();
    if (observedCount !== count) throw new Error(`Expected ${count} live ${type} rows from the persisted SSE fixture; observed ${observedCount}`);
    const text = await rows.allTextContents();
    if (type === 'verifier.programmatic' && !text.some((value) => value.includes('程序检查 7 项 · PASS'))) throw new Error('Programmatic verification row did not display all seven passing checks');
    result.observed.push({ type, expected: count, displayed: observedCount, text });
  }
  result.result = 'PASS';
  await mkdir(resolve(root, 'artifacts/task3-web'), { recursive: true });
  await writeFile(resolve(root, 'artifacts/task3-web/live-sse-ui-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
  result.serverLogs = logs;
  await mkdir(resolve(root, 'artifacts/task3-web'), { recursive: true });
  await writeFile(resolve(root, 'artifacts/task3-web/live-sse-ui-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
  throw error;
} finally {
  await browser?.close();
  child.kill('SIGTERM');
  await new Promise((resolveExit) => child.once('exit', resolveExit));
  await rm(dataDir, { recursive: true, force: true });
}
