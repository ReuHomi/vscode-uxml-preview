/**
 * Keeps AGENTS.md the single copy of the rules.
 *
 * CLAUDE.md exists because Claude Code reads that filename and Codex reads
 * AGENTS.md. Two copies of the same rules drift; this repo has already watched
 * one number drift across six files. CLAUDE.md may hold role assignment only,
 * and must point at AGENTS.md.
 */
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const claude = read('CLAUDE.md');
const agents = read('AGENTS.md');
const agentLines = agents.split(/\r?\n/);

const problems = [];
if (!/AGENTS\.md/.test(claude)) problems.push('CLAUDE.md does not point at AGENTS.md');

// Headings that carry rules must live in exactly one file.
const owned = ['## 절대 규칙', '## ponytail 예외 — 지우면 안 되는 것 3가지', '## 작업 계약', '## 렌더가 틀려 보일 때', '## 코드 규약 — LCC (Local Contract Coding)', '### 진단은 우리가 한 일을 말한다'];
for (const h of owned) {
  if (claude.includes(h)) problems.push(`CLAUDE.md duplicates a rule section: ${h}`);
  if (!agentLines.includes(h)) problems.push(`AGENTS.md is missing: ${h}`);
}

if (problems.length > 0) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log('rule files: ok');
