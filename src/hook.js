// Claude Code Stop hook. Reads the hook input JSON on stdin ({ transcript_path, stop_hook_active,
// last_assistant_message, ... }), checks the final answer against every tool result in the session, and
// blocks the stop with { decision: "block", reason } when a number is unvouched.
import fs from 'node:fs';
import { check, formatReport } from './index.js';
import { readTranscript } from './transcript.js';

export function runHook(input, opts = {}) {
  // Never loop: if Claude is already continuing because of a Stop hook, let it stop.
  if (input.stop_hook_active) return null;
  let t = { sources: [], question: '', answer: '' };
  if (input.transcript_path && fs.existsSync(input.transcript_path)) t = readTranscript(input.transcript_path);
  const answer = input.last_assistant_message ?? t.answer;
  if (!answer) return null;
  const r = check(answer, t.sources, { ...opts, question: t.question });
  if (r.ok) return null;
  return {
    decision: 'block',
    reason: `${formatReport(r)}\n(Ignored: numbers from the user's messages, years, dates, times, ordinals, list markers, versions, counts 0–${opts.smallMax ?? 3}.)`,
  };
}

export async function hookMain(opts = {}) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { return 0; } // malformed input: never block the user
  const out = runHook(input, opts);
  if (!out) return 0;
  if (opts.warn) { process.stderr.write(out.reason + '\n'); return 0; }
  process.stdout.write(JSON.stringify(out) + '\n');
  return 0;
}
