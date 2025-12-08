# Contributing & Extensions

## 1. Adding a New Provider

1. **Create adapter** (`src/providers/newprovider-adapter.js`):

```javascript
export class NewProviderAdapter {
  async sendPrompt(request, onPartial, signal) {
    const response = await fetch("https://api.newprovider.com/chat", {
      method: "POST",
      signal,
      body: JSON.stringify({ message: request.originalPrompt }),
    });

    const reader = response.body.getReader();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      fullText += chunk;
      onPartial({ text: chunk });
    }

    return {
      text: fullText,
      meta: { conversationId: response.headers.get("X-Conversation-Id") },
    };
  }
}
```

2. **Register in service worker** (`sw-entry.js`):

```javascript
import { NewProviderAdapter } from "./providers/newprovider-adapter.js";

providerRegistry.register(
  "newprovider",
  new NewProviderController(),
  new NewProviderAdapter(),
);
```

3. **Add UI config** (`ui/constants.ts`):

```typescript
export const LLM_PROVIDERS_CONFIG: LLMProvider[] = [
  // ... existing providers
  {
    id: "newprovider",
    name: "New Provider",
    color: "#ff6b6b",
    emoji: "🆕",
  },
];
```

## 2. Adding a New Workflow Primitive

Example: Add `regenerate` primitive to re-run the last turn with different settings.

1. **Define contract** (`shared/contract.ts`):

```typescript
interface RegenerateRequest {
  type: "regenerate";
  sessionId: string;
  providers: ProviderKey[];
  includeMapping: boolean;
  includeSynthesis: boolean;
}

export type PrimitiveWorkflowRequest =
  | InitializeRequest
  | ExtendRequest
  | RecomputeRequest
  | RegenerateRequest; // ← Add here
```

2. **Add resolver logic** (`context-resolver.js`):

```javascript
async resolve(request) {
  if (request.type === 'regenerate') {
    const session = await this.sessionManager.adapter.get('sessions', request.sessionId);
    const lastAiTurn = await this.sessionManager.adapter.get('turns', session.lastTurnId);
    const userTurn = await this.sessionManager.adapter.get('turns', lastAiTurn.userTurnId);

    return {
      type: 'regenerate',
      sessionId: request.sessionId,
      lastUserMessage: userTurn.text,
      providerContexts: {} // Fresh contexts
    };
  }
}
```

3. **Add compiler logic** (`workflow-compiler.js`):

```javascript
compile(request, resolvedContext) {
  if (request.type === 'regenerate') {
    return {
      workflowId: `wf-${Date.now()}`,
      context: { sessionId: request.sessionId },
      steps: [{
        stepId: `batch-${Date.now()}`,
        type: 'prompt',
        payload: {
          prompt: resolvedContext.lastUserMessage,
          providers: request.providers
        }
      }]
    };
  }
}
```

4. **Add UI action** (`ui/hooks/useChat.ts`):

```typescript
const regenerate = useCallback(async () => {
  const request: RegenerateRequest = {
    type: "regenerate",
    sessionId: currentSessionId!,
    providers: activeProviders,
    includeMapping: mappingEnabled,
    includeSynthesis: !!synthesisProvider,
  };

  await api.executeWorkflow(request);
}, [currentSessionId, activeProviders]);
```
