import type { ExecutionHandover, IntentHandover } from './handover.types';

function normalizeKey(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseInlineList(value: string): string[] {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1'));
}

function parseScalar(value: string): string | null {
  const v = String(value ?? '').trim();
  if (!v || v.toLowerCase() === 'null') return null;
  return v.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

function parseYamlLikeLines(lines: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const raw of lines) {
    const line = String(raw || '').trimEnd();
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = normalizeKey(line.slice(0, idx));
    const vRaw = line.slice(idx + 1).trim();
    if (vRaw.startsWith('[') && vRaw.endsWith(']')) {
      out[k] = parseInlineList(vRaw);
    } else {
      out[k] = parseScalar(vRaw);
    }
  }
  return out;
}

function splitBlock(
  response: string,
  startMarker: string,
  endMarker: string,
): { before: string; inside: string | null } {
  const startIdx = response.indexOf(startMarker);
  if (startIdx === -1) return { before: response.trim(), inside: null };
  const afterStart = response.slice(startIdx + startMarker.length);
  const endIdx = afterStart.indexOf(endMarker);
  if (endIdx === -1) return { before: response.trim(), inside: null };
  const inside = afterStart.slice(0, endIdx).trim();
  const before = response.slice(0, startIdx).trim();
  return { before, inside };
}

export function parseIntentHandover(response: string): {
  userResponse: string;
  handover: IntentHandover | null;
} {
  const { before, inside } = splitBlock(response || '', '<<<HANDOVER>>>', '<<<END>>>');
  if (!inside) return { userResponse: before, handover: null };

  const lines = inside.split('\n');
  const raw = parseYamlLikeLines(lines);

  const handover: IntentHandover = {
    shape: String(raw.shape || ''),
    keyFindings: Array.isArray(raw.key_findings) ? raw.key_findings : [],
    tensions: Array.isArray(raw.tensions) ? raw.tensions : [],
    gaps: Array.isArray(raw.gaps) ? raw.gaps : [],
    userQuery: String(raw.user_query || ''),
    starterResponse: String(raw.starter_response || ''),
    userReply: String(raw.user_reply || ''),
    impliedGoal: String(raw.goal || raw.implied_goal || ''),
    revealedConstraints: Array.isArray(raw.constraints) ? raw.constraints : [],
    acceptedFraming: String(raw.accepted_framing || ''),
    resistedFraming:
      raw.resisted_framing === null ? null : String(raw.resisted_framing || ''),
    unpromptedReveals: Array.isArray(raw.unprompted_reveals) ? raw.unprompted_reveals : [],
    stillUnclear: Array.isArray(raw.still_unclear) ? raw.still_unclear : [],
    effectiveStance: String(raw.effective_stance || ''),
  };

  return { userResponse: before, handover };
}

function parseIndentedBlock(lines: string[], startIndex: number): { block: string[]; endIndex: number } {
  const block: string[] = [];
  let i = startIndex;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/^\S/.test(line)) break;
    block.push(line.replace(/^\s{2}/, '').replace(/^\s+/, ''));
  }
  return { block, endIndex: i };
}

export function parseBatchSignal(response: string): {
  userResponse: string;
  type: 'WORKFLOW' | 'STEP_HELP' | null;
  handover: ExecutionHandover | null;
  batchPrompt: string | null;
  meta?: { step?: string | null; blocker?: string | null; context?: string | null };
} {
  const r = response || '';
  const candidates: Array<{ start: string; end: string }> = [
    { start: '<<<SINGULARITY_BATCH_REQUEST>>>', end: '<<<END_BATCH_REQUEST>>>' },
    { start: '<<<BATCH>>>', end: '<<<END>>>' },
  ];

  let before = r.trim();
  let inside: string | null = null;
  for (const c of candidates) {
    const split = splitBlock(r, c.start, c.end);
    if (split.inside) {
      before = split.before;
      inside = split.inside;
      break;
    }
  }
  if (!inside) return { userResponse: before, type: null, handover: null, batchPrompt: null };

  const lines = inside.split('\n');
  let type: 'WORKFLOW' | 'STEP_HELP' | null = null;
  let batchPrompt: string | null = null;
  let handover: ExecutionHandover | null = null;
  let step: string | null = null;
  let blocker: string | null = null;
  let ctx: string | null = null;

  let i = 0;
  while (i < lines.length) {
    const line = String(lines[i] || '').trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    if (/^type:/i.test(trimmed)) {
      const v = trimmed.split(':').slice(1).join(':').trim().toUpperCase();
      type = v === 'WORKFLOW' ? 'WORKFLOW' : v === 'STEP_HELP' ? 'STEP_HELP' : null;
      i++;
      continue;
    }

    if (/^step:/i.test(trimmed)) {
      step = parseScalar(trimmed.split(':').slice(1).join(':')) || null;
      i++;
      continue;
    }

    if (/^blocker:/i.test(trimmed)) {
      blocker = parseScalar(trimmed.split(':').slice(1).join(':')) || null;
      i++;
      continue;
    }

    if (/^context:/i.test(trimmed)) {
      ctx = parseScalar(trimmed.split(':').slice(1).join(':')) || null;
      i++;
      continue;
    }

    if (/^handover:/i.test(trimmed)) {
      const { block, endIndex } = parseIndentedBlock(lines, i + 1);
      const raw = parseYamlLikeLines(block);
      handover = {
        goal: String(raw.goal || ''),
        problemSummary: String(raw.problem_summary || ''),
        situation: String(raw.situation || ''),
        constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
        priorities: Array.isArray(raw.priorities) ? raw.priorities : [],
        decisionsMade: Array.isArray(raw.decisions_made) ? raw.decisions_made : [],
        openQuestions: Array.isArray(raw.open_questions) ? raw.open_questions : [],
        explorationHighlights: Array.isArray(raw.exploration_highlights) ? raw.exploration_highlights : [],
      };
      i = endIndex;
      continue;
    }

    if (/^prompt:/i.test(trimmed)) {
      const rest = lines.slice(i + 1).join('\n').trim();
      batchPrompt = rest || null;
      break;
    }

    i++;
  }

  return {
    userResponse: before,
    type,
    handover: type === 'WORKFLOW' ? handover : null,
    batchPrompt,
    meta: { step, blocker, context: ctx },
  };
}
