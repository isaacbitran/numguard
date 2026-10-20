// Ignore rules: tokens that look like numbers but are not claims about data.
// Two kinds:
//   mask rules  — regexes whose matches are blanked out of the answer before numbers are extracted
//   value rules — predicates applied to each extracted number
// Every rule has a name so callers can turn it off: check(answer, sources, { ignore: ['dates', 'times'] }).

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';

export const MASK_RULES = {
  code: [/```[\s\S]*?```/g],
  urls: [/\bhttps?:\/\/\S+/g, /\b[\w.-]+@[\w-]+\.[\w.]+\b/g],
  dates: [
    /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
    new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, 'g'),
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}(?:,?\\s+\\d{4})?\\b`, 'g'),
  ],
  times: [/\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?/gi, /\b\d{1,2}\s?[ap]\.?m\.?(?![a-z])/gi],
  ordinals: [/\b\d+(?:st|nd|rd|th)\b/g],
  versions: [/\bv\d+(?:\.\d+)*\b/gi, /\b\d+\.\d+\.\d+(?:[-+][\w.]+)?\b/g, /\b(?:version|release)\s+\d+(?:\.\d+)*\b/gi],
  years: [/\b(?:19|20)\d{2}\s?[–-]\s?\d{2,4}\b/g, /\bFY\s?'?\d{2,4}\b/gi, /'\d{2}\b/g],
  listMarkers: [/^[ \t>]*\d+[.)](?=\s)/gm, /^#{1,6}[ \t]*\d+[.)]?/gm],
  labels: [
    /\b(?:step|figure|fig\.|table|section|chapter|page|line|item|phase|part|round|issue|PR|ticket)\s?#?\d+\b/gi,
    /#\d+\b/g, /\bQ[1-4]\b/g, /\bH[12]\b/g,
  ],
};

export const VALUE_RULES = {
  // a bare 4-digit integer 1900–2099 with no unit is almost always a year
  years: (n) => n.isInt && !n.hasComma && !n.unit && !n.currency && n.abs >= 1900 && n.abs <= 2099,
  // 0..smallMax as a plain integer: "two tables", "3 rows" — too ambiguous to check
  smallCounts: (n, opts) => n.isInt && !n.unit && !n.currency && !n.negative && n.abs <= opts.smallMax,
};

export const DEFAULT_IGNORE = ['code', 'urls', 'dates', 'times', 'ordinals', 'versions', 'years', 'listMarkers', 'labels', 'smallCounts', 'question'];

// Blank out every mask-rule match (same length, so positions and context stay aligned with the original text).
export function mask(text, ignore, extra = []) {
  let out = String(text);
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  for (const name of ignore) for (const re of MASK_RULES[name] || []) out = out.replace(re, blank);
  for (const re of extra) {
    const r = re instanceof RegExp ? re : new RegExp(re);
    out = out.replace(new RegExp(r.source, r.flags.includes('g') ? r.flags : r.flags + 'g'), blank);
  }
  return out;
}
