Global Pipeline Simplification
[MODIFY] 
CouncilOrbs.tsx
Delete the guidedMode prop.
Remove all conditional logic checking for guidedMode.
Restore long-press menu functionality by removing the gate in 
handleLongPressStart
.
Always Show all configuration options (Synthesizer, Refiner, etc.) in the long-press menu.
[MODIFY] 
ChatInput.tsx
Remove the hardcoded const isCognitiveMode = true;.
Simplify props and state logic that relied on this flag.
[MODIFY] 
useChat.ts
Remove the const isGuidedMode = true; flag.
Simplify sendMessage logic to use cognitive behavior (mapping enabled, synthesizer use) by default based on existing atoms (mappingEnabledAtom, synthesisProviderAtom).
Verification Plan
Cognitive Flow: Run a cognitive session and verify that the Decision Map (artifact) still loads correctly.
Narrative Flow: Verify that citations [1], [2] and any code artifacts in the mapping narrative still work.
Persistence: Verify that the turn is finalized and saved correctly to history.