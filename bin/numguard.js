#!/usr/bin/env node
// numguard CLI.
//   numguard                      start the MCP server on stdio (what `npx -y github:isaacbitran/numguard` runs)
//   numguard mcp                  same
//   numguard check <answer|-> --source <file> [--source <file> ...] [--question <text>] [--small-max N] [--json]
//   numguard hook [--warn] [--small-max N]   Claude Code Stop hook (reads hook JSON on stdin)
import fs from 'node:fs';
import { check, formatReport } from '../src/index.js';

const HELP = `numguard — your agent can't state a number it didn't compute.

Usage:
  numguard check <answer.txt|-> --source <file> [--source <file> ...] [options]
  numguard hook [--warn] [--small-max N]     Claude Code Stop hook (hook JSON on stdin)
  numguard [mcp]                             MCP server on stdio

Options for check:
  --source, -s <file>   tool output to vouch from (CSV, JSON, text); repeatable; "-" reads stdin
  --question <text>     the user's question; numbers in it are not flagged
  --small-max <N>       skip plain integers 0..N (default 3; -1 checks all)
  --no-ignore           check every number (no years/dates/times/ordinals/... rules)
  --json                print the full result as JSON

Exit code: 0 = every number vouched, 1 = unvouched numbers found, 2 = usage error.`;

function parseArgs(argv) {
  const o = { _: [], sources: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source' || a === '-s') o.sources.push(argv[++i]);
    else if (a === '--question' || a === '-q') o.question = argv[++i];
    else if (a === '--small-max') o.smallMax = Number(argv[++i]);
    else if (a === '--json') o.json = true;
    else if (a === '--warn') o.warn = true;
    else if (a === '--no-ignore') o.noIgnore = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else o._.push(a);
  }
  return o;
}

const read = (f) => fs.readFileSync(f === '-' ? 0 : f, 'utf8');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (args.help) { console.log(HELP); return 0; }
  if (!cmd || cmd === 'mcp') { const { mcpMain } = await import('../src/mcp.js'); await mcpMain(); return null; }
  if (cmd === 'hook') {
    const { hookMain } = await import('../src/hook.js');
    return hookMain({ warn: args.warn, ...(Number.isFinite(args.smallMax) ? { smallMax: args.smallMax } : {}) });
  }
  if (cmd === 'check') {
    const file = args._[1];
    if (!file) { console.error(HELP); return 2; }
    const opts = { question: args.question };
    if (Number.isFinite(args.smallMax)) opts.smallMax = args.smallMax;
    if (args.noIgnore) opts.ignore = [];
    const r = check(read(file), args.sources.map(read), opts);
    console.log(args.json ? JSON.stringify(r, null, 2) : formatReport(r));
    return r.ok ? 0 : 1;
  }
  console.error(`unknown command: ${cmd}\n\n${HELP}`);
  return 2;
}

main().then((code) => { if (code !== null) process.exitCode = code; }, (e) => { console.error(e.message); process.exitCode = 2; });
