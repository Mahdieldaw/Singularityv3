import { skeletonize } from './Skeletonizer';
import type {
  ChewedSubstrate,
  ReconstructedOutput,
  ReconstructedParagraph,
  SkeletonizationInput,
  StatementAction,
  TriageResult,
} from './types';

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

export function reconstructSubstrate(
  input: SkeletonizationInput,
  triageResult: TriageResult,
  embeddingTimeMs: number = 0
): ChewedSubstrate {
  const start = nowMs();
  const { statements, paragraphs, sourceData, traversalState } = input;
  const { statementFates } = triageResult;

  const statementById = new Map(statements.map(s => [s.id, s]));
  const paragraphsByModel = new Map<number, typeof paragraphs>();
  for (const p of paragraphs) {
    const arr = paragraphsByModel.get(p.modelIndex) ?? [];
    arr.push(p);
    paragraphsByModel.set(p.modelIndex, arr);
  }

  const outputs: ReconstructedOutput[] = [];

  for (const source of sourceData) {
    const modelParagraphs = (paragraphsByModel.get(source.modelIndex) ?? []).slice();
    modelParagraphs.sort((a, b) => a.paragraphIndex - b.paragraphIndex);

    const reconstructedParagraphs: ReconstructedParagraph[] = [];
    let protectedCount = 0;
    let skeletonizedCount = 0;
    let removedCount = 0;

    for (const para of modelParagraphs) {
      const stmtResults: ReconstructedParagraph['statements'] = [];
      let intactChars = 0;
      let totalChars = 0;

      for (const stmtId of para.statementIds) {
        const statement = statementById.get(stmtId);
        if (!statement) continue;

        const fate = statementFates.get(stmtId);
        const action: StatementAction = fate?.action ?? 'PROTECTED';
        const originalText = statement.text;

        let resultText = '';
        if (action === 'PROTECTED') resultText = originalText;
        else if (action === 'SKELETONIZE') resultText = skeletonize(originalText);

        totalChars += originalText.length;

        if (action === 'PROTECTED') {
          intactChars += originalText.length;
          protectedCount++;
        } else if (action === 'SKELETONIZE') {
          intactChars += resultText.length * 0.3;
          skeletonizedCount++;
        } else {
          removedCount++;
        }

        stmtResults.push({ statementId: stmtId, action, originalText, resultText });
      }

      const paraText = stmtResults
        .map(s => s.resultText)
        .filter(t => t.length > 0)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      const intactRatio = totalChars > 0 ? intactChars / totalChars : 1;

      reconstructedParagraphs.push({
        paragraphId: para.id,
        text: paraText,
        intactRatio,
        statements: stmtResults,
      });
    }

    const outputParts: string[] = [];
    for (const p of reconstructedParagraphs) {
      if (p.text.length === 0) outputParts.push('\n[...]\n');
      else if (p.intactRatio < 0.3) outputParts.push(`\n--- ${p.text} ---\n`);
      else outputParts.push(p.text);
    }

    const outputText = outputParts.join('\n\n').replace(/\n{4,}/g, '\n\n\n').trim();

    outputs.push({
      modelIndex: source.modelIndex,
      providerId: source.providerId,
      text: outputText,
      paragraphs: reconstructedParagraphs,
      meta: {
        originalCharCount: source.text.length,
        finalCharCount: outputText.length,
        protectedStatementCount: protectedCount,
        skeletonizedStatementCount: skeletonizedCount,
        removedStatementCount: removedCount,
      },
    });
  }

  const claimStatuses = Array.from(traversalState.claimStatuses.values());
  const survivingClaimCount = claimStatuses.filter(s => s === 'active').length;
  const prunedClaimCount = claimStatuses.filter(s => s === 'pruned').length;

  const reconstructionTimeMs = nowMs() - start;

  return {
    outputs,
    summary: {
      totalModels: outputs.length,
      survivingClaimCount,
      prunedClaimCount,
      protectedStatementCount: triageResult.meta.protectedCount,
      skeletonizedStatementCount: triageResult.meta.skeletonizedCount,
      removedStatementCount: triageResult.meta.removedCount,
    },
    pathSteps: traversalState.pathSteps,
    meta: {
      triageTimeMs: triageResult.meta.processingTimeMs - embeddingTimeMs,
      reconstructionTimeMs,
      embeddingTimeMs,
      totalTimeMs: triageResult.meta.processingTimeMs + reconstructionTimeMs,
    },
  };
}

export function formatSubstrateForPrompt(substrate: ChewedSubstrate): string {
  const parts: string[] = [];

  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('EVIDENCE SUBSTRATE (User-Constrained)');
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('');
  parts.push(`Sources: ${substrate.summary.totalModels} models`);
  parts.push(`Surviving positions: ${substrate.summary.survivingClaimCount}`);
  parts.push(`Pruned positions: ${substrate.summary.prunedClaimCount}`);
  parts.push('');

  if (substrate.pathSteps.length > 0) {
    parts.push('User constraints applied:');
    for (const step of substrate.pathSteps) parts.push(`  ${step}`);
    parts.push('');
  }

  parts.push('───────────────────────────────────────────────────────────────');

  for (const output of substrate.outputs) {
    parts.push('');
    parts.push(`### Source ${output.modelIndex} (${output.providerId})`);
    parts.push('');
    parts.push(output.text);
    parts.push('');
    parts.push('───────────────────────────────────────────────────────────────');
  }

  return parts.join('\n');
}
