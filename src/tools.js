// Tool definitions and handlers for the MCP server, kept free of the SDK so they are easy to test.
import { check, formatReport } from './index.js';

const sessions = new Map(); // session id -> string[]

export const TOOLS = [
  {
    name: 'numguard_check',
    description:
      'Before finalizing any answer that states numbers, call this with the draft answer and the raw tool outputs ' +
      '(query results, API JSON, CSV, command output) it is based on. Returns every number in the answer that does not ' +
      'appear in those outputs, exactly or as a rounding, percent, or k/M/B form. Fix, recompute, or remove each one.',
    inputSchema: {
      type: 'object',
      properties: {
        answer: { type: 'string', description: 'The draft answer text.' },
        sources: { type: 'array', items: { type: 'string' }, description: 'Raw tool outputs from this session.' },
        question: { type: 'string', description: "The user's question; numbers in it are not flagged." },
        session: { type: 'string', description: 'Also use outputs stored with numguard_record under this id.' },
        small_max: { type: 'number', description: 'Skip plain integers 0..small_max (default 3).' },
      },
      required: ['answer'],
    },
  },
  {
    name: 'numguard_record',
    description: 'Store a raw tool output as a source for later numguard_check calls in the same session.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Raw tool output.' },
        session: { type: 'string', description: 'Session id (default "default").' },
      },
      required: ['text'],
    },
  },
  {
    name: 'numguard_reset',
    description: "Forget a session's recorded sources.",
    inputSchema: { type: 'object', properties: { session: { type: 'string' } } },
  },
];

export function callTool(name, args = {}) {
  const sid = args.session || 'default';
  if (name === 'numguard_record') {
    const list = sessions.get(sid) || [];
    list.push(String(args.text ?? ''));
    sessions.set(sid, list);
    return { text: `recorded source #${list.length} for session "${sid}"` };
  }
  if (name === 'numguard_reset') { sessions.delete(sid); return { text: `session "${sid}" cleared` }; }
  if (name === 'numguard_check') {
    const sources = [...(args.sources || []), ...(sessions.get(sid) || [])];
    const r = check(args.answer, sources, { question: args.question, smallMax: args.small_max });
    return { text: `${formatReport(r)}\n\n${JSON.stringify({ ok: r.ok, unvouched: r.unvouched, vouched: r.vouched.length, ignored: r.ignored.length })}` };
  }
  return { text: `unknown tool ${name}`, isError: true };
}

