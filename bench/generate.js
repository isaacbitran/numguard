// Synthetic, reproducible benchmark cases. No API calls, no external data.
// Each case: a generated sales table (the "tool output"), a question, a correct answer that restates table values in
// varied formats, and corrupted variants with exactly one wrong number.

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CITIES = ['Aurora', 'Bristol', 'Cedar Falls', 'Dover', 'Easton', 'Fairview', 'Glendale', 'Hanover', 'Irving', 'Jasper',
  'Kingston', 'Lakewood', 'Madison', 'Newport', 'Oakland', 'Plymouth', 'Quincy', 'Riverside', 'Salem', 'Trenton'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const withCommas = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const roundTo = (x, d) => Number(x.toFixed(d));

// Render a value in one of several human formats. Returns { token, decimals, scale } so it can be corrupted later.
function render(kind, v, r) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  if (kind === 'units' || kind === 'stores') {
    if (v >= 10000 && r() < 0.5) return { token: `${(v / 1000).toFixed(1)}k`, num: roundTo(v / 1000, 1), d: 1, fmt: (x) => `${x.toFixed(1)}k` };
    return { token: withCommas(v), num: v, d: 0, fmt: (x) => withCommas(x) };
  }
  if (kind === 'revenue') {
    const f = pick(['full', 'M', 'million', 'k']);
    if (f === 'full') return { token: `$${withCommas(v, 2)}`, num: v, d: 2, fmt: (x) => `$${withCommas(x, 2)}` };
    if (f === 'k' || v < 1e6) return { token: `$${withCommas(roundTo(v / 1e3, 0))}k`, num: roundTo(v / 1e3, 0), d: 0, fmt: (x) => `$${withCommas(x)}k` };
    if (f === 'M') return { token: `$${(v / 1e6).toFixed(2)}M`, num: roundTo(v / 1e6, 2), d: 2, fmt: (x) => `$${x.toFixed(2)}M` };
    return { token: `$${(v / 1e6).toFixed(1)} million`, num: roundTo(v / 1e6, 1), d: 1, fmt: (x) => `$${x.toFixed(1)} million` };
  }
  if (kind === 'price') {
    const d = r() < 0.5 ? 2 : 1;
    return { token: `$${v.toFixed(d)}`, num: roundTo(v, d), d, fmt: (x) => `$${x.toFixed(d)}` };
  }
  // growth / return_rate: stored as a fraction, stated as a percent with 0 or 1 decimals
  const d = r() < 0.5 ? 1 : 0;
  const pct = roundTo(v * 100, d);
  return { token: `${pct.toFixed(d)}%`, num: pct, d, fmt: (x) => `${x.toFixed(d)}%`, percent: true };
}

const SENTENCE = {
  units: (c, t) => `${c} sold ${t} units`,
  stores: (c, t) => `${c} runs ${t} stores`,
  revenue: (c, t) => `${c} brought in ${t} in revenue`,
  price: (c, t) => `the average ticket in ${c} was ${t}`,
  growth: (c, t) => `${c} grew ${t} year over year`,
  return_rate: (c, t) => `${c}'s return rate was ${t}`,
};

export function makeTable(r) {
  const n = 6 + Math.floor(r() * 5);
  const cities = [...CITIES].sort(() => r() - 0.5).slice(0, n);
  return cities.map((city) => {
    const units = 200 + Math.floor(r() ** 2 * 120000);
    const price = roundTo(8 + r() * 240, 4);
    const revenue = roundTo(units * price, 2);
    return {
      city, units, revenue, price,
      stores: 4 + Math.floor(r() * 400),
      growth: roundTo(-0.3 + r() * 0.9, 4),
      return_rate: roundTo(r() * 0.2, 4),
    };
  });
}

export const toCSV = (rows) => [Object.keys(rows[0]).join(','), ...rows.map((o) => Object.values(o).join(','))].join('\n');

const COLS = ['units', 'stores', 'revenue', 'price', 'growth', 'return_rate'];

// Mutate a single digit of a numeric string (not the decimal point); returns a different string.
function mutateDigit(s, r, mode) {
  const idx = [...s].map((ch, i) => (/\d/.test(ch) ? i : -1)).filter((i) => i >= 0);
  if (mode === 'swap') {
    const pairs = [];
    for (let k = 0; k < idx.length - 1; k++) if (idx[k + 1] === idx[k] + 1 && s[idx[k]] !== s[idx[k + 1]] && !(idx[k] === 0 && s[idx[k + 1]] === '0')) pairs.push(idx[k]);
    if (!pairs.length) return null;
    const i = pairs[Math.floor(r() * pairs.length)];
    return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
  }
  const i = idx[Math.floor(r() * idx.length)];
  let d;
  do d = String(Math.floor(r() * 10)); while (d === s[i] || (i === idx[0] && d === '0' && idx.length > 1));
  return s.slice(0, i) + d + s.slice(i + 1);
}

export const CORRUPTIONS = ['off_by_digit', 'swapped_digits', 'invented', 'wrong_percent', 'wrong_rounding'];

export function generateCases(seed = 42, n = 200) {
  const r = rng(seed);
  const cases = [];
  for (let i = 0; i < n; i++) {
    const rows = makeTable(r);
    const totalUnits = rows.reduce((s, o) => s + o.units, 0);
    const sources = [toCSV(rows), JSON.stringify({ total_units: totalUnits, cities: rows.length })];
    const year = 2019 + Math.floor(r() * 7);
    const question = `How did our ${rows.length} cities do in ${year}? Give me the highlights.`;

    // 4 facts from distinct (row, column) pairs; make sure at least one percent fact exists
    const facts = [];
    const used = new Set();
    while (facts.length < 4) {
      const row = rows[Math.floor(r() * rows.length)];
      const col = facts.length === 0 ? (r() < 0.5 ? 'growth' : 'return_rate') : COLS[Math.floor(r() * COLS.length)];
      if (used.has(row.city + col)) continue;
      used.add(row.city + col);
      facts.push({ row, col, ...render(col, row[col], r) });
    }
    const totalFact = { col: 'total', ...render('units', totalUnits, r) };

    const build = (fs, extra = '') => {
      const lines = fs.map((f, k) => `${k + 1}. ${f.col === 'total' ? `Across all ${rows.length} cities we sold ${f.token} units` : SENTENCE[f.col](f.row.city, f.token)}.`);
      const noise = `Figures cover ${year}, as of ${MONTHS[Math.floor(r() * 12)]} ${1 + Math.floor(r() * 28)}; ${rows[0].city} ranked ${['1st', '2nd', '3rd'][Math.floor(r() * 3)]} on growth.`;
      return [`Highlights for ${year}:`, ...lines, noise, extra].filter(Boolean).join('\n');
    };
    const allFacts = [...facts, totalFact];
    const correct = build(allFacts);
    const variants = {};

    // corruptions of one fact (each type tried on a suitable fact)
    for (const type of CORRUPTIONS) {
      const fs = allFacts.map((f) => ({ ...f }));
      let target = null;
      if (type === 'invented') {
        const val = r() < 0.5 ? `${(40 + r() * 55).toFixed(1)}%` : `$${withCommas(Math.floor(1000 + r() * 90000))}`;
        variants[type] = { answer: build(fs, `Customer satisfaction came in at ${val}.`), token: val };
        continue;
      }
      if (type === 'wrong_percent') {
        target = fs.find((f) => f.percent);
        const shift = (1 + Math.floor(r() * 9)) * (r() < 0.5 ? -1 : 1);
        target.token = target.fmt(roundTo(target.num + shift, target.d));
      } else if (type === 'wrong_rounding') {
        // last displayed digit off by one: the smallest error a formatter or a sloppy model makes
        const cands = fs.filter((f) => f.d > 0);
        target = cands.length ? cands[Math.floor(r() * cands.length)] : fs[0];
        const step = 10 ** -target.d * (r() < 0.5 ? -1 : 1);
        target.token = target.fmt(roundTo(target.num + step, target.d));
      } else {
        target = fs[Math.floor(r() * fs.length)];
        let tok = null;
        for (let tries = 0; tries < 10 && !tok; tries++) tok = mutateDigit(target.token, r, type === 'swapped_digits' ? 'swap' : 'digit');
        if (!tok) { target = fs.find((f) => mutateDigit(f.token, r, 'swap')); tok = mutateDigit(target.token, r, 'swap'); }
        target.token = tok;
      }
      variants[type] = { answer: build(fs), token: target.token };
    }

    // known limit: a real value from the wrong row (same column) — not fabricated, just misattributed
    {
      const fs = allFacts.map((f) => ({ ...f }));
      const target = fs.find((f) => f.col !== 'total');
      const other = rows.find((o) => o !== target.row && o[target.col] !== target.row[target.col]);
      const re = render(target.col, other[target.col], r);
      target.token = re.token;
      variants.wrong_row = { answer: build(fs), token: target.token };
    }

    // correct-but-derived: a sum of two cells the agent computed without a tool (flagged by design)
    {
      const [a, b] = [rows[0], rows[1]];
      const sum = a.units + b.units;
      variants.derived_sum = { answer: build(allFacts.map((f) => ({ ...f })), `${a.city} and ${b.city} together sold ${withCommas(sum)} units.`), token: withCommas(sum) };
    }
    cases.push({ id: i, question, sources, correct, variants });
  }
  return cases;
}
