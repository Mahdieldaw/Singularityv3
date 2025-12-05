import React, { useCallback } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { useChat } from "../hooks/useChat";
import {
  isLoadingAtom,
  isRefiningAtom,
  isContinuationModeAtom,
  activeProviderCountAtom,
  isVisibleModeAtom,
  isReducedMotionAtom,
  chatInputHeightAtom,
  isHistoryPanelOpenAtom,
  isRefinerOpenAtom,
  refinerDataAtom,
  chatInputValueAtom,
  hasRejectedRefinementAtom,
  activeProviderTargetAtom,
  activeRecomputeStateAtom,
  currentSessionIdAtom,
  toastAtom,
  analystDrawerOpenAtom,
  originalPromptAtom,
  composerDraftAtom,
  currentRefinementStateAtom,
  messageRefinementMetaAtom,
} from "../state/atoms";
import api from "../services/extension-api";
import ChatInput from "./ChatInput";
import RefinerBlock from "./RefinerBlock";
import AnalystDrawer from "./AnalystDrawer";

const ChatInputConnected = () => {
  const [isLoading] = useAtom(isLoadingAtom as any) as [boolean, any];
  const [isRefining] = useAtom(isRefiningAtom as any) as [boolean, any];
  const [isContinuationMode] = useAtom(isContinuationModeAtom as any) as [
    boolean,
    any,
  ];
  const [activeProviderCount] = useAtom(activeProviderCountAtom as any) as [
    number,
    any,
  ];
  const [isVisibleMode] = useAtom(isVisibleModeAtom as any) as [boolean, any];
  const [isReducedMotion] = useAtom(isReducedMotionAtom as any) as [
    boolean,
    any,
  ];
  const [, setChatInputHeight] = useAtom(chatInputHeightAtom);
  const [isHistoryOpen] = useAtom(isHistoryPanelOpenAtom);
  const [isRefinerOpen, setIsRefinerOpen] = useAtom(isRefinerOpenAtom);
  const [refinerData, setRefinerData] = useAtom(refinerDataAtom);
  const [, setChatInputValue] = useAtom(chatInputValueAtom);
  const [hasRejectedRefinement, setHasRejectedRefinement] = useAtom(hasRejectedRefinementAtom);
  const setToast = useSetAtom(toastAtom);

  const [showAudit, setShowAudit] = React.useState(false);
  const [showVariants, setShowVariants] = React.useState(false);
  const [showExplanation, setShowExplanation] = React.useState(false);

  const { sendMessage, abort, refinePrompt } = useChat();

  const [activeTarget, setActiveTarget] = useAtom(activeProviderTargetAtom);
  const [currentSessionId] = useAtom(currentSessionIdAtom);
  const setActiveRecomputeState = useSetAtom(activeRecomputeStateAtom);

  // New refinement state
  const [analystDrawerOpen, setAnalystDrawerOpen] = useAtom(analystDrawerOpenAtom);
  const [originalPrompt, setOriginalPrompt] = useAtom(originalPromptAtom);
  const [composerDraft, setComposerDraft] = useAtom(composerDraftAtom);
  const [currentRefinementState, setCurrentRefinementState] = useAtom(currentRefinementStateAtom);
  const setMessageRefinementMeta = useSetAtom(messageRefinementMetaAtom);

  const handleSend = useCallback(
    (prompt: string) => {
      // Send message with correct mode based on continuation state
      const mode = isContinuationMode ? "continuation" : "new";
      sendMessage(prompt, mode);

      // If refiner was open, clear its state
      if (isRefinerOpen) {
        setIsRefinerOpen(false);
        setRefinerData(null);
        setChatInputValue("");
        setShowAudit(false);
        setShowVariants(false);
        setShowExplanation(false);
      }
    },
    [sendMessage, isContinuationMode, isRefinerOpen, setIsRefinerOpen, setRefinerData, setChatInputValue],
  );

  const handleCont = useCallback(
    async (prompt: string) => {
      // Check for targeted mode
      if (activeTarget && currentSessionId) {
        // Targeted Recompute (Branching)
        try {
          // Set UI state for streaming
          setActiveRecomputeState({
            aiTurnId: activeTarget.aiTurnId,
            stepType: "batch",
            providerId: activeTarget.providerId
          });

          const primitive: any = {
            type: "recompute",
            sessionId: currentSessionId,
            sourceTurnId: activeTarget.aiTurnId,
            stepType: "batch",
            targetProvider: activeTarget.providerId,
            userMessage: prompt, // Custom prompt for the branch
            useThinking: false,
          };

          await api.executeWorkflow(primitive);

          // Cleanup
          setActiveTarget(null);
          setChatInputValue("");
        } catch (error: any) {
          console.error("Failed to execute targeted recompute:", error);
          setToast({
            id: Date.now(),
            message: `Failed to branch ${activeTarget.providerId}: ${error.message || "Unknown error"}`,
            type: "error",
          });
          // Keep target active so user can retry
          setActiveRecomputeState(null);
        }
        return;
      }

      // Standard Continuation
      sendMessage(prompt, "continuation");

      // If refiner was open, clear its state
      if (isRefinerOpen) {
        setIsRefinerOpen(false);
        setRefinerData(null);
        setChatInputValue("");
        setShowAudit(false);
        setShowVariants(false);
        setShowExplanation(false);
      }
    },
    [sendMessage, isRefinerOpen, setIsRefinerOpen, setRefinerData, setChatInputValue, activeTarget, currentSessionId, setActiveTarget, setActiveRecomputeState],
  );

  const handleAbort = useCallback(() => {
    void abort();
  }, [abort]);

  const handleUndoRefinement = useCallback(() => {
    if (refinerData?.originalPrompt) {
      setChatInputValue(refinerData.originalPrompt);
    }
    setIsRefinerOpen(false);
    setRefinerData(null);
    setShowAudit(false);
    setShowVariants(false);
    setShowExplanation(false);
    setHasRejectedRefinement(true);
  }, [refinerData, setChatInputValue, setIsRefinerOpen, setRefinerData, setHasRejectedRefinement]);

  const handleExplain = useCallback(
    (prompt: string) => {
      // Open Analyst drawer instead of inline refiner
      void refinePrompt(prompt, "explain").then(() => {
        setAnalystDrawerOpen(true);
        // Save original if not already saved
        if (!originalPrompt) {
          setOriginalPrompt(prompt);
        }
      });
    },
    [refinePrompt, setAnalystDrawerOpen, originalPrompt, setOriginalPrompt],
  );

  const handleCompose = useCallback(
    (prompt: string) => {
      // Save original before composing
      if (!originalPrompt) {
        setOriginalPrompt(prompt);
      }
      void refinePrompt(prompt, "compose").then(() => {
        setCurrentRefinementState((prev) => prev === "analyst" ? "both" : "composer");
      });
    },
    [refinePrompt, originalPrompt, setOriginalPrompt, setCurrentRefinementState],
  );

  // Handle "Use this" from Analyst drawer
  const handleUseVariant = useCallback(
    (variant: string) => {
      setChatInputValue(variant);
      setAnalystDrawerOpen(false);
      setCurrentRefinementState((prev) => prev === "composer" ? "both" : "analyst");
    },
    [setChatInputValue, setAnalystDrawerOpen, setCurrentRefinementState],
  );

  // Handle "Perfect this" from Analyst drawer
  const handlePerfectThis = useCallback(
    () => {
      const prompt = refinerData?.refinedPrompt || chatInputValue || "";
      setAnalystDrawerOpen(false);
      handleCompose(prompt);
    },
    [refinerData, setAnalystDrawerOpen, handleCompose],
  );

  // Handle Revert action
  const handleRevert = useCallback(
    () => {
      if (originalPrompt) {
        // Save current composed version as draft
        const currentValue = refinerData?.refinedPrompt || "";
        if (currentValue && currentValue !== originalPrompt) {
          setComposerDraft(currentValue);
        }
        setChatInputValue(originalPrompt);
        setCurrentRefinementState(null);
        setIsRefinerOpen(false);
        setRefinerData(null);
      }
    },
    [originalPrompt, refinerData, setComposerDraft, setChatInputValue, setCurrentRefinementState, setIsRefinerOpen, setRefinerData],
  );

  // Handle re-apply from Composer draft chip
  const handleApplyDraft = useCallback(
    () => {
      if (composerDraft) {
        setChatInputValue(composerDraft);
        setComposerDraft(null);
        setCurrentRefinementState("composer");
      }
    },
    [composerDraft, setChatInputValue, setComposerDraft, setCurrentRefinementState],
  );

  // Clear active target when clicking outside (unless clicked inside a provider card which stops propagation)
  React.useEffect(() => {
    if (!activeTarget) return;

    const handleClickOutside = () => {
      setActiveTarget(null);
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [activeTarget, setActiveTarget]);

  // Need to access chatInputValue for handlePerfectThis
  const chatInputValue = useAtomValue(chatInputValueAtom);

  return (
    <>
      <ChatInput
        onSendPrompt={handleSend}
        onContinuation={handleCont}
        onAbort={handleAbort}
        isLoading={isLoading}
        isRefining={isRefining}
        isReducedMotion={isReducedMotion}
        activeProviderCount={activeProviderCount}
        isVisibleMode={isVisibleMode}
        isContinuationMode={isContinuationMode}
        onHeightChange={setChatInputHeight}
        isHistoryPanelOpen={!!isHistoryOpen}
        hasRejectedRefinement={hasRejectedRefinement}
        // Refiner Props
        isRefinerOpen={isRefinerOpen}
        onUndoRefinement={handleUndoRefinement}
        onToggleAudit={() => setShowAudit(!showAudit)}
        onToggleVariants={() => setShowVariants(!showVariants)}
        onToggleExplanation={() => setShowExplanation(!showExplanation)}
        showAudit={showAudit}
        showVariants={showVariants}
        showExplanation={showExplanation}
        refinerContent={
          <RefinerBlock
            showAudit={showAudit}
            showVariants={showVariants}
            showExplanation={showExplanation}
          />
        }
        onExplain={handleExplain}
        onCompose={handleCompose}
        // Targeted Mode
        activeTarget={activeTarget}
        onCancelTarget={() => setActiveTarget(null)}
        // New Composer/Analyst Props
        originalPrompt={originalPrompt}
        composerDraft={composerDraft}
        currentRefinementState={currentRefinementState}
        onRevert={handleRevert}
        onApplyDraft={handleApplyDraft}
      />

      {/* Analyst Drawer */}
      <AnalystDrawer
        onPerfectThis={handlePerfectThis}
        onUseVariant={handleUseVariant}
      />
    </>
  );
};

export default ChatInputConnected;