import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('web runs one real three-role workflow and records its terminal result', async ({ page }) => {
  test.skip(process.env.AGENTDECK_LIVE_E2E !== '1', 'real SDK run is an explicit release verification');
  await page.goto('/');
  await page.getByLabel('客户描述').fill('请帮林女士确认订单 OD-24081 的配送状态，以及当前退货申请期限。');
  await page.getByRole('button', { name: '创建工单' }).click();
  await expect(page.getByRole('button', { name: '启动协作' })).toBeVisible();
  await page.getByRole('button', { name: '启动协作' }).click();
  const ticketId = await page.locator('.metadata').getByText(/^tkt_/).textContent();
  if (!ticketId) throw new Error('New ticket id not found');
  const deadline = Date.now() + 300_000;
  let replay: { ticket: { status: string }; events: Array<{ type: string }>; rawEventFiles?: Record<string, string> } | undefined;
  while (Date.now() < deadline) {
    const response = await page.request.get(`/api/v1/tickets/${ticketId}/replay`);
    if (response.ok()) {
      const candidate = await response.json() as { ticket: { status: string }; events: Array<{ type: string }>; rawEventFiles?: Record<string, string> };
      if (['completed', 'failed'].includes(candidate.ticket.status)) { replay = candidate; break; }
    }
    await page.waitForTimeout(1_000);
  }
  if (!replay) throw new Error(`Ticket ${ticketId} did not reach a terminal state in five minutes`);
  await mkdir('artifacts/task3-web', { recursive: true });
  await writeFile(`artifacts/task3-web/live-web-run-${ticketId}.json`, `${JSON.stringify(replay, null, 2)}\n`);
  await page.screenshot({ path: `artifacts/task3-web/live-web-run-${replay.ticket.status}.png`, fullPage: true });
  expect(replay.ticket.status, `Live SDK workflow terminal state; events=${replay.events.map((event: { type: string }) => event.type).join(',')}`).toBe('completed');
  for (const role of ['orchestrator', 'worker', 'verifier']) expect(replay.rawEventFiles?.[role]?.length ?? 0).toBeGreaterThan(0);
  await expect(page.locator('.timeline')).toContainText('ticket · completed');
  await expect(page.getByText('结果制品 SHA-256')).toBeVisible();
});
