// Read a Claude Code session transcript (JSON lines) and pull out what numguard needs:
//   sources  — every tool_result body in the session (Bash stdout, MCP results, file reads, web fetches)
//   question — text the user typed (numbers the user gave are not the agent's claims)
//   answer   — the text of the final assistant turn (assistant text after the last user/tool_result entry)
import fs from 'node:fs';

function blockText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b) => (typeof b === 'string' ? b : b?.type === 'text' ? b.text : '')).join('\n');
  if (typeof content === 'object' && content.type === 'text') return content.text;
  return '';
}

export function parseTranscript(jsonl) {
  const sources = [], question = [];
  let answer = [];
  for (const line of String(jsonl).split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const msg = e.message;
    if (!msg) continue;
    if (e.type === 'user' || msg.role === 'user') {
      answer = []; // a new user/tool_result entry ends the previous assistant turn
      if (typeof msg.content === 'string') { question.push(msg.content); continue; }
      for (const b of msg.content || []) {
        if (b?.type === 'tool_result') sources.push(blockText(b.content));
        else if (b?.type === 'text') question.push(b.text);
      }
    } else if (e.type === 'assistant' || msg.role === 'assistant') {
      for (const b of msg.content || []) if (b?.type === 'text') answer.push(b.text);
    }
  }
  return { sources, question: question.join('\n'), answer: answer.join('\n') };
}

export function readTranscript(path) {
  return parseTranscript(fs.readFileSync(path, 'utf8'));
}
