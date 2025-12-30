ui/components/AiTurnBlock.tsx:6:3 - error TS6133: 'useRef' is declared but its value is never read.

6   useRef,
    ~~~~~~

ui/components/AiTurnBlock.tsx:7:3 - error TS6133: 'useEffect' is declared but its value is never read.

7   useEffect,
    ~~~~~~~~~

ui/components/AiTurnBlock.tsx:25:1 - error TS6133: 'CouncilOrbs' is declared but its value is never read.

25 import { CouncilOrbs } from "./CouncilOrbs";
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:62:9 - error TS6133: 'providerErrors' is declared but its value is never read.

62   const providerErrors = useAtomValue(providerErrorsForTurnFamily(aiTurn.id));
           ~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:63:9 - error TS6133: 'retryableProviders' is declared but its value is never read.

63   const retryableProviders = useAtomValue(retryableProvidersForTurnFamily(aiTurn.id));
           ~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:64:9 - error TS6133: 'retryProviders' is declared but its value is never read.

64   const { retryProviders } = useRetryProvider();
           ~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:67:9 - error TS6133: 'activeAntagonistPid' is declared but its value is never read.

67   const activeAntagonistPid = useAtomValue(antagonistProviderAtom);
           ~~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:69:9 - error TS6133: 'isThisTurnActive' is declared but its value is never read.

69   const isThisTurnActive = turnStreamingState.isLoading;
           ~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:70:9 - error TS6133: 'workflowProgress' is declared but its value is never read.

70   const workflowProgress = useAtomValue(workflowProgressForTurnFamily(aiTurn.id));
           ~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:75:9 - error TS6133: 'setChatInput' is declared but its value is never read.

75   const setChatInput = useSetAtom(chatInputValueAtom);
           ~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:76:9 - error TS6133: 'setTrustPanelFocus' is declared but its value is never read.

76   const setTrustPanelFocus = useSetAtom(trustPanelFocusAtom);
           ~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:78:10 - error TS6133: 'showEcho' is declared but its value is never read.

78   const [showEcho, setShowEcho] = useState(false);
            ~~~~~~~~

ui/components/AiTurnBlock.tsx:78:20 - error TS6133: 'setShowEcho' is declared but its value is never read.

78   const [showEcho, setShowEcho] = useState(false);
                      ~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:81:9 - error TS6133: 'getProviderName' is declared but its value is never read.

81   const getProviderName = useCallback((pid: string) => {
           ~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:87:9 - error TS6133: 'onClipClick' is declared but its value is never read.

87   const onClipClick = useCallback(
           ~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:96:9 - error TS6133: 'activeRecomputeState' is declared but its value is never read.

96   const activeRecomputeState = useMemo(() => {
           ~~~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:119:9 - error TS6133: 'isMappingError' is declared but its value is never read.

119   const isMappingError = mapperResp?.status === 'error';
            ~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:120:9 - error TS6133: 'isMappingLoading' is declared but its value is never read.

120   const isMappingLoading = mapperResp?.status === 'pending' || mapperResp?.status === 'streaming';
            ~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:158:9 - error TS6133: 'setActiveSplitPanel' is declared but its value is never read.

158   const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
            ~~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:159:9 - error TS6133: 'setIsDecisionMapOpen' is declared but its value is never read.

159   const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);
            ~~~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:160:9 - error TS6133: 'isDecisionMapOpen' is declared but its value is never read.

160   const isDecisionMapOpen = useAtomValue(isDecisionMapOpenAtom);
            ~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:161:31 - error TS6133: 'setIncludePromptInCopy' is declared but its value is never read.

161   const [includePromptInCopy, setIncludePromptInCopy] = useAtom(includePromptInCopyAtom);
                                  ~~~~~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:233:9 - error TS6133: 'visibleProviderIds' is declared but its value is never read.

233   const visibleProviderIds = useMemo(() => {
            ~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:282:9 - error TS6133: 'handleCopyFullTurn' is declared but its value is never read.

282   const handleCopyFullTurn = useCallback(() => {
            ~~~~~~~~~~~~~~~~~~

ui/components/AiTurnBlock.tsx:283:16 - error TS2554: Expected 6-7 arguments, but got 5.

283     const md = formatTurnForMd(
                   ~~~~~~~~~~~~~~~

  ui/utils/copy-format-utils.ts:82:5
    82     batchResponses: Record<string, ProviderResponse>,
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    An argument for 'batchResponses' was not provided.


Found 25 errors in the same file, starting at: ui/components/AiTurnBlock.tsx:6

(TraeAI-3) C:\Users\Mahdi\OneDrive\Desktop\Singularityv3 [1:2] $ npx tsc --noEmit --allowJs --checkJs --noUnusedLocals --noUnusedParameters
(TraeAI-3) C:\Users\Mahdi\OneDrive\Desktop\Singularityv3 [0:0] $ 
(TraeAI-3) C:\Users\Mahdi\OneDrive\Desktop\Singularityv3 [0:0] $ npx tsc --noEmit --allowJs --checkJs --noUnusedLocals --noUnusedParameters
(TraeAI-3) C:\Users\Mahdi\OneDrive\Desktop\Singularityv3 [0:0] $ npx tsc --noEmit --allowJs --checkJs --noUnusedLocals --noUnusedParameters (Get-ChildItem -Path "src" -Filter *.js -Recurse | ForEach-Object { $_.FullName })
src/core/execution/CognitivePipelineHandler.js:3:35 - error TS6133: 'parseMappingResponse' is declared but its value is never read.

3 import { parseV1MapperToArtifact, parseMappingResponse, parseOptionTitles } from '../../../shared/parsing-utils';
                                    ~~~~~~~~~~~~~~~~~~~~

src/core/execution/CognitivePipelineHandler.js:3:57 - error TS6133: 'parseOptionTitles' is declared but its value is never read.

3 import { parseV1MapperToArtifact, parseMappingResponse, parseOptionTitles } from '../../../shared/parsing-utils';
                                                          ~~~~~~~~~~~~~~~~~

src/core/execution/StepExecutor.js:4:10 - error TS6133: 'formatArtifactAsOptions' is declared but its value is never read.

4 import { formatArtifactAsOptions, parseMapperArtifact, parseExploreOutput, parseGauntletOutput, parseUnderstandOutput, parseUnifiedMapperOutput, parseV1MapperToArtifact } from '../../../shared/parsing-utils';
           ~~~~~~~~~~~~~~~~~~~~~~~

src/core/execution/StepExecutor.js:4:35 - error TS6133: 'parseMapperArtifact' is declared but its value is never read.

4 import { formatArtifactAsOptions, parseMapperArtifact, parseExploreOutput, parseGauntletOutput, parseUnderstandOutput, parseUnifiedMapperOutput, parseV1MapperToArtifact } from '../../../shared/parsing-utils';
                                    ~~~~~~~~~~~~~~~~~~~

src/core/execution/StepExecutor.js:4:56 - error TS6133: 'parseExploreOutput' is declared but its value is never read.

4 import { formatArtifactAsOptions, parseMapperArtifact, parseExploreOutput, parseGauntletOutput, parseUnderstandOutput, parseUnifiedMapperOutput, parseV1MapperToArtifact } from '../../../shared/parsing-utils';
                                                         ~~~~~~~~~~~~~~~~~~

src/core/execution/StepExecutor.js:980:11 - error TS6133: 'streamingManager' is declared but its value is never read.

980     const { streamingManager } = options;
              ~~~~~~~~~~~~~~~~~~~~

src/core/PromptService.ts:486:31 - error TS2802: Type 'Set<string>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.

486     const gapDimensions = [...outlierDimensions].filter(d => !consensusDimensions.has(d));

src/persistence/SessionManager.js:1200:24 - error TS6133: 'result' is declared but its value is never read.

1200   _buildContextSummary(result, request) {
                            ~~~~~~

src/persistence/SessionManager.js:1236:29 - error TS6133: 'sessionId' is declared but its value is never read.

1236   async persistArtifactEdit(sessionId, turnId, edit) {