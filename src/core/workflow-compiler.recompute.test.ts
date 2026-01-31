import { WorkflowCompiler } from "./workflow-compiler.js";

describe("WorkflowCompiler recompute(batch)", () => {
  it("emits single-provider prompt step with continuation context", () => {
    const compiler = new WorkflowCompiler({} as any);

    const request: any = {
      type: "recompute",
      sessionId: "sid-1",
      sourceTurnId: "ai-1",
      stepType: "batch",
      targetProvider: "grok",
      useThinking: false,
    };

    const resolvedContext: any = {
      type: "recompute",
      sessionId: "sid-1",
      sourceTurnId: "ai-1",
      stepType: "batch",
      targetProvider: "grok",
      sourceUserMessage: "hello",
      frozenBatchOutputs: {},
      providerContextsAtSourceTurn: {
        grok: { conversationId: "c-1" },
      },
    };

    const wf = compiler.compile(request, resolvedContext);
    const promptStep = wf.steps.find((s: any) => s.type === "prompt");

    expect(promptStep).toBeTruthy();
    expect(promptStep.payload.providers).toEqual(["grok"]);
    expect(promptStep.payload.providerContexts.grok.meta.conversationId).toBe("c-1");
    expect(promptStep.payload.providerContexts.grok.continueThread).toBe(true);
  });
});
