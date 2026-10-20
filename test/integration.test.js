import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseTranscript } from '../src/transcript.js';
import { runHook } from '../src/hook.js';
import { callTool, TOOLS } from '../src/tools.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BIN = path.join(ROOT, 'bin', 'numguard.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'numguard-'));

// Shape of Claude Code transcript lines (only the fields numguard reads).
const lines = [
  { type: 'user', message: { role: 'user', content: 'What share of our 120 orders were refunded?' } },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'sqlite3 db "select ..."' } }] } },
  { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'refunded|total\n17|120' }] } },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'python -c "print(17/120)"' } }] } },
  { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: '0.14166666666666666' }] }] } },
];
const answerLine = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const writeTranscript = (answer) => {
  const p = path.join(tmp, `t-${Math.random().toString(36).slice(2)}.jsonl`);
  fs.writeFileSync(p, [...lines, answerLine(answer)].map((l) => JSON.stringify(l)).join('\n') + '\n');
  return p;
};

test('transcript parsing collects tool results, user text, and the final answer', () => {
  const t = parseTranscript([...lines, answerLine('17 of 120 orders (14.2%) were refunded.')].map((l) => JSON.stringify(l)).join('\n'));
  assert.equal(t.sources.length, 2);
  assert.match(t.question, /120 orders/);
  assert.equal(t.answer, '17 of 120 orders (14.2%) were refunded.');
});

test('hook passes a vouched answer and blocks a fabricated one', () => {
  assert.equal(runHook({ transcript_path: writeTranscript('17 of 120 orders (14.2%) were refunded.') }), null);
  const out = runHook({ transcript_path: writeTranscript('17 of 120 orders (19%) were refunded.') });
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /19%/);
});

test('hook prefers last_assistant_message and never loops', () => {
  const p = writeTranscript('17 refunds.');
  assert.equal(runHook({ transcript_path: p, last_assistant_message: 'We refunded 23 orders.' }).decision, 'block');
  assert.equal(runHook({ transcript_path: p, last_assistant_message: 'We refunded 23 orders.', stop_hook_active: true }), null);
});

test('hook CLI prints a block decision as JSON on stdout', () => {
  const p = writeTranscript('Refund rate: 31%.');
  const r = spawnSync(process.execPath, [BIN, 'hook'], { input: JSON.stringify({ transcript_path: p, hook_event_name: 'Stop' }), encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).decision, 'block');
});

test('check CLI exit codes', () => {
  const src = path.join(tmp, 'r.csv'), ans = path.join(tmp, 'a.txt');
  fs.writeFileSync(src, 'region,sales\nEast,48210\n');
  fs.writeFileSync(ans, 'East sold 48.2k units.');
  assert.equal(spawnSync(process.execPath, [BIN, 'check', ans, '--source', src]).status, 0);
  fs.writeFileSync(ans, 'East sold 52k units.');
  const bad = spawnSync(process.execPath, [BIN, 'check', ans, '--source', src], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /52k/);
});

test('MCP tool handlers: record then check', () => {
  assert.deepEqual(TOOLS.map((t) => t.name), ['numguard_check', 'numguard_record', 'numguard_reset']);
  callTool('numguard_record', { session: 's1', text: '{"mrr": 18250}' });
  assert.match(callTool('numguard_check', { session: 's1', answer: 'MRR is $18.3k.' }).text, /numguard: ok/);
  assert.match(callTool('numguard_check', { session: 's1', answer: 'MRR is $21k.' }).text, /\$21k/);
  callTool('numguard_reset', { session: 's1' });
  assert.match(callTool('numguard_check', { session: 's1', answer: 'MRR is $18.3k.' }).text, /\$18\.3k/);
});

test('MCP server answers initialize + tools/list over stdio', async () => {
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'numguard_check', arguments: { answer: 'Up 37%.', sources: ['0.21'] } } },
  ];
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [BIN], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  const replies = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout: ' + buf)); }, 5000);
    child.stdout.on('data', (d) => {
      buf += d;
      const got = buf.split('\n').filter(Boolean).map((l) => JSON.parse(l));
      if (got.filter((m) => m.id).length === 3) { clearTimeout(timer); child.kill(); resolve(got); }
    });
    for (const m of msgs) child.stdin.write(JSON.stringify(m) + '\n');
  });
  const byId = Object.fromEntries(replies.map((m) => [m.id, m]));
  assert.equal(byId[1].result.serverInfo.name, 'numguard');
  assert.equal(byId[2].result.tools.length, 3);
  assert.match(byId[3].result.content[0].text, /37%/);
});
