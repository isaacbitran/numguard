// numguard: every number an agent states must appear in a tool output from the same session,
// exactly or as a rounding, a fraction<->percent conversion, or a k/M/B abbreviation.
import { MASK_RULES, VALUE_RULES, DEFAULT_IGNORE, mask } from './ignore.js';

export { DEFAULT_IGNORE, MASK_RULES, VALUE_RULES };

const SUFFIX = {
  k: 1e3, K: 1e3, thousand: 1e3,
  m: 1e6, M: 1e6, mn: 1e6, mm: 1e6, million: 1e6,
  b: 1e9, B: 1e9, bn: 1e9, billion: 1e9,
  T: 1e12, trillion: 1e12,
};
const SUFFIX_RE = '%|percent\\b|pct\\b|thousand\\b|million\\b|billion\\b|trillion\\b|mn\\b|mm\\b|bn\\b|[kKmMbBT]\\b';

// Answer-side number: optional minus, optional currency, digits (with thousands separators), decimals, unit.
const ANSWER_NUM = new RegExp(
  `(?<![\\w.])([-−–]?)([$€£¥]?)(\\d{1,3}(?:,\\d{3})+(?!\\d)|\\d+)(\\.\\d+)?(?:\\s?(${SUFFIX_RE}))?`, 'g');

function context(text, start, end, width = 32) {
  const a = Math.max(0, start - width), b = Math.min(text.length, end + width);
  return ((a > 0 ? '…' : '') + text.slice(a, b) + (b < text.length ? '…' : '')).replace(/\s+/g, ' ').trim();
}

// Extract every number from an answer, before ignore rules. Returns structured tokens.
export function parseNumbers(text) {
  const out = [];
  for (const m of String(text).matchAll(ANSWER_NUM)) {
    const [raw, minus, currency, int, frac = '', unit = ''] = m;
    // a dash glued to a preceding word/number is a range or hyphen, not a minus sign
    const negative = Boolean(minus) && (m.index === 0 || /[\s(=:]/.test(text[m.index - 1]));
    const lead = minus && !negative ? minus.length : 0;
    const mantissa = Number(int.replace(/,/g, '') + frac);
    const u = unit.toLowerCase();
    const isPercent = u === '%' || u === 'percent' || u === 'pct';
    const mult = isPercent ? 1 : SUFFIX[unit] || SUFFIX[u] || 1;
    out.push({
      raw: raw.slice(lead).trim(),
      index: m.index + lead,
      end: m.index + raw.length,
      mantissa,
      decimals: frac ? frac.length - 1 : 0,
      mult,
      isPercent,
      unit: unit || '',
      currency: currency || '',
      negative,
      hasComma: int.includes(','),
      isInt: !frac,
      abs: mantissa * mult,
      value: (negative ? -1 : 1) * mantissa * mult,
    });
  }
  return out;
}

// Every numeric value a source text vouches for (absolute values; a source may be a CSV, JSON, or command output).
export function sourceValues(text) {
  const vals = new Set();
  const s = String(text);
  const add = (v) => { if (Number.isFinite(v)) vals.add(Math.abs(v)); };
  // plain tokens, splitting on commas (CSV cells), with optional exponent, percent, or k/M/B suffix
  for (const m of s.matchAll(/(\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s?(%|[kKmMbB](?![a-zA-Z])|thousand|million|billion)?/g)) {
    const v = Number(m[1]);
    add(v);
    if (m[2] === '%') add(v / 100);
    else if (m[2]) add(v * (SUFFIX[m[2]] || SUFFIX[m[2].toLowerCase()] || 1));
  }
  // thousands-separated tokens ("1,234,567") as one value too
  for (const m of s.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g)) add(Number(m[0].replace(/,/g, '')));
  // leading-dot decimals (".593")
  for (const m of s.matchAll(/(?<![\d.])\.(\d+)/g)) add(Number('0.' + m[1]));
  return vals;
}

// Does any source value, under some allowed transformation, round to the number as typed?
function findVouch(n, values) {
  const tol = 0.5 * 10 ** -n.decimals * (1 + 1e-6) + 1e-12 * Math.max(1, n.mantissa); // exact halves round either way
  for (const c of values) {
    const forms = [c];
    if (n.isPercent || (c > 0 && c < 1)) forms.push(c * 100); // 0.593 -> 59.3 / 59.3%
    for (const f of forms) if (Math.abs(f / n.mult - n.mantissa) <= tol) return f === c ? c : `${c} ×100`;
  }
  return null;
}

/**
 * check(answer, sources, opts)
 *   answer   string — the agent's draft answer
 *   sources  string | string[] — tool outputs from the same session (SQL results, JSON, CSV, stdout)
 *   opts.question  string — the user's question; numbers in it are not flagged
 *   opts.ignore    string[] — ignore rules to apply (default DEFAULT_IGNORE); pass [] to check everything
 *   opts.extraIgnore (RegExp|string)[] — extra patterns to blank out before checking
 *   opts.smallMax  number — integers 0..smallMax are skipped as plain counts (default 3; -1 disables)
 * returns { ok, unvouched: [{value, raw, context}], vouched: [{value, raw, context, by}], ignored: [{raw, reason}] }
 */
export function check(answer, sources = [], opts = {}) {
  const text = String(answer ?? '');
  const ignore = opts.ignore ?? DEFAULT_IGNORE;
  const smallMax = opts.smallMax ?? 3;
  const srcList = Array.isArray(sources) ? sources : [sources];
  const values = new Set();
  for (const s of srcList) for (const v of sourceValues(typeof s === 'string' ? s : JSON.stringify(s))) values.add(v);
  const questionValues = ignore.includes('question') && opts.question ? sourceValues(opts.question) : new Set();

  const masked = mask(text, ignore, opts.extraIgnore || []);
  const result = { ok: true, unvouched: [], vouched: [], ignored: [] };
  for (const n of parseNumbers(masked)) {
    const item = { value: n.value, raw: n.raw, context: context(text, n.index, n.end) };
    const rule = Object.entries(VALUE_RULES).find(([name, f]) => ignore.includes(name) && f(n, { smallMax }));
    if (rule) { result.ignored.push({ raw: n.raw, reason: rule[0] }); continue; }
    const by = findVouch(n, values);
    if (by !== null) { result.vouched.push({ ...item, by: String(by) }); continue; }
    if (questionValues.size && findVouch(n, questionValues) !== null) { result.ignored.push({ raw: n.raw, reason: 'question' }); continue; }
    result.unvouched.push(item);
  }
  result.ok = result.unvouched.length === 0;
  return result;
}

// Human-readable report for CLI, hook, and MCP output.
export function formatReport(r, { header = true } = {}) {
  if (r.ok) return `numguard: ok — ${r.vouched.length} number(s) vouched by tool output, ${r.ignored.length} ignored.`;
  const lines = r.unvouched.map((u) => `  ✗ ${u.raw}   in "${u.context}"`);
  return [
    header ? `numguard: ${r.unvouched.length} number(s) do not appear in any tool output from this session:` : '',
    ...lines,
    'Recompute each with a tool (query, script, API call) and use the result, cite the output it came from, or remove it.',
  ].filter(Boolean).join('\n');
}
