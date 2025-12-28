import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import {
  chatInputValueAtom,
  selectedModelsAtom,
  isLoadingAtom,
  isContinuationModeAtom,
  activeProviderCountAtom,
  isVisibleModeAtom,
  isReducedMotionAtom,
  chatInputHeightAtom,
  toastAtom,
  activeProviderTargetAtom,
  currentSessionIdAtom,
  activeRecomputeStateAtom,
  originalPromptAtom,

  currentRefinementStateAtom, // used in nudgeVariant
  synthesisProviderAtom,
  workflowProgressAtom,
  isRoundActiveAtom,
  selectedModeAtom,
} from "../state/atoms";
import { useChat } from "../hooks/chat/useChat";
import api from "../services/extension-api";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { getProviderName } from "../utils/provider-helpers";
import { PROVIDER_LIMITS } from "../../shared/provider-limits";
import { setProviderLock } from "../../shared/provider-locks";
import { CouncilOrbs } from "./CouncilOrbs";

interface ChatInputProps {
  onStartMapping?: (prompt: string) => void;
  canShowMapping?: boolean; // ModelTray has >=2 selected and prompt has content
  mappingTooltip?: string;
  mappingActive?: boolean; // disable input and toggles while active
}

const ChatInput = ({
  onStartMapping,
  canShowMapping = false,
  mappingTooltip,
  mappingActive = false,
}: ChatInputProps) => {
  // --- CONNECTED STATE LOGIC ---
  const [isLoading] = useAtom(isLoadingAtom as any) as [boolean, any];

  const [isContinuationMode] = useAtom(isContinuationModeAtom as any) as [boolean, any];
  const [activeProviderCount] = useAtom(activeProviderCountAtom as any) as [number, any];
  const [isVisibleMode] = useAtom(isVisibleModeAtom as any) as [boolean, any];
  const [isReducedMotion] = useAtom(isReducedMotionAtom as any) as [boolean, any];
  const [, setChatInputHeight] = useAtom(chatInputHeightAtom);
  const [selectedMode] = useAtom(selectedModeAtom as any) as [string, any];
  const isCognitiveMode = true; // Cognitive mode is now the primary and only path

  // Streaming UX: hide config orbs during active round
  const isRoundActive = useAtomValue(isRoundActiveAtom);

  // --- PRESENTATION LOGIC HOISTED ---
  const CHAT_INPUT_STORAGE_KEY = "htos_chat_input_value";
  const [prompt, setPrompt] = useAtom(chatInputValueAtom);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const setToast = useSetAtom(toastAtom);

  const { sendMessage, abort, runComposerFlow } = useChat();

  const [activeTarget, setActiveTarget] = useAtom(activeProviderTargetAtom);
  const [currentSessionId] = useAtom(currentSessionIdAtom);
  const setActiveRecomputeState = useSetAtom(activeRecomputeStateAtom);

  // New refinement state replaced by Launchpad; keeping minimal local state for original prompt tracking if needed
  // actually, we might not even need these atoms if useChat handles it.
  // But let's keep originalPromptAtom for now as it was requested to be preserved for chaining context
  const [originalPrompt, setOriginalPrompt] = useAtom(originalPromptAtom);

  // Callbacks
  const handleSend = useCallback((prompt: string) => {
    const mode = isContinuationMode ? "continuation" : "new";
    sendMessage(prompt, mode);
  }, [sendMessage, isContinuationMode]);

  const onContinuation = useCallback(async (prompt: string) => {
    if (activeTarget && currentSessionId) {
      try {
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
          userMessage: prompt,
          useThinking: false,
          mode: selectedMode as any,
        };
        await api.executeWorkflow(primitive);
        setActiveTarget(null);
        // setChatInputValue(""); // handled in executeSend
      } catch (error: any) {
        console.error("Failed to execute targeted recompute:", error);
        setToast({ id: Date.now(), message: `Failed to branch ${activeTarget.providerId}: ${error.message || "Unknown error"}`, type: "error" });
        setActiveRecomputeState(null);
      }
      return;
    }
    sendMessage(prompt, "continuation");
  }, [sendMessage, activeTarget, currentSessionId, setActiveTarget, setActiveRecomputeState, setToast]);

  const onAbort = useCallback(() => { void abort(); }, [abort]);

  const onExplain = useCallback((prompt: string) => {
    if (!originalPrompt) setOriginalPrompt(prompt);
    // Explicitly pass originalPrompt if available (from chaining)
    void runComposerFlow(prompt, "explain", originalPrompt || undefined);
  }, [runComposerFlow, originalPrompt, setOriginalPrompt]);

  const onCompose = useCallback((prompt: string) => {
    if (!originalPrompt) setOriginalPrompt(prompt);
    void runComposerFlow(prompt, "compose", originalPrompt || undefined);
  }, [runComposerFlow, originalPrompt, setOriginalPrompt]);


  const onHeightChange = setChatInputHeight;
  const onCancelTarget = () => setActiveTarget(null);

  // Clear active target when clicking outside
  useEffect(() => {
    if (!activeTarget) return;
    const handleClickOutside = () => setActiveTarget(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [activeTarget, setActiveTarget]);


  // --- PRESENTATION LOGIC ---
  // (prompt and textareaRef hoisted above to fix closure access)

  // Long-press state
  const [showMenu, setShowMenu] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredMenuRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Input Length Validation State
  const [selectedModels] = useAtom(selectedModelsAtom);
  const [synthesisProvider, setSynthesisProvider] = useAtom(synthesisProviderAtom);
  const [maxLength, setMaxLength] = useState<number>(Infinity);
  const [warnThreshold, setWarnThreshold] = useState<number>(Infinity);
  const [limitingProvider, setLimitingProvider] = useState<string>("");

  const inputLength = prompt.length;
  const isOverLimit = inputLength > maxLength;
  const isWarning = inputLength > warnThreshold && !isOverLimit;

  // Nudge State
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const [nudgeType, setNudgeType] = useState<"sending" | "idle">("idle");
  const [nudgeProgress, setNudgeProgress] = useState(0);
  const nudgeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isNudgeFrozen, setIsNudgeFrozen] = useState(false);
  const [isFocused, setIsFocused] = useState(false); // Track textarea focus





  // Calculate limits based on selected providers
  useEffect(() => {
    let minMax = Infinity;
    let minWarn = Infinity;
    let provider = "";

    const activeProviders = Object.entries(selectedModels)
      .filter(([_, isSelected]) => isSelected)
      .map(([id]) => id);

    const providersToCheck = activeProviders.length > 0 ? activeProviders : ['chatgpt', 'claude', 'gemini']; // Default fallback

    providersToCheck.forEach(pid => {
      const limitConfig = PROVIDER_LIMITS[pid as keyof typeof PROVIDER_LIMITS] || PROVIDER_LIMITS['chatgpt']; // Fallback to safe limit

      if (limitConfig.maxInputChars < minMax) {
        minMax = limitConfig.maxInputChars;
        minWarn = limitConfig.warnThreshold;
        provider = getProviderName(pid);
      }
    });

    setMaxLength(minMax);
    setWarnThreshold(minWarn);
    setLimitingProvider(provider);
  }, [selectedModels]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"; // Reset height
      const scrollHeight = textareaRef.current.scrollHeight;
      const newHeight = Math.min(scrollHeight, 120); // Max height 120px
      textareaRef.current.style.height = `${newHeight}px`;

      // Calculate total input area height
      const bottomBarHeight = (originalPrompt) ? 30 : 0;
      const targetHeight = activeTarget ? 30 : 0;
      // Add height for nudge chips if visible (approx 28px + margin)
      const nudgeHeight = nudgeVisible ? 32 : 0;

      const totalHeight = newHeight + 24 + 2 + targetHeight + bottomBarHeight + nudgeHeight;
      onHeightChange?.(totalHeight);
    }
  }, [prompt, onHeightChange, activeTarget, originalPrompt, nudgeVisible]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMenu]);

  // Idle Nudge Logic (Trigger B) - Only when focused and idle
  useEffect(() => {
    // Only show idle nudge when: focused, has text, not loading/frozen/refining
    // Exception: If we have a refinement state (chaining), we allow nudging even if we are technically "refining" in the high-level sense
    if (isNudgeFrozen || isLoading || !prompt.trim() || !isFocused) {
      if (nudgeType === "idle") setNudgeVisible(false);
      return;
    }

    // Clear existing idle timer
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    // Set new timer for idle detection: always 2s
    const idleTime = 2000;

    idleTimerRef.current = setTimeout(() => {
      setNudgeType("idle");
      // Calculate progress based on length (visual flair)
      setNudgeProgress(Math.min(100, (prompt.length / 50) * 100)); // Arbitrary scale
      setNudgeVisible(true);
    }, idleTime);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [prompt, isNudgeFrozen, isLoading, isFocused, nudgeType]);

  // Reset idle nudge on typing
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (nudgeType === "idle" && nudgeVisible) {
      setNudgeVisible(false);
    }
  };

  const executeSend = (text: string) => {
    const trimmed = text.trim();
    if (isOverLimit) {
      setToast({ id: Date.now(), message: `Input too long for ${limitingProvider} (${inputLength.toLocaleString()} / ${maxLength.toLocaleString()})`, type: "error" });
      return;
    }
    if (isContinuationMode) {
      onContinuation(trimmed);
    } else {
      handleSend(trimmed);
    }

    setPrompt("");
    setNudgeVisible(false);
    setIsNudgeFrozen(false);
    setNudgeProgress(0);
  };

  const handleSubmit = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (isLoading || !prompt.trim()) return;
    if (isOverLimit) {
      setToast({ id: Date.now(), message: `Input too long for ${limitingProvider} (${inputLength.toLocaleString()} / ${maxLength.toLocaleString()})`, type: "error" });
      return;
    }

    // Prevent send if menu was just triggered
    if (hasTriggeredMenuRef.current) {
      hasTriggeredMenuRef.current = false;
      return;
    }

    // Trigger A: On Send (Nudge)
    // Only if not already refining or in a special mode that bypasses this
    if (!activeTarget) {
      setIsNudgeFrozen(true);
      setNudgeType("sending");
      setNudgeVisible(true);
      setNudgeProgress(0);

      const DURATION = 2400; // 2.4s
      const INTERVAL = 50;
      const steps = DURATION / INTERVAL;
      let currentStep = 0;

      if (nudgeTimerRef.current) clearInterval(nudgeTimerRef.current);

      nudgeTimerRef.current = setInterval(() => {
        currentStep++;
        const progress = (currentStep / steps) * 100;
        setNudgeProgress(progress);

        if (currentStep >= steps) {
          if (nudgeTimerRef.current) clearInterval(nudgeTimerRef.current);
          executeSend(prompt);
        }
      }, INTERVAL);

      return;
    }

    executeSend(prompt);
  };

  const handleNudgeCompose = () => {
    if (nudgeTimerRef.current) clearInterval(nudgeTimerRef.current);
    setIsNudgeFrozen(false);
    setNudgeVisible(false);
    onCompose?.(prompt);
  };

  const handleNudgeAnalyst = () => {
    if (nudgeTimerRef.current) clearInterval(nudgeTimerRef.current);
    setIsNudgeFrozen(false);
    setNudgeVisible(false);
    // Analyst uses onExplain usually, but we want to map it correctly
    onExplain?.(prompt);
  };

  const handleMouseDown = () => {
    if (isLoading || !prompt.trim()) return;

    hasTriggeredMenuRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      setShowMenu(true);
      hasTriggeredMenuRef.current = true;
    }, 400); // 0.4s long press
  };

  const handleMouseUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // Note: We do NOT close the menu here. 
    // If hasTriggeredMenuRef is true, the menu is open and should stay open 
    // until the user clicks an option or clicks outside.
  };

  const handleMouseLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMenuAction = (action: "explain" | "compose") => {
    setShowMenu(false);
    const trimmed = prompt.trim();
    if (!trimmed) return;

    if (action === "explain") {
      onExplain?.(trimmed);
    } else if (action === "compose") {
      onCompose?.(trimmed);
    }
  };

  // Determine Nudge Variant for Chaining and Text
  const currentRefinementState = useAtomValue(currentRefinementStateAtom);
  const nudgeVariant = (() => {
    if (currentRefinementState === "composer") return "chain_analyst";
    if (currentRefinementState === "analyst") return "chain_composer";
    return "default";
  })();

  const isSending = nudgeType === "sending";

  // Dynamic text logic based on NudgeChipBar adaptation
  let composerText = isSending ? "Perfect this prompt" : "Let Composer perfect it";
  let analystText = isSending ? "Pressure-test it" : "Let Analyst sharpen it";

  if (nudgeVariant === "chain_analyst") {
    analystText = "Now pressure-test with Analyst?";
  } else if (nudgeVariant === "chain_composer") {
    composerText = "Now perfect this audited version?";
  }

  const buttonText = (isContinuationMode ? "Continue" : "Send");
  const isDisabled = isLoading || mappingActive || !prompt.trim() || isOverLimit || isNudgeFrozen;
  const showMappingBtn = canShowMapping && !!prompt.trim();
  const showAbortBtn = !!onAbort && isLoading;

  const providerName = activeTarget ? getProviderName(activeTarget.providerId) : "";
  const workflowProgress = useAtomValue(workflowProgressAtom);

  return (
    <div className="flex justify-center flex-col items-center pointer-events-auto">


      {/* Config Orbs - Float above input, hugging the top edge */}
      {!isRoundActive && (
        <div className="relative w-full max-w-[min(900px,calc(100%-24px))] flex justify-center mb-[-8px] z-10 !bg-transparent">
          <CouncilOrbs
            providers={LLM_PROVIDERS_CONFIG}
            voiceProviderId={synthesisProvider}
            variant="active"
            workflowProgress={workflowProgress as any}
            guidedMode={isCognitiveMode}
            onCrownMove={(pid) => {
              setSynthesisProvider(pid);
              setProviderLock('synthesis', true);
            }}
          />
        </div>
      )}

      {/* Hint when round is active */}
      {isRoundActive && (
        <div className="flex items-center gap-2 text-xs text-text-muted py-1 text-center opacity-70">
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          Click a glowing orb to see that response
        </div>
      )}

      {/* Main chat input container - wider to match/exceed synthesis bubble width */}
      <div className="flex gap-2 items-center relative w-full max-w-[min(900px,calc(100%-24px))] p-2.5 bg-surface border border-border-subtle/60 rounded-t-2xl rounded-b-2xl flex-wrap z-[100] shadow-elevated">

        {/* Targeted Mode Banner */}
        {activeTarget && (
          <div className="w-full flex items-center justify-between bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-1.5 mb-1 animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2 text-xs font-medium text-brand-400">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
              Targeting {providerName}
            </div>
            <button
              onClick={onCancelTarget}
              className="text-xs text-text-muted hover:text-text-primary px-1.5 py-0.5 rounded hover:bg-surface-highlight transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex-1 relative min-w-[200px] flex flex-col gap-2">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleInputChange}
            placeholder={
              activeTarget
                ? `Continue conversation with ${providerName}...`
                : isContinuationMode
                  ? "Continue the conversation with your follow-up message..."
                  : "Ask anything... Singularity will orchestrate multiple AI models for you."
            }
            rows={1}
            className={`w-full min-h-[34px] px-3 py-1.5 bg-transparent border-none text-text-primary text-[15px] font-inherit resize-none outline-none overflow-y-auto ${isReducedMotion ? '' : 'transition-all duration-200 ease-out'} placeholder:text-text-muted ${isNudgeFrozen ? 'opacity-50 cursor-not-allowed' : ''}`}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === "Enter" && !e.shiftKey && prompt.trim()) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={isLoading || isNudgeFrozen}
            onFocus={() => {
              setIsFocused(true);
              if (activeTarget) {
                onCancelTarget?.();
              }
            }}
            onBlur={() => {
              setIsFocused(false);
              // Immediately hide idle nudge on blur
              if (nudgeType === "idle") {
                setNudgeVisible(false);
              }
            }}
          />

          {/* Inline Nudge Chips */}
          <div className={`flex items-center gap-2 overflow-hidden transition-all duration-300 ease-in-out ${nudgeVisible ? 'max-h-10 opacity-100 mt-1 mb-1' : 'max-h-0 opacity-0 mt-0 mb-0'}`}>
            {isSending && (
              <div className="absolute left-0 bottom-0 top-0 w-[4px] bg-brand-500 animate-pulse rounded-r-full h-full opacity-60"
                style={{ height: `${nudgeProgress}%`, maxHeight: '100%', transition: 'height 50ms linear' }}
              />
            )}

            <button
              onClick={(e) => {
                e.preventDefault();
                handleNudgeCompose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-highlight/40 hover:bg-brand-500/10 hover:border-brand-500/30 border border-transparent rounded-full text-xs transition-all group animate-in slide-in-from-left-2 duration-300"
            >
              <span className="text-brand-400">✨</span>
              <span className="text-text-secondary group-hover:text-brand-300">{composerText}</span>
            </button>

            <div className="w-px h-3 bg-border-subtle" />

            <button
              onClick={(e) => {
                e.preventDefault();
                handleNudgeAnalyst();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-highlight/40 hover:bg-brand-500/10 hover:border-brand-500/30 border border-transparent rounded-full text-xs transition-all group animate-in slide-in-from-left-4 duration-300 delay-75"
            >
              <span className="text-brand-400">🧠</span>
              <span className="text-text-secondary group-hover:text-brand-300">{analystText}</span>
            </button>
          </div>

          {/* Length Validation Feedback */}
          {(isWarning || isOverLimit) && (
            <div className={`absolute bottom-full left-0 mb-2 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-md border animate-in fade-in slide-in-from-bottom-1 ${isOverLimit
              ? "bg-intent-danger/10 border-intent-danger/30 text-intent-danger"
              : "bg-intent-warning/10 border-intent-warning/30 text-intent-warning"
              }`}>
              {isOverLimit ? (
                <span>
                  ⚠️ Input too long for {limitingProvider} ({inputLength.toLocaleString()} / {maxLength.toLocaleString()})
                </span>
              ) : (
                <span>
                  Approaching limit for {limitingProvider} ({inputLength.toLocaleString()} / {maxLength.toLocaleString()})
                </span>
              )}
            </div>
          )}
        </div>

        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-chip-soft border border-border-subtle rounded-full text-text-secondary text-xs whitespace-nowrap opacity-90 cursor-default"
          role="status"
          aria-live="polite"
          title={`System: ${isLoading ? "Working…" : "Ready"} • Providers: ${activeProviderCount} • Mode: ${isVisibleMode ? "Visible" : "Headless"}`}
        >
          <span
            aria-hidden="true"
            className={`inline-block w-2 h-2 rounded-full ${isLoading ? 'bg-intent-warning animate-pulse' : 'bg-intent-success'} ${!isReducedMotion && !isLoading ? 'animate-pulse' : ''}`}
          />
          <span className="text-text-muted">System</span>
          <span>• {activeProviderCount}</span>
        </div>

        {/* Send/Draft/Launch Button */}
        <div className="relative">
          <button
            type="button"
            onClick={handleSubmit}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            disabled={isDisabled}
            className={`px-3 h-[34px] rounded-2xl text-white font-semibold cursor-pointer flex items-center gap-2 min-w-[84px] justify-center ${isDisabled ? 'opacity-50' : 'opacity-100'} bg-gradient-to-r from-brand-500 to-brand-400 ${isReducedMotion ? '' : 'transition-all duration-200 ease-out'}`}
          >
            {isLoading ? (
              <div className="loading-spinner"></div>
            ) : (
              <>
                <span className="text-base">
                  {(isContinuationMode ? "💬" : "✨")}
                </span>
                <span>{buttonText}</span>
              </>
            )}
          </button>

          {/* Long-press Menu */}
          {showMenu && (
            <div
              ref={menuRef}
              className="absolute bottom-full right-0 mb-2 w-36 bg-surface-base border border-border-subtle rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200"
            >
              <button
                onClick={() => handleMenuAction("compose")}
                className="w-full px-4 py-2.5 text-left text-sm text-text-primary hover:bg-surface-highlight flex items-center gap-2 transition-colors"
              >
                <span>✨</span> Compose
              </button>
              <button
                onClick={() => handleMenuAction("explain")}
                className="w-full px-4 py-2.5 text-left text-sm text-text-primary hover:bg-surface-highlight flex items-center gap-2 transition-colors"
              >
                <span>🧠</span> Explain
              </button>
            </div>
          )}
        </div>

        {/* Abort/Stop Button - visible while loading */}
        {showAbortBtn && (
          <button
            type="button"
            onClick={() => onAbort?.()}
            title="Stop current workflow"
            className={`px-3 h-[34px] bg-intent-danger/15 border border-intent-danger/45 rounded-2xl text-intent-danger font-semibold cursor-pointer flex items-center gap-2 min-w-[84px] justify-center ${isReducedMotion ? '' : 'transition-all duration-200 ease-out'}`}
          >
            <span className="text-base">⏹️</span>
            <span>Stop</span>
          </button>
        )}

        {/* Mapping Button (ChatInput path) */}
        {showMappingBtn && (
          <button
            type="button"
            onClick={() => {
              onStartMapping?.(prompt.trim());
              setPrompt("");
              try {
                localStorage.removeItem(CHAT_INPUT_STORAGE_KEY);
              } catch { }
            }}
            disabled={isLoading || mappingActive}
            title={mappingTooltip || "Mapping with selected models"}
            className={`px-3 h-[34px] bg-chip-soft border border-border-subtle rounded-2xl text-text-secondary font-semibold cursor-pointer flex items-center gap-2 min-w-[100px] justify-center hover:bg-surface-highlight ${isLoading || mappingActive ? 'opacity-50' : 'opacity-100'} ${isReducedMotion ? '' : 'transition-all duration-200 ease-out'}`}
          >
            <span className="text-base">🧩</span>
            <span>Mapping</span>
          </button>
        )}


      </div>

    </div>
  );
};

export default ChatInput;
