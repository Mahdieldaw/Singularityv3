PS C:\Users\Mahdi\OneDrive\Desktop\Singularityv3> npx tsc --noEmit 2>&1 | Select-Object -First 100
shared/parsing-utils.ts(1,26): error TS2305: Module '"./contract"' has no exported member 'GauntletOutput'.
shared/parsing-utils.ts(1,42): error TS2305: Module '"./contract"' has no exported member 'UnderstandOutput'.
ui/components/AiTurnBlock.tsx(7,34): error TS2307: Cannot find module '../hooks/useRefinerOutput' or its corresponding type declarations.
ui/components/AiTurnBlock.tsx(8,37): error TS2307: Cannot find module '../hooks/useAntagonistOutput' or its corresponding type declarations.
ui/components/AiTurnBlock.tsx(74,21): error TS2322: Type '{ aiTurn: AiTurn; refinerState: any; antagonistState: any; singularityState: SingularityOutputState; }' is not assignable to type 'IntrinsicAttributes & CognitiveOutputRendererProps'.
  Property 'refinerState' does not exist on type 'IntrinsicAttributes & CognitiveOutputRendererProps'.  
ui/components/cognitive/index.ts(1,47): error TS2307: Cannot find module './GauntletOutputView' or its corresponding type declarations.
ui/components/cognitive/index.ts(2,49): error TS2307: Cannot find module './UnderstandOutputView' or its corresponding type declarations.
ui/components/cognitive/TransitionBar.tsx(22,9): error TS2353: Object literal may only specify known properties, and 'understand' does not exist in type 'Record<CognitiveViewMode, { label: string; emoji: string; }>'.
ui/components/DecisionMapSheet.tsx(29,34): error TS2307: Cannot find module '../hooks/useRefinerOutput' or its corresponding type declarations.
ui/components/DecisionMapSheet.tsx(30,37): error TS2307: Cannot find module '../hooks/useAntagonistOutput' or its corresponding type declarations.
ui/components/DecisionMapSheet.tsx(32,39): error TS2307: Cannot find module './refinerui/RefinerCardsSection' or its corresponding type declarations.       
ui/components/DecisionMapSheet.tsx(1195,74): error TS7006: Parameter 'item' implicitly has an 'any' type.
ui/components/DecisionMapSheet.tsx(1623,84): error TS7006: Parameter 'dim' implicitly has an 'any' type.
ui/components/DecisionMapSheet.tsx(1623,89): error TS7006: Parameter 'i' implicitly has an 'any' type.  
ui/components/DecisionMapSheet.tsx(1646,77): error TS7006: Parameter 'm' implicitly has an 'any' type.  
ui/components/DecisionMapSheet.tsx(1646,80): error TS7006: Parameter 'idx' implicitly has an 'any' type.
ui/components/ModelResponsePanel.tsx(22,34): error TS2307: Cannot find module '../hooks/useRefinerOutput' or its corresponding type declarations.
ui/components/ModelResponsePanel.tsx(23,35): error TS2307: Cannot find module './refinerui/TrustSignalsPanel' or its corresponding type declarations.       
ui/components/ModelResponsePanel.tsx(128,31): error TS7006: Parameter 'pid' implicitly has an 'any' type.
ui/components/RatiosPanel.tsx(123,43): error TS2339: Property 'understand' does not exist on type '{ action: string; }'.
ui/hooks/chat/usePortMessageHandler.ts(616,28): error TS2339: Property 'refinerVersion' does not exist on type 'AiTurn'.
ui/hooks/chat/usePortMessageHandler.ts(616,53): error TS2339: Property 'refinerVersion' does not exist on type 'AiTurn'.
ui/hooks/chat/usePortMessageHandler.ts(625,28): error TS2339: Property 'antagonistVersion' does not exist on type 'AiTurn'.       
ui/hooks/chat/usePortMessageHandler.ts(625,56): error TS2339: Property 'antagonistVersion' does not exist on type 'AiTurn'.       
ui/hooks/chat/usePortMessageHandler.ts(636,30): error TS2339: Property 'understandOutput' does not exist on type 'AiTurn'.        
ui/hooks/chat/usePortMessageHandler.ts(638,28): error TS2339: Property 'understandVersion' does not exist on type 'AiTurn'.       
ui/hooks/chat/usePortMessageHandler.ts(638,56): error TS2339: Property 'understandVersion' does not exist on type 'AiTurn'.       
ui/hooks/chat/usePortMessageHandler.ts(649,30): error TS2339: Property 'gauntletOutput' does not exist on type 'AiTurn'.
ui/hooks/chat/usePortMessageHandler.ts(651,28): error TS2339: Property 'gauntletVersion' does not exist on type 'AiTurn'.
ui/hooks/chat/usePortMessageHandler.ts(651,54): error TS2339: Property 'gauntletVersion' does not exist on type 'AiTurn'.
ui/hooks/chat/usePortMessageHandler.ts(810,30): error TS2339: Property 'refinerVersion' does not exist on type 'AiTurn'.
ui/hooks/chat/usePortMessageHandler.ts(810,55): error TS2339: Property 'refinerVersion' does not exist on type 'AiTurn'.
ui/hooks/chat/usePortMessageHandler.ts(836,30): error TS2339: Property 'antagonistVersion' does not exist on type 'AiTurn'.       
ui/hooks/chat/usePortMessageHandler.ts(836,58): error TS2339: Property 'antagonistVersion' does not exist on type 'AiTurn'.       
ui/hooks/chat/usePortMessageHandler.ts(838,30): error TS2339: Property 'understandVersion' does not exist on type 'AiTurn'.       
ui/hooks/chat/usePortMessageHandler.ts(838,58): error TS2339: Property 'understandVersion' does not exist on type 'AiTurn'.       
ui/hooks/chat/usePortMessageHandler.ts(840,30): error TS2339: Property 'gauntletVersion' does not exist on type 'AiTurn'.
ui/hooks/chat/usePortMessageHandler.ts(840,56): error TS2339: Property 'gauntletVersion' does not exist on type 'AiTurn'.
ui/hooks/chat/useRoundActions.ts(347,29): error TS2339: Property 'understandOutput' does not exist on type 'AiTurn'.
ui/hooks/chat/useRoundActions.ts(347,54): error TS2339: Property 'gauntletOutput' does not exist on type 'AiTurn'.
ui/hooks/chat/useRoundActions.ts(458,29): error TS2339: Property 'understandOutput' does not exist on type 'AiTurn'.
ui/hooks/chat/useRoundActions.ts(458,54): error TS2339: Property 'gauntletOutput' does not exist on type 'AiTurn'.
ui/utils/turn-helpers.ts(342,30): error TS2339: Property 'refinerVersion' does not exist on type 'AiTurn'.
ui/utils/turn-helpers.ts(342,55): error TS2339: Property 'refinerVersion' does not exist on type 'AiTurn'.
ui/utils/turn-helpers.ts(343,33): error TS2339: Property 'antagonistVersion' does not exist on type 'AiTurn'.
ui/utils/turn-helpers.ts(343,61): error TS2339: Property 'antagonistVersion' does not exist on type 'AiTurn'.
ui/utils/turn-helpers.ts(344,33): error TS2339: Property 'understandVersion' does not exist on type 'AiTurn'.
ui/utils/turn-helpers.ts(344,61): error TS2339: Property 'understandVersion' does not exist on type 'AiTurn'.
ui/utils/turn-helpers.ts(345,31): error TS2339: Property 'gauntletVersion' does not exist on type 'AiTurn'.
ui/utils/turn-helpers.ts(345,57): error TS2339: Property 'gauntletVersion' does not exist on type 'AiTurn'.
PS C:\Users\Mahdi\OneDrive\Desktop\Singularityv3> ^C
PS C:\Users\Mahdi\OneDrive\Desktop\Singularityv3>   