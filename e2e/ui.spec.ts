import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('bundled replay is readable and does not turn into a live task', async ({ page }) => {
  const created: string[] = [];
  page.on('request', request => { if (request.method() !== 'POST') return; created.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '提交一条本地演示工单' })).toBeVisible();
  await page.getByRole('button', { name: /订单配送与退货期限/ }).click();
  await expect(page.getByText('历史运行记录')).toBeVisible();
  await expect(page.getByText('SAVED EXECUTION')).toBeVisible();
  await expect(page.getByText('协作事件')).toBeVisible();
  await expect(page.getByText('源快照 SHA-256')).toBeVisible();
  await expect(page.getByText('orchestrator · 原始 JSONL')).toBeVisible();
  await page.getByRole('button', { name: /现场运行：配送状态与退货期限/ }).click();
  await expect(page.getByText('tkt_b2755e67-af0f-4eb5-99d9-dd132716b94a', { exact: true })).toBeVisible();
  await expect(page.getByText('512304d0279b4269b0ad318c1c8f1682ebdcadc646b55a0046254a31de2b794c', { exact: true })).toBeVisible();
  const correctionReplay = page.waitForResponse(response => response.url().endsWith('/api/v1/recordings/correction/replay'));
  await page.getByRole('button', { name: /重复投诉与纠正复核/ }).click();
  expect((await (await correctionReplay).json()).ticket.status).toBe('failed');
  await expect(page.getByText('回放', { exact: true })).toBeVisible();
  await expect(page.getByText('HUMAN REVIEW')).toBeVisible();
  expect(created).toEqual([]);
  await mkdir('artifacts/task4-config', { recursive: true });
  await page.screenshot({ path: 'artifacts/task4-config/replay.png', fullPage: true });
});

test('system status presents successful and failed health checks', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '系统状态' }).click();
  await expect(page.getByText('服务正常')).toBeVisible();
  await page.route('**/api/v1/health', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'simulated health outage' } }) }));
  await page.getByRole('button', { name: '重新检查' }).click();
  await expect(page.getByText('服务不可用')).toBeVisible();
  await expect(page.getByText('simulated health outage')).toBeVisible();
});

test('manual intake validates text and adds a live ticket', async ({ page }) => {
  await page.goto('/');
  const submit = page.getByRole('button', { name: '创建工单' });
  await expect(submit).toBeDisabled();
  await page.getByLabel('客户描述').fill('请核实订单 OD-TEST-1207 的配送状态和退货期限。');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('heading', { name: '工单详情' })).toBeVisible();
  await expect(page.getByRole('button', { name: '启动协作' })).toBeVisible();
});
