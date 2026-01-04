Singularity Layer Integration
Overview
Singularity runs automatically after mapper completes, before cognitive halt. UI displays as a tab alongside the artifact map view.

Tasks
Phase 1: Type Definitions
 Add singularity to 
WorkflowStepType
 in 
shared/contract.ts
 Create 
SingularityOutput
 interface
 Add singularityResponses to 
AiTurn
 Add singularityProvider to request interfaces
Phase 2: Backend Execution
 Add 
executeSingularityStep()  * we are here*
 to 
StepExecutor.js
 Import and use ConciergeService.buildConciergePrompt()
Add _executeSingularityStep() helper to 
CognitivePipelineHandler.js
 Modify 
handleCognitiveHalt()
 to execute Singularity before halt
 Include singularityOutput in MAPPER_ARTIFACT_READY message
Phase 3: Persistence
 Add singularity output handling in 
PersistenceCoordinator.js
 Update SessionManager to store singularity responses
 Add singularityResponses bucket handling in TurnEmitter.js
Phase 4: UI - Tab View
 Create CognitiveTabView.tsx wrapper component
 Add activeCognitiveTabAtom to 
atoms.ts
 Create SingularityOutputView.tsx component
 Create useSingularityOutput.ts hook
 Update parent component to use CognitiveTabView
Phase 5: UI - Council Orbs
 Add singularityProviderAtom to 
atoms.ts
 Modify CouncilOrbs.tsx to show Singularity orb
 Wire model selection for Singularity provider
Current Status
Planning Phase - Awaiting user approval of revised plan





Singularity Layer Integration
The Singularity layer runs automatically after the mapper completes, before the cognitive halt. It produces a unified intelligent voice that synthesizes the mapper's structural analysis.

Architecture Flow
⚠️ Failed to render Mermaid diagram: Parse error on line 7
flowchart TD
    A[User Query] --> B[Batch Models]
    B --> C[Mapper]
    C --> D[Singularity Step]
    D --> E{Cognitive Halt}
    E --> F["MAPPER_ARTIFACT_READY<br/>+ SINGULARITY_OUTPUT_READY"]
    F --> G[UI Tab: Artifact | Singularity]
User Review Required
IMPORTANT

Key Change: Singularity runs automatically as part of the pipeline - no button click required. After mapper completes, Singularity executes and streams its response before the cognitive halt.

NOTE

UI becomes a tab switcher: "Map" vs "Singularity"
Model selection via council orbs (like mapper currently works)
Understand/Decide buttons remain on the Map tab
Proposed Changes
src/core/execution/CognitivePipelineHandler.js
[MODIFY] 
CognitivePipelineHandler.js
Modify 
handleCognitiveHalt()
 to execute Singularity step before emitting MAPPER_ARTIFACT_READY:

async handleCognitiveHalt(request, context, steps, stepResults, resolvedContext, currentUserMessage) {
  // ... existing mapperArtifact extraction (lines 17-64) ...
  
  const exploreAnalysis = computeExplore(userMessageForExplore, mapperArtifact);
  context.mapperArtifact = mapperArtifact;
  context.exploreAnalysis = exploreAnalysis;
  
  // ✅ NEW: Execute Singularity step automatically
  const singularityProvider = context.singularityProvider || 
                               request.singularityProvider || 
                               context.meta?.singularity || 
                               'gemini';
  
  const singularityResult = await this._executeSingularityStep(
    context, mapperArtifact, exploreAnalysis, currentUserMessage, singularityProvider
  );
  
  // Emit both artifacts together
  this.port.postMessage({
    type: "MAPPER_ARTIFACT_READY",
    sessionId: context.sessionId,
    aiTurnId: context.canonicalAiTurnId,
    artifact: mapperArtifact,
    analysis: exploreAnalysis,
    singularityOutput: singularityResult,  // ✅ Include singularity output
    singularityProvider: singularityProvider,
  });
  
  return true;
}
// ✅ NEW: Internal method for singularity execution
async _executeSingularityStep(context, mapperArtifact, exploreAnalysis, userMessage, providerId) {
  // Import ConciergeService and build prompt
  // Stream response via StreamingManager
  // Return { text, meta, providerId }
}
shared/contract.ts
[MODIFY] 
contract.ts
Add singularity to 
WorkflowStepType
Add SingularityOutput interface
Add singularityResponses to 
AiTurn
Add singularityProvider to request interfaces
-export type WorkflowStepType = "prompt" | "mapping" | "refiner" | "antagonist" | "understand" | "gauntlet";
+export type WorkflowStepType = "prompt" | "mapping" | "refiner" | "antagonist" | "understand" | "gauntlet" | "singularity";
export interface SingularityOutput {
  text: string;
  providerId: string;
  timestamp: number;
  leakageDetected?: boolean;
}
src/core/execution/StepExecutor.js
[MODIFY] 
StepExecutor.js
Add executeSingularityStep() method using ConciergeService.buildConciergePrompt():

async executeSingularityStep(step, context, options) {
  const { singularityProvider, mapperArtifact, originalPrompt } = step.payload;
  
  // Build structural analysis and concierge prompt
  const analysis = computeStructuralAnalysis(mapperArtifact);
  const prompt = ConciergeService.buildConciergePrompt(
    originalPrompt, mapperArtifact, analysis, [], originalPrompt
  );
  
  return this._executeGenericSingleStep(step, context, singularityProvider, prompt, 'singularity', options);
}
ui/components/cognitive/CognitiveTabView.tsx
[NEW] 
CognitiveTabView.tsx
A new wrapper component with tab switching between Map and Singularity views:

export const CognitiveTabView: React.FC<Props> = ({ turn, ... }) => {
  const [activeTab, setActiveTab] = useState<'map' | 'singularity'>('map');
  
  return (
    <div>
      {/* Tab Switcher */}
      <div className="flex gap-1 bg-surface-raised rounded-lg p-1 mb-4">
        <TabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')}>
          🗺️ Map
        </TabButton>
        <TabButton active={activeTab === 'singularity'} onClick={() => setActiveTab('singularity')}>
          🌌 Singularity
        </TabButton>
      </div>
      
      {/* Content */}
      {activeTab === 'map' ? (
        <ArtifactShowcase {...props} />
      ) : (
        <SingularityOutputView turnId={turn.id} />
      )}
    </div>
  );
};
ui/components/cognitive/SingularityOutputView.tsx
[NEW] 
SingularityOutputView.tsx
Displays the Singularity response with distinct styling:

export const SingularityOutputView: React.FC<{ turnId: string }> = ({ turnId }) => {
  const { output, providerId } = useSingularityOutput(turnId);
  
  return (
    <div className="p-6 bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-xl border border-purple-500/30">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🌌</span>
        <span className="text-sm font-medium text-purple-400">Singularity</span>
        {providerId && <span className="text-xs text-text-muted">via {providerId}</span>}
      </div>
      <div className="prose prose-invert text-text-primary whitespace-pre-wrap leading-relaxed">
        {output?.text || <span className="animate-pulse">Synthesizing...</span>}
      </div>
    </div>
  );
};
ui/components/CouncilOrbs.tsx
[MODIFY] 
CouncilOrbs.tsx
Add Singularity provider selection (same pattern as mapper):

Add singularityProviderId prop
Show Singularity orb with distinct styling when streaming/complete
Allow click to change provider (or show selector)
ui/state/atoms.ts
[MODIFY] 
atoms.ts
Add atoms for Singularity state:

export const singularityProviderAtom = atom<string>('gemini');
export const activeCognitiveTabAtom = atom<'map' | 'singularity'>('map');
File Summary
File	Type	Description
CognitivePipelineHandler.js
MODIFY	Execute Singularity before halt, emit with artifact
StepExecutor.js
MODIFY	Add executeSingularityStep()
shared/contract.ts
MODIFY	Add types for singularity
CognitiveTabView.tsx	NEW	Tab wrapper for Map/Singularity views
SingularityOutputView.tsx	NEW	Singularity response display
CouncilOrbs.tsx	MODIFY	Add Singularity orb for model selection
atoms.ts
MODIFY	Add singularity atoms
Verification Plan
Send a query → Verify mapper completes
Verify Singularity automatically streams after mapper
Verify UI shows both tabs (Map | Singularity)
Switch tabs → Content changes correctly
Verify council orbs show Singularity provider
Refresh → Verify both outputs persist