15 results - 8 files

ui\components\CouncilOrbsVertical.tsx:
  45      // Condition for trust button
  46:     const showTrustButton = !!(refinerOutput?.gem || refinerOutput?.synthesisPlus);
  47      const isTrustActive = activeProviderId === '__trust__';

ui\components\refinerui\RefinerCardsSection.tsx:
  17   * Renders a compact summary of critical signals.
  18:  * Intended for insertion directly below the synthesis bubble in the chat stream.
  19   */
  20: export const RefinerSynthesisAccuracy: React.FC<RefinerSectionProps> = ({ output, className = "" }) => {
  21      const { blockerSignals, riskSignals } = categorizeSignals(output.signals);

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

ui\hooks\chat\useRoundActions.ts:
  559    /**
  560:    * Toggle synthesis provider selection for a specific user turn.
  561     * NOTE: This uses userTurnId as the key for backward compatibility with existing UI state.

ui\hooks\cognitive\useModeSwitching.ts:
  7  /**
  8:  * Hook to manage switching between cognitive views (Artifact Showcase vs Synthesis)
  9   * and triggering backend transitions if data isn't present yet.
