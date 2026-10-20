// Benchmark: recall on fabricated numbers, false-positive rate on correct answers. Deterministic (seed 42), no API calls.
//   node bench/run.js [--seed N] [--n N] [--show]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../src/index.js';
import { generateCases, CORRUPTIONS } from './generate.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SEED = arg('--seed', 42), N = arg('--n', 200);
const cases = generateCases(SEED, N);

const pct = (a, b) => `${((100 * a) / b).toFixed(1)}%`;
const row = { correct: { flagged: 0, total: 0, numbers: 0, numbersFlagged: 0 } };
for (const k of [...CORRUPTIONS, 'wrong_row', 'derived_sum']) row[k] = { caught: 0, total: 0, misses: [] };

const t0 = performance.now();
for (const c of cases) {
  const opts = { question: c.question };
  const ok = check(c.correct, c.sources, opts);
  row.correct.total++;
  row.correct.numbers += ok.vouched.length + ok.unvouched.length;
  row.correct.numbersFlagged += ok.unvouched.length;
  if (!ok.ok) { row.correct.flagged++; if (process.argv.includes('--show')) console.log('FP', c.id, ok.unvouched); }
  for (const [type, v] of Object.entries(c.variants)) {
    const r = check(v.answer, c.sources, opts);
    row[type].total++;
    if (r.unvouched.some((u) => u.raw === v.token)) row[type].caught++;
    else row[type].misses.push({ id: c.id, token: v.token });
  }
}
const ms = performance.now() - t0;

const fab = CORRUPTIONS.reduce((s, k) => ({ caught: s.caught + row[k].caught, total: s.total + row[k].total }), { caught: 0, total: 0 });
const lines = [
  `numguard benchmark — seed ${SEED}, ${N} cases, ${N * 8} checks in ${ms.toFixed(0)} ms`,
  '',
  '| Set | What the answer contains | Result |',
  '|---|---|---|',
  `| Correct answers | only table values, restated with rounding, %, k/M, $ | ${pct(row.correct.flagged, row.correct.total)} falsely flagged (${row.correct.flagged}/${row.correct.total} answers; ${row.correct.numbersFlagged}/${row.correct.numbers} numbers) |`,
  ...CORRUPTIONS.map((k) => `| ${k} | one number corrupted this way | ${pct(row[k].caught, row[k].total)} caught (${row[k].caught}/${row[k].total}) |`),
  `| **All fabricated** | ${CORRUPTIONS.length} corruption types above | **${pct(fab.caught, fab.total)} caught (${fab.caught}/${fab.total})** |`,
  `| wrong_row (limit) | a real value from a different row | ${pct(row.wrong_row.caught, row.wrong_row.total)} caught (${row.wrong_row.caught}/${row.wrong_row.total}) |`,
  `| derived_sum (by design) | a correct sum the agent did in its head | ${pct(row.derived_sum.caught, row.derived_sum.total)} flagged (${row.derived_sum.caught}/${row.derived_sum.total}) |`,
];
console.log(lines.join('\n'));
if (process.argv.includes('--show')) for (const k of [...CORRUPTIONS, 'wrong_row']) console.log(k, 'misses:', row[k].misses.slice(0, 10));

const out = { seed: SEED, n: N, fabricated_recall: fab.caught / fab.total, false_positive_rate: row.correct.flagged / row.correct.total,
  by_type: Object.fromEntries(Object.entries(row).map(([k, v]) => [k, { ...v, misses: v.misses?.length }])) };
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'results.json'), JSON.stringify(out, null, 2) + '\n');
