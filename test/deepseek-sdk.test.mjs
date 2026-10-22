import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { Codex } from "@openai/codex-sdk";

function sendEvents(response, events) {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const event of events) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  response.end();
}

function responseItem(text) {
  return { id: "msg_final", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text }] };
}

function finishResponse(id, output) {
  return { id, object: "response", created_at: 2, status: "completed", model: "deepseek-flash", output };
}

test("Codex SDK sends isolated DeepSeek Responses requests, uses a tool, and keeps roles in separate threads", async () => {
  const isolatedHome = await mkdtemp(join(tmpdir(), "agentdeck-deepseek-sdk-"));
  const requests = [];
  let nextResponse = 0;
  const server = createServer(async (request, response) => {
    let bodyText = "";
    for await (const chunk of request) bodyText += chunk;
    const body = JSON.parse(bodyText);
    requests.push({ authorization: request.headers.authorization, body, bodyText });
    nextResponse += 1;
    const sequence = nextResponse;
    if (sequence % 2 === 1) {
      const call = { id: `fc_${sequence}`, type: "function_call", call_id: `call_${sequence}`, name: "exec_command", arguments: JSON.stringify({ cmd: 'if [ -n "$DEEPSEEK_API_KEY" ]; then printf leaked; else printf scrubbed; fi' }) };
      sendEvents(response, [
        { type: "response.created", response: { id: `resp_${sequence}`, object: "response", created_at: 1, status: "in_progress", model: body.model, output: [] } },
        { type: "response.output_item.added", output_index: 0, item: { ...call, arguments: "" } },
        { type: "response.function_call_arguments.delta", item_id: call.id, output_index: 0, delta: call.arguments },
        { type: "response.function_call_arguments.done", item_id: call.id, output_index: 0, arguments: call.arguments },
        { type: "response.output_item.done", output_index: 0, item: call },
        { type: "response.completed", response: finishResponse(`resp_${sequence}`, [call]) },
      ]);
      return;
    }
    const answer = responseItem('{"ok":true}');
    const done = finishResponse(`resp_${sequence}`, [answer]);
    sendEvents(response, [
      { type: "response.created", response: { ...done, status: "in_progress", output: [] } },
      { type: "response.output_item.added", output_index: 0, item: { ...answer, content: [] } },
      { type: "response.output_text.delta", item_id: answer.id, output_index: 0, content_index: 0, delta: '{"ok":true}' },
      { type: "response.output_text.done", item_id: answer.id, output_index: 0, content_index: 0, text: '{"ok":true}' },
      { type: "response.output_item.done", output_index: 0, item: answer },
      { type: "response.completed", response: done },
    ]);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const apiKey = "fake-test-only-never-a-real-secret";
  const allEvents = [];
  const threadIds = [];
  try {
    for (const role of ["worker", "verifier"]) {
      const model = role === "worker" ? "deepseek-flash" : "deepseek-v4-pro";
      const codex = new Codex({
        config: {
          model_provider: "deepseek",
          shell_environment_policy: { ignore_default_excludes: false, exclude: ["DEEPSEEK_API_KEY"] },
          model_providers: { deepseek: { name: "DeepSeek", base_url: `http://127.0.0.1:${address.port}`, env_key: "DEEPSEEK_API_KEY", wire_api: "responses" } },
        },
        env: { PATH: process.env.PATH, HOME: process.env.HOME, CODEX_HOME: isolatedHome, DEEPSEEK_API_KEY: apiKey },
      });
      const thread = codex.startThread({ model, modelReasoningEffort: "high", sandboxMode: "read-only", approvalPolicy: "never", networkAccessEnabled: false });
      const { events } = await thread.runStreamed(`You are the independent ${role}; call exec_command once, then return {"ok":true}.`, {
        outputSchema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } }, additionalProperties: false },
        signal: AbortSignal.timeout(30_000),
      });
      for await (const event of events) {
        allEvents.push(event);
        if (event.type === "thread.started") threadIds.push(event.thread_id);
      }
    }
    assert.equal(requests.length, 4);
    for (const [index, request] of requests.entries()) {
      assert.equal(request.authorization, `Bearer ${apiKey}`);
      assert.equal(request.body.stream, true);
      assert.equal(request.body.reasoning.effort, "high");
      assert.equal(request.body.text.format.type, "json_schema");
      assert.ok(!request.bodyText.includes(apiKey));
      assert.ok(!request.body.tools.some((tool) => tool.name?.startsWith("mcp__")));
      assert.ok(!request.body.tools.some((tool) => /aboard|board/i.test(tool.name ?? "")));
      if (index < 2) assert.equal(request.body.model, "deepseek-flash");
      else assert.equal(request.body.model, "deepseek-v4-pro");
    }
    assert.equal(new Set(threadIds).size, 2);
    const toolEvents = allEvents.filter((event) => event.type === "item.completed" && event.item.type === "command_execution");
    assert.equal(toolEvents.length, 2);
    assert.ok(toolEvents.every((event) => event.item.aggregated_output.includes("scrubbed")));
    assert.ok(toolEvents.every((event) => !event.item.aggregated_output.includes("leaked")));
    assert.ok(!JSON.stringify(allEvents).includes(apiKey));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(isolatedHome, { recursive: true, force: true });
  }
});
