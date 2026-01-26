export interface Claim {
  id: string;
  label: string;
  text?: string;
}

import type { ForcingPoint, Resolution } from '../../src/utils/cognitive/traversalEngine';

export function buildTraversalContinuationPrompt(
  originalQuery: string,
  forcingPoints: ForcingPoint[],
  getResolution: (fpId: string) => Resolution | undefined,
  claims: Claim[]
): string {
  const parts: string[] = [];

  // User's original question
  parts.push(`Original Question: "${originalQuery}"\n`);

  const conditionalResolutions: Array<{ fp: ForcingPoint; resolution: Resolution }> = [];
  const conflictResolutions: Array<{ fp: ForcingPoint; resolution: Resolution }> = [];

  for (const fp of forcingPoints) {
    const resolution = getResolution(fp.id);
    if (!resolution) continue;
    if (resolution.type === 'conditional') conditionalResolutions.push({ fp, resolution });
    if (resolution.type === 'conflict') conflictResolutions.push({ fp, resolution });
  }

  if (conditionalResolutions.length > 0) {
    parts.push("User Context:");
    for (const { fp, resolution } of conditionalResolutions) {
      const satisfied = resolution.satisfied === true;
      if (satisfied && resolution.userInput) {
        parts.push(`- ${resolution.userInput}`);
        continue;
      }
      if (!satisfied) {
        const label = fp.question || fp.condition || fp.id;
        parts.push(`- Does NOT apply: ${label}`);
      }
    }
    parts.push("");
  }

  if (conflictResolutions.length > 0) {
    parts.push("User Decisions:");
    for (const { resolution } of conflictResolutions) {
      const selectedClaimId = resolution.selectedClaimId;
      if (!selectedClaimId) continue;

      const claim = claims.find(c => c.id === selectedClaimId);
      if (claim) {
        parts.push(`- Chose: "${claim.label}"`);
        if (claim.text) {
          parts.push(`  Rationale: ${claim.text}`);
        }
      } else if (resolution.selectedLabel) {
        parts.push(`- Chose: "${resolution.selectedLabel}"`);
      }
    }
    parts.push("");
  }

  // Final request
  parts.push(
    "Based on my context and choices above, provide a personalized synthesis. " +
    "Explain how my selected path addresses my original question, highlight any trade-offs " +
    "I should be aware of, and suggest next steps if relevant."
  );

  return parts.join("\n");
}
