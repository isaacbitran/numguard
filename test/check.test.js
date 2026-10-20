import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, parseNumbers, sourceValues } from '../src/index.js';

const raws = (r) => r.unvouched.map((u) => u.raw);

test('a number no tool output produced is flagged; real ones pass', () => {
  const r = check('Retention is 81% and we have 4,812 customers.', ['customers\n4812\nretention\n0.774']);
  assert.equal(r.ok, false);
  assert.deepEqual(raws(r), ['81%']);
  assert.equal(r.vouched.length, 1);
});

test('rounding to 0–2 decimals is vouched; extra precision is not', () => {
  const src = '{"avg": 18.6666, "b": 20.21}';
  assert.ok(check('averages 18.7 (vs 20.2)', [src]).ok);
  assert.ok(check('averages 19 (vs 20)', [src]).ok);
  assert.ok(check('averages 18.67', [src]).ok);
  assert.deepEqual(raws(check('averages 18.6', [src])), ['18.6']);
  assert.deepEqual(raws(check('averages 18.71', [src])), ['18.71']);
});

test('fraction <-> percent', () => {
  assert.ok(check('conversion was 59.3%', ['rate=0.593']).ok);
  assert.ok(check('conversion was 59 percent', ['rate=0.593']).ok);
  assert.ok(check('a rate of 0.59', ['rate: 59%']).ok);
  assert.deepEqual(raws(check('conversion was 61%', ['rate=0.593'])), ['61%']);
});

test('thousands separators, k/M/B suffixes, currency, negatives', () => {
  const src = 'revenue,cost,delta\n1234567,48200,-3.4\n2500000000,9,9';
  assert.ok(check('Revenue was $1,234,567.', [src]).ok);
  assert.ok(check('Revenue was $1.23M (about $1.2 million).', [src]).ok);
  assert.ok(check('Cost was 48.2k, net change -3.4.', [src]).ok);
  assert.ok(check('Valuation €2.5B, or 2.5 billion.', [src]).ok);
  assert.deepEqual(raws(check('Revenue was $1.32M.', [src])), ['$1.32M']);
  const p = parseNumbers('a loss of -3.4 and $1,200 and 7k');
  assert.deepEqual(p.map((n) => n.value), [-3.4, 1200, 7000]);
  assert.equal(p[1].currency, '$');
});

test('a hyphen in a range is not a minus sign', () => {
  const p = parseNumbers('between 10-20 units');
  assert.deepEqual(p.map((n) => n.value), [10, 20]);
});

test('ignore rules: years, dates, times, ordinals, versions, list markers, labels, small counts', () => {
  const answer = [
    '1. In 2025 (FY24, 2023-24) on Oct 12 and 2026-10-20 at 11:30 or 3pm,',
    '2) the 2nd and 21st items, v2.4 and 1.2.3, step 4, #42, Q3, see https://example.com/a/9876',
    'we had 3 tables and 2 owners.',
  ].join('\n');
  const r = check(answer, []);
  assert.equal(r.ok, true, JSON.stringify(r.unvouched));
});

test('ignore rules can be turned off', () => {
  assert.equal(check('we sold 3 units in 2025', [], { ignore: [] }).unvouched.length, 2);
  assert.equal(check('we sold 3 units', [], { smallMax: -1 }).unvouched.length, 1);
  assert.equal(check('we sold 5 units', [], { smallMax: 5 }).ok, true);
});

test('custom ignore patterns', () => {
  assert.ok(check('order ID 88123 shipped', [], { extraIgnore: [/order ID \d+/] }).ok);
  assert.ok(check('SKU-4471 shipped', [], { extraIgnore: ['SKU-\\d+'] }).ok);
});

test("numbers from the user's question are not flagged", () => {
  const r = check('Of the 250 stores you asked about, 41 closed.', ['closed\n41'], { question: 'How many of our 250 stores closed?' });
  assert.ok(r.ok);
  assert.equal(r.ignored.find((i) => i.reason === 'question').raw, '250');
});

test('fenced code is skipped by default', () => {
  assert.ok(check('Result:\n```\nx = 999\n```\nDone.', []).ok);
});

test('CSV commas are cells, not thousands separators, but "1,234" in text still counts', () => {
  const v = sourceValues('12,345\n"1,234"');
  assert.ok(v.has(12) && v.has(345) && v.has(12345) && v.has(1234));
});

test('sources can be objects (JSON-serialized)', () => {
  assert.ok(check('total 42.5', [{ rows: [{ total: 42.5 }] }]).ok);
});

test('context points at the claim', () => {
  const r = check('Our churn fell to 7.9% last quarter.', []);
  assert.match(r.unvouched[0].context, /churn fell to 7\.9%/);
});

test('exact halves are accepted rounded either way (float noise does not decide)', () => {
  assert.ok(check('3.5% and 3.4%', ['0.0345']).ok);
  assert.ok(check('1.01 and 1.00', ['1.005']).ok);
  assert.deepEqual(raws(check('3.6%', ['0.0345'])), ['3.6%']);
});
