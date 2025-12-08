# Critical Flows

## 1. User Sends First Message (Initialize)

**Actors:** User, UI, ConnectionHandler, ContextResolver, Compiler, WorkflowEngine, Orchestrator, SessionManager

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant CH as ConnectionHandler
    participant CR as ContextResolver
    participant Compiler
    participant Engine as WorkflowEngine
    participant Orch as Orchestrator
    participant SM as SessionManager

    User->>UI: Types "Hello" + clicks Send
    UI->>UI: Create optimistic UserTurn
    UI->>UI: Add to turnsMap + turnIds
    UI->>CH: ExtendRequest{type:'initialize', userMessage:'Hello'}

    CH->>CR: resolve(request)
    CR->>CR: type='initialize' → return empty context
    CR-->>CH: ResolvedContext{type:'initialize'}

    CH->>Compiler: compile(request, context)
    Compiler->>Compiler: Generate [promptStep]
    Compiler-->>CH: WorkflowRequest{steps:[...]}

    CH->>UI: TURN_CREATED{userTurnId, aiTurnId, sessionId}
    UI->>UI: Create optimistic AiTurn with meta.requestedFeatures
    UI->>UI: Add aiTurn to turnsMap + turnIds

    CH->>Engine: execute(workflowRequest)

    Engine->>Orch: executeParallelFanout('Hello', [claude,gemini])

    loop For each provider
        Orch->>Provider: POST /chat {message:'Hello'}
        Provider-->>Orch: Stream chunk
        Orch->>Engine: onPartial(providerId, chunk)
        Engine->>UI: PARTIAL_RESULT{providerId, chunk.text}
        UI->>UI: streamingBuffer.addDelta()
        UI->>UI: Batch update turnsMap (16ms)
    end

    Orch-->>Engine: onAllComplete(results)
    Engine->>UI: WORKFLOW_STEP_UPDATE{stepId:'batch-123', status:'completed'}
    UI->>UI: Mark batchResponses as completed

    Engine->>SM: persist(request, context, results)
    SM->>DB: Write SessionRecord
    SM->>DB: Write UserTurnRecord
    SM->>DB: Write AiTurnRecord
    SM->>DB: Write ProviderResponseRecords
    SM->>DB: Write ProviderContextRecords (live index)
    SM-->>Engine: Persist complete

    Engine->>UI: TURN_FINALIZED{turn:{user, ai}}
    UI->>UI: Merge canonical data into turnsMap
    UI->>UI: Set meta.isOptimistic = false
    UI->>UI: setIsLoading(false)
```

## 2. User Re-runs Synthesis with Different Model (Recompute)

**Actors:** User, UI, ConnectionHandler, ContextResolver, Compiler, WorkflowEngine, Orchestrator, SessionManager

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant CH as ConnectionHandler
    participant CR as ContextResolver
    participant Compiler
    participant Engine as WorkflowEngine
    participant Orch as Orchestrator
    participant SM as SessionManager

    User->>UI: Clicks "gemini" clip on historical turn
    UI->>UI: setActiveRecomputeState({aiTurnId, stepType:'synthesis', providerId:'gemini'})
    UI->>CH: RecomputeRequest{sourceTurnId, stepType:'synthesis', targetProvider:'gemini'}

    CH->>CR: resolve(request)
    CR->>DB: get('turns', sourceTurnId) → AiTurnRecord
    CR->>DB: get('turns', aiTurn.userTurnId) → UserTurnRecord
    CR->>DB: getByIndex('provider_responses', 'byAiTurnId', sourceTurnId)
    CR->>CR: Build frozenBatchOutputs from responses
    CR->>CR: Find latestMappingOutput from responses
    CR->>CR: Extract providerContextsAtSourceTurn from AiTurnRecord
    CR-->>CH: ResolvedContext{type:'recompute', frozenBatchOutputs, ...}

    CH->>Compiler: compile(request, context)
    Compiler->>Compiler: Generate single synthesisStep with sourceHistorical
    Compiler-->>CH: WorkflowRequest{steps:[synthesisStep]}

    CH->>Engine: execute(workflowRequest)

    Engine->>Engine: resolveSourceData() → use frozenBatchOutputs
    Engine->>Orch: executeParallelFanout(synthPrompt, ['gemini'])

    Orch->>Provider: POST /chat {message:synthPrompt}
    Provider-->>Orch: Stream chunk
    Orch->>Engine: onPartial('gemini', chunk)
    Engine->>UI: PARTIAL_RESULT{providerId:'gemini', chunk.text}
    UI->>UI: streamingBuffer.addDelta() on active turn

    Orch-->>Engine: onAllComplete(results)
    Engine->>UI: WORKFLOW_STEP_UPDATE{stepId:'synthesis-gemini-456', status:'completed'}
    UI->>UI: Add new synthesis response to synthesisResponses['gemini']

    Engine->>SM: persist(request, context, results)
    SM->>DB: Write NEW AiTurnRecord (linked to original userTurnId)
    SM->>DB: Write NEW ProviderResponseRecord
    SM->>DB: DO NOT update sessions.lastTurnId (historical branch)
    SM-->>Engine: Persist complete

    Engine->>UI: TURN_FINALIZED (no-op for recompute)
    UI->>UI: setActiveRecomputeState(null)
    UI->>UI: setIsLoading(false)
```

## 3. Provider Fails (Error Handling)

**Actors:** WorkflowEngine, Orchestrator, Provider, UI

```mermaid
sequenceDiagram
    participant Engine as WorkflowEngine
    participant Orch as Orchestrator
    participant Provider
    participant UI

    Engine->>Orch: executeParallelFanout('prompt', [claude,gemini])

    Orch->>Provider: POST /chat (claude)
    Provider-->>Orch: Stream chunks ✓

    Orch->>Provider: POST /chat (gemini)
    Provider-->>Orch: 503 Overloaded ✗

    Orch->>Orch: Catch error for gemini
    Orch->>Orch: Create error result {providerId:'gemini', status:'error'}

    Orch-->>Engine: onAllComplete(results={claude:✓, gemini:✗})

    alt At least one success
        Engine->>UI: WORKFLOW_STEP_UPDATE{status:'completed', stepId:'batch-... ', result:{results:{claude:✓, gemini:✗}}}
        UI->>UI: Render claude success, render gemini error card
        Engine->>Engine: Continue to synthesis/mapping with claude only
    else All failed
        Engine->>UI: WORKFLOW_STEP_UPDATE{status:'failed', stepId:'batch-... ', error:'All providers failed'}
        Engine->>UI: WORKFLOW_COMPLETE{error:'A critical error occurred.'}
        UI->>UI: setIsLoading(false)
    end
```
