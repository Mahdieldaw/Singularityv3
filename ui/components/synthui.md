74 results - 19 files

ui\index.html:
  47      /* Animations */
  48:     @keyframes synthesisGlow {
  49        0% {

ui\components\AiTurnBlock.tsx:
   87    const onClipClick = useCallback(
   88:     (type: "synthesis" | "mapping" | "antagonist", pid: string) => {
   89        void handleClipClick(aiTurn.id, type, pid);

   94  
   95:   // Filter activeRecomputeState to only include synthesis/mapping (AiTurnBlock doesn't handle batch)
   96    const activeRecomputeState = useMemo(() => {

  103  
  104:   // Use global synthesis provider, or fall back to the provider used for generation
  105:   const activeSynthesisClipProviderId = aiTurn.meta?.synthesizer;
  106  

  277  
  278:   const requestedSynth = (aiTurn.meta as any)?.requestedFeatures?.synthesis;
  279    const wasSynthRequested =

  292        userPrompt,
  293:       undefined, // No synthesis text
  294:       undefined, // No synthesis provider
  295        hasMapping && activeMappingPid ? { narrative: displayedMappingText, options: getOptions(), topology: graphTopology } : null,

ui\components\ChatInput.tsx:
   18    currentRefinementStateAtom, // used in nudgeVariant
   19:   synthesisProviderAtom,
   20    workflowProgressAtom,

  149    const [selectedModels] = useAtom(selectedModelsAtom);
  150:   const [synthesisProvider, setSynthesisProvider] = useAtom(synthesisProviderAtom);
  151    const [maxLength, setMaxLength] = useState<number>(Infinity);

  422              providers={LLM_PROVIDERS_CONFIG}
  423:             voiceProviderId={synthesisProvider}
  424              variant="active"

  426              onCrownMove={(pid) => {
  427:               setSynthesisProvider(pid);
  428:               setProviderLock('synthesis', true);
  429              }}

  441  
  442:       {/* Main chat input container - wider to match/exceed synthesis bubble width */}
  443        <div className="flex gap-2 items-center relative w-full max-w-[min(900px,calc(100%-24px))] p-2.5 bg-surface border border-border-subtle/60 rounded-t-2xl rounded-b-2xl flex-wrap z-[100] shadow-elevated">

ui\components\CouncilOrbsVertical.tsx:
  47      // Condition for trust button
  48:     const showTrustButton = !!(refinerOutput?.gem || refinerOutput?.synthesisPlus);
  49      const isTrustActive = activeProviderId === '__trust__';

ui\components\DecisionMapSheet.tsx:
  192      if (s === 'S' || s === 's') {
  193:       // For synthesizer, return the synthesis provider from metadata or use gemini as fallback
  194        const synthProviderId = citationSourceOrder?.['S'] || 'gemini';

ui\components\PipelineErrorBanner.tsx:
   5  interface PipelineErrorBannerProps {
   6:     type: 'mapping' | 'synthesis' | 'refiner' | 'antagonist';
   7      failedProviderId: string;

  26              case 'mapping': return 'Mapping unavailable';
  27:             case 'synthesis': return 'Frame synthesis unavailable';
  28              case 'refiner': return 'Enhancement unavailable';

  35          switch (type) {
  36:             case 'mapping': return 'Synthesis and advanced insights require a successful cross-reference of multiple sources.';
  37:             case 'synthesis': return 'We couldn\'t generate a combined summary. You can still explore individual responses or the decision map.';
  38              case 'refiner': return 'We couldn\'t generate additional insights or actions for this response.';

  46              case 'mapping': return '📊';
  47:             case 'synthesis': return '✨';
  48              case 'refiner': return '💎';

ui\components\SettingsPanel.tsx:
  135              <span className="text-xs text-text-muted mt-0.5">
  136:               Enable multi-synthesis selection
  137              </span>

ui\components\refinerui\RefinerCardsSection.tsx:
  17   * Renders a compact summary of critical signals.
  18:  * Intended for insertion directly below the synthesis bubble in the chat stream.
  19   */
  20: export const RefinerSynthesisAccuracy: React.FC<RefinerSectionProps> = ({ output, className = "" }) => {
  21      const { blockerSignals, riskSignals } = categorizeSignals(output.signals);

ui\components\refinerui\RefinerDot.tsx:
  51                  `}
  52:                 aria-label={hasGem ? "View gem insight" : "View synthesis+"}
  53              >

ui\components\refinerui\TrustSignalsPanel.tsx:
    2   * TrustSignalsPanel - Simplified for new RefinerOutput structure.
    3:  * Now displays only SynthesisPlus content with attribution click handling.
    4   */

  132            <span className="text-lg">✨</span>
  133:           <span className="font-semibold text-text-primary">Synthesis+</span>
  134          </div>

  191  
  192:         {refiner?.synthesisPlus ? (
  193            <div className="prose prose-sm max-w-none dark:prose-invert">
  194              <div className="text-text-primary leading-relaxed">
  195:               {parseAttributions(refiner.synthesisPlus, handleModelClick)}
  196              </div>

  199            <div className="flex items-center justify-center gap-2 text-text-muted py-8">
  200:             <span className="italic">Generating Synthesis+...</span>
  201              <span className="streaming-dots" />

  204            <div className="text-text-muted italic text-center py-8">
  205:             No enhanced synthesis available.
  206            </div>

ui\hooks\useClipActions.ts:
    2  import { useAtomValue, useSetAtom } from "jotai";
    3: import { turnsMapAtom, alertTextAtom, synthesisProviderAtom, mappingProviderAtom, refinerProviderAtom, antagonistProviderAtom } from "../state/atoms";
    4  import { useRoundActions } from "./chat/useRoundActions";

    9    const turnsMap = useAtomValue(turnsMapAtom);
   10:   const setSynthesisProvider = useSetAtom(synthesisProviderAtom);
   11    const setMappingProvider = useSetAtom(mappingProviderAtom);

   20        aiTurnId: string,
   21:       type: "synthesis" | "mapping" | "refiner" | "antagonist",
   22        providerId: string,

   45          const responsesMap =
   46:           type === "synthesis"
   47:             ? aiTurn.synthesisResponses || {}
   48              : type === "mapping"

   63          // Update global provider preference (Crown Move / Mapper Select)
   64:         if (type === "synthesis") {
   65:           setSynthesisProvider(providerId);
   66          } else if (type === "mapping") {

  100  
  101:         if (type === "synthesis") {
  102:           setAlertText("Synthesis recompute is currently disabled.");
  103          } else if (type === "mapping") {

  121        setTurnsMap,
  122:       setSynthesisProvider,
  123:       setSynthesisProvider,
  124        setMappingProvider,

ui\hooks\useRefinerOutput.ts:
   76              // Check for richer data using new structure
   77:             const hasRicher = !!current?.output?.synthesisPlus ||
   78                  !!current?.output?.gem ||

  108                          // Check for richer data using new structure
  109:                         const richer = !!parsed.synthesisPlus ||
  110                              !!parsed.gem ||

ui\hooks\chat\useChat.ts:
  308           * CRITICAL FIX: Transform backend "rounds" format
  309:          * Backend sends: { userTurnId, aiTurnId, user: {...}, providers: {...}, synthesisResponses, mappingResponses }
  310           */

ui\hooks\chat\usePortMessageHandler.ts:
   41   * CRITICAL: Step type detection must match backend stepId patterns
   42:  * Backend generates: 'batch-<timestamp>', 'synthesis-<provider>-<timestamp>', 'mapping-<provider>-<timestamp>'
   43   */

   64  /**
   65:  * Extract provider ID from stepId for synthesis/mapping steps
   66:  * Backend format: 'synthesis-gemini-1234567890' or 'mapping-chatgpt-1234567890'
   67   */

  383  
  384:           // Some backends omit providerId for synthesis/mapping partials; derive from stepId if needed
  385            let pid: string | null | undefined = providerId;

  827                status: 'queued' | 'active' | 'streaming' | 'completed' | 'failed',
  828:               phase: 'batch' | 'synthesis' | 'mapping'
  829              ) => {
  830                if (status === 'queued') return 'idle';
  831:               if (status === 'active') return phase === 'synthesis' ? 'synthesizing' : 'thinking';
  832                if (status === 'streaming') return 'streaming';

ui\hooks\chat\useRoundActions.ts:
  559    /**
  560:    * Toggle synthesis provider selection for a specific user turn.
  561     * NOTE: This uses userTurnId as the key for backward compatibility with existing UI state.

ui\hooks\cognitive\useModeSwitching.ts:
  7  /**
  8:  * Hook to manage switching between cognitive views (Artifact Showcase vs Synthesis)
  9   * and triggering backend transitions if data isn't present yet.

ui\hooks\providers\useRetryProvider.ts:
  10        providerIds: string[],
  11:       retryScope: 'batch' | 'synthesis' | 'mapping' = 'batch'
  12      ) => {

ui\hooks\providers\useSmartProviderDefaults.ts:
    4      providerAuthStatusAtom,
    5:     synthesisProviderAtom,
    6      mappingProviderAtom,

   29      const authStatus = useAtomValue(providerAuthStatusAtom);
   30:     const [synthesisProvider, setSynthesisProvider] = useAtom(synthesisProviderAtom);
   31      const [mappingProvider, setMappingProvider] = useAtom(mappingProviderAtom);

   51  
   52:         // === Synthesis Provider ===
   53:         if (!locks.synthesis) {
   54:             const currentValid = synthesisProvider && isProviderAuthorized(synthesisProvider, authStatus);
   55  
   56              if (!currentValid) {
   57:                 const best = selectBestProvider('synthesis', authStatus);
   58:                 if (best && best !== synthesisProvider) {
   59:                     console.log(`[SmartDefaults] Synthesis: ${synthesisProvider} → ${best}`);
   60:                     setSynthesisProvider(best);
   61                  }

  104          initializedRef.current = true;
  105:     }, [authStatus, locks, synthesisProvider, mappingProvider, antagonistProvider, refinerProvider, setSynthesisProvider, setMappingProvider, setAntagonistProvider, setRefinerProvider]);
  106  

ui\styles\index.css:
  1: ⟪ 55290 characters skipped ⟫ulse{0%,to{opacity:1}50%{opacity:.5}}@keyframes goldenPulse{0%,to{box-shadow:0 0 20px var(--model-color),0 0 0 3px #ffffff44}50%{box-shadow:0 0 32px var(--model-color),0 0 0 3px #ffffff66}}@keyframes synthesisGlow{0%{opacity:.5}to{opacity:1}}@keyframes spin{to{transform:rotate(1turn)}}@keyframes conflictPulse{0%,to{stroke-opacity:.4}50%{stroke-opacity:.8}}@keyframes slideUp{0%{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeIn{0%{opacity:0}to{opacity:1}}@keyframes slideDown{0%{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}.ai-turn-block,.markdown-body,.user-turn-block{overflow-wrap:break-word}.katex{font-family:"system-ui",-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Oxygen,Ubuntu,Cantarell,Open Sans,Helvetica Neue,sans-serif!important;font-size:1.1em;line-height:1.2;text-rendering:optimizeLegibility}.katex-display{display:block;margin:1em 0;text-align:center;max-width:100%;overflow-x:auto;overflow-y:hidden;padding-bottom:6px}.katex-display::-webkit-scrollbar{height:6px}.katex-display::-webkit-scrollbar-thumb{background-color:rgba(0,0,0,.2);border-radius:4px}.katex-display::-webkit-scrollbar-track{backgroun
