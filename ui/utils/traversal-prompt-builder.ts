export function buildTraversalContinuationPrompt(
  originalQuery: string,
  gateResolutions: Map<string, any>,
  forcingPointResolutions: Map<string, any>,
  claims: any[],
  gatesMap?: Map<string, any>
): string {
  const parts: string[] = [];

  // User's original question
  parts.push(`Original Question: "${originalQuery}"\n`);

  // Gate context (user-provided situational info)
  if (gateResolutions.size > 0) {
    parts.push("User Context:");
    gateResolutions.forEach((resolution, gateId) => {
      if (resolution.satisfied && resolution.userInput) {
        parts.push(`- ${resolution.userInput}`);
      } else if (!resolution.satisfied) {
        // Try to find a human-readable label
        const gate = gatesMap?.get(gateId);
        const label =
          resolution.label ||
          resolution.question ||
          resolution.condition ||
          gate?.question ||
          gate?.condition ||
          gateId;
        parts.push(`- Does NOT apply: ${label}`);
      }
    });
    parts.push("");
  }

  // User's choices at forcing points
  if (forcingPointResolutions.size > 0) {
    parts.push("User Decisions:");
    forcingPointResolutions.forEach((resolution) => {
      const claim = claims.find(c => c.id === resolution.selectedClaimId);
      if (claim) {
        parts.push(`- Chose: "${claim.label}"`);
        if (claim.text) {
          parts.push(`  Rationale: ${claim.text}`);
        }
      }
    });
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
