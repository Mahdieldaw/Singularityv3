import type { MapperArtifact } from "../../shared/contract";
import type { ArtifactEdit } from "../types/artifact-edits";

export type SignalType = "correction" | "addition" | "ticked" | "unticked" | "removal";

export interface ClassifiedClaim {
  claim: {
    id?: string;
    text?: string;
    insight?: string;
    dimension?: string;
    applies_when?: string;
  };
  signalType: SignalType;
  commentary?: string;
}

export function classifyClaimsWithSignals(
  originalArtifact: MapperArtifact,
  edits: ArtifactEdit | null,
): ClassifiedClaim[] {
  const classified: ClassifiedClaim[] = [];

  if (!edits) {
    const allClaims = originalArtifact.claims || [];
    return allClaims.map((claim: any) => ({ claim, signalType: "unticked" }));
  }

  const removedIds = new Set((edits.edits.removed || []).map((r) => r.claimId));
  const modifiedMap = new Map(
    (edits.edits.modified || []).map((m) => [m.originalId, m]),
  );
  const tickedIds = new Set(edits.tickedIds || []);

  for (const addition of edits.edits.added || []) {
    classified.push({ claim: addition.claim, signalType: "addition" });
  }

  for (const mod of edits.edits.modified || []) {
    classified.push({
      claim: { id: mod.originalId, text: mod.editedText },
      signalType: "correction",
      commentary: `Corrected from: "${mod.originalText}"`,
    });
  }

  const allOriginalClaims = originalArtifact.claims || [];
  for (const claim of allOriginalClaims as any[]) {
    const claimId = claim.id || claim.text || claim.insight;
    if (removedIds.has(claimId)) {
      classified.push({ claim, signalType: "removal" });
      continue;
    }
    if (modifiedMap.has(claimId)) continue;
    classified.push({ claim, signalType: tickedIds.has(claimId) ? "ticked" : "unticked" });
  }

  return classified;
}

export function buildUnderstandSignalInjection(classified: ClassifiedClaim[]): string {
  const corrections = classified.filter((c) => c.signalType === "correction");
  const additions = classified.filter((c) => c.signalType === "addition");
  const ticked = classified.filter((c) => c.signalType === "ticked");
  const unticked = classified.filter((c) => c.signalType === "unticked");

  if (corrections.length === 0 && additions.length === 0 && ticked.length === 0) {
    return "";
  }

  let injection = `\n---\n\n## Human Curation Signal\n\n`;
  if (corrections.length > 0) {
    injection += `### Corrections (Must Address)\n`;
    injection += corrections
      .map((c) => `• **CORRECTED**: "${c.claim.text || c.claim.insight}"${c.commentary ? `\n  (${c.commentary})` : ""}`)
      .join("\n");
    injection += `\n\nYour frame MUST incorporate these corrections. They represent ground-truth knowledge.\n\n`;
  }
  if (additions.length > 0) {
    injection += `### User Additions (Must Include)\n`;
    injection += additions.map((a) => `• **ADDED**: "${a.claim.text || a.claim.insight}"`).join("\n");
    injection += `\n\nThese are dimensions NO model saw. Include in your frame or explicitly explain exclusion.\n\n`;
  }
  if (ticked.length > 0) {
    injection += `### Endorsed (Ticked)\n`;
    injection += ticked.map((t) => `• "${t.claim.text || t.claim.insight}"`).join("\n");
    injection += `\n\n`;
  }
  if (unticked.length > 0) {
    injection += `### Baseline (Unticked)\n`;
    injection += unticked
      .slice(0, 5)
      .map((u) => `• "${u.claim.text || u.claim.insight}"`)
      .join("\n");
    if (unticked.length > 5) injection += `\n...and ${unticked.length - 5} more`;
    injection += `\n\n`;
  }
  injection += `**Tiebreaker Rule**: When two claims serve the frame equally, prefer ticked over unticked.\n\n---\n`;
  return injection;
}

export function buildDecideSignalInjection(classified: ClassifiedClaim[]): string {
  const contestants = classified.filter((c) => c.signalType !== "removal");
  if (contestants.length === 0) return "";
  let injection = `\n---\n\n## Gauntlet Contestants\n\n`;
  injection += `The following claims enter the Gauntlet. Inclusion status is for transparency only—it does not affect judgment.\n\n`;
  injection += `Every claim faces identical tests: Actionability, Falsifiability, Relevance, Superiority.\n\n`;
  injection += `### All Contestants\n`;
  injection += contestants
    .map((c) => {
      const tag = c.signalType === "correction" ? "CORRECTED" : c.signalType === "addition" ? "ADDED" : c.signalType === "ticked" ? "TICKED" : "UNTICKED";
      return `• [${tag}] "${c.claim.text || c.claim.insight}"`;
    })
    .join("\n");
  injection += `\n\n**Gauntlet Principle**: An unticked claim can survive. A ticked claim can die. Only merit determines survival.\n\n---\n`;
  return injection;
}

export function buildRefinerSignalInjection(
  classified: ClassifiedClaim[],
  inputType: "understand" | "decide",
): string {
  const corrections = classified.filter((c) => c.signalType === "correction");
  const additions = classified.filter((c) => c.signalType === "addition");
  const removed = classified.filter((c) => c.signalType === "removal");
  let injection = `\n---\n\n## User Curation Signal (Refiner-Specific)\n\n`;
  if (corrections.length > 0) {
    injection += `### Corrections (Primary Driver)\n`;
    injection += corrections
      .map((c) => `• "${c.claim.text || c.claim.insight}"${c.commentary ? `\n  (${c.commentary})` : ""}`)
      .join("\n");
    injection += `\n\n`;
    injection += inputType === "understand"
      ? `Rebuild final_word around this correction.`
      : `Challenge elimination criteria in light of this correction.`;
    injection += `\n\n`;
  } else {
    injection += `### No Corrections\nProceed with standard adversarial analysis.\n\n`;
  }
  if (additions.length > 0) {
    injection += `### User Additions (Secondary Material)\n`;
    injection += additions.map((a) => `• "${a.claim.text || a.claim.insight}"`).join("\n");
    injection += `\n\n`;
    injection += corrections.length === 0
      ? `No corrections present. Consider additions as the_one candidates.`
      : `Consider alongside the correction.`;
    injection += `\n\n`;
  }
  if (removed.length > 0) {
    injection += `### User Removals (Potential Resurrection)\n`;
    injection += removed.map((r) => `• "${r.claim.text || r.claim.insight}"`).join("\n");
    injection += `\n\nIf overlooked value exists, resurrect—but flag the disagreement.\n\n`;
  }
  injection += `**Refiner Logic**:\n`;
  injection += `1. If corrections exist → rebuild around correction\n`;
  injection += `2. Else if additions exist → consider additions as the_one candidates\n`;
  injection += `3. Else → mine removals and outliers for overlooked signal\n\n---\n`;
  return injection;
}

export function buildAntagonistSignalInjection(
  classified: ClassifiedClaim[],
  inputType: "understand" | "decide",
  ghostOverride: string | null,
): string {
  const additions = classified.filter((c) => c.signalType === "addition");
  const ticked = classified.filter((c) => c.signalType === "ticked");
  const modeLabel = inputType === "understand" ? "Understand" : "Gauntlet";
  let injection = `\n---\n\n## User Curation Signal (Antagonist-Specific — ${modeLabel} Mode)\n\n`;
  if (ghostOverride && ghostOverride.trim().length > 0) {
    injection += `### Ghost Override (Primary Target)\n`;
    injection += `"${ghostOverride}"\n\n`;
  }
  if (additions.length > 0) {
    injection += `### User Additions (Dimensions to Explore)\n`;
    injection += additions.map((a) => `• "${a.claim.text || a.claim.insight}"`).join("\n");
    injection += `\n\n`;
  }
  if (ticked.length > 0) {
    injection += `### User Priorities\n`;
    injection += ticked.map((t) => `• "${t.claim.text || t.claim.insight}"`).join("\n");
    injection += `\n\n`;
  }
  injection += `Use these to focus structured_prompt toward eliciting decisive context.\n\n---\n`;
  return injection;
}
