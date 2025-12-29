import type { ArtifactEdit } from "../types/artifact-edits";

export function computeEditIntensity(
  edits: ArtifactEdit["edits"],
  originalClaimCount: number,
): "light" | "moderate" | "heavy" {
  const changeCount =
    (edits.added?.length || 0) +
    (edits.removed?.length || 0) +
    ((edits.modified?.length || 0) * 2);
  const base = Math.max(originalClaimCount, 1);
  const ratio = changeCount / base;
  if (ratio < 0.15) return "light";
  if (ratio < 0.4) return "moderate";
  return "heavy";
}

