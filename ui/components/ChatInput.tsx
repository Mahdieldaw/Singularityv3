import { useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { chatInputValueAtom, selectedModelsAtom, composerModelAtom, analystModelAtom } from "../state/atoms";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { PROVIDER_LIMITS } from "../../shared/provider-limits";
import { setProviderLock } from "../../shared/provider-locks";
import { CouncilOrbs } from "./CouncilOrbs";
import { synthesisProviderAtom } from "../state/atoms";

interface ChatInputProps {
  onSendPrompt: (prompt: string) => void;
  onContinuation: (prompt: string) => void;
  // Abort/Stop current workflow
  onAbort?: () => void;
  isLoading: boolean;
  isRefining: boolean; // New prop
  isReducedMotion?: boolean;
  activeProviderCount: number;
  isVisibleMode: boolean;
  isContinuationMode: boolean;
  // Mapping-specific
  onStartMapping?: (prompt: string) => void;
  canShowMapping?: boolean; // ModelTray has >=2 selected and prompt has content
  mappingTooltip?: string;
  mappingActive?: boolean; // disable input and toggles while active
  onHeightChange?: (height: number) => void; // Callback for height changes
  isHistoryPanelOpen?: boolean;
  hasRejectedRefinement?: boolean;
  // Refiner Props
  isRefinerOpen?: boolean;
  onUndoRefinement?: () => void;
  onToggleAudit?: () => void;
  onToggleVariants?: () => void;
  onToggleExplanation?: () => void;
  showAudit?: boolean;
  showVariants?: boolean;
  showExplanation?: boolean;
  refinerContent?: React.ReactNode;
  // New Refiner Actions
  onExplain?: (prompt: string) => void;
  onCompose?: (prompt: string) => void;
  // Targeted Continuation
  activeTarget?: { aiTurnId: string; providerId: string } | null;
  onCancelTarget?: () => void;
  // Composer/Analyst Refinement State
  originalPrompt?: string | null;
  composerDraft?: string | null;
  currentRefinementState?: "composer" | "analyst" | "both" | null;
  onRevert?: () => void;
  onApplyDraft?: () => void;
}

const ChatInput = ({
  onSendPrompt,
  onContinuation,
  onAbort,
  isLoading,
  isRefining, // Destructure new prop
  isReducedMotion = false,
  activeProviderCount,
  isVisibleMode,
  isContinuationMode,
  onStartMapping,
  canShowMapping = false,
  mappingTooltip,
  mappingActive = false,
  onHeightChange,
  isHistoryPanelOpen = false,
  hasRejectedRefinement = false,
  isRefinerOpen = false,
  onUndoRefinement,
  onToggleAudit,
  onToggleVariants,
  onToggleExplanation,
  showAudit = false,
  showVariants = false,
  showExplanation = false,
  refinerContent,
  onExplain,
  onCompose,
  activeTarget,
  onCancelTarget,
  // Composer/Analyst Refinement State
  originalPrompt,
  composerDraft,
  currentRefinementState,
  onRevert,
  onApplyDraft,
}: ChatInputProps) => {
  const CHAT_INPUT_STORAGE_KEY = "htos_chat_input_value";
  const [prompt, setPrompt] = useAtom(chatInputValueAtom);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  // Model selection for labels
  const composerModelId = useAtom(composerModelAtom)[0];
  const analystModelId = useAtom(analystModelAtom)[0];
  const composerModelName = LLM_PROVIDERS_CONFIG.find(p => p.id === composerModelId)?.name || composerModelId || "Gemini";
  const analystModelName = LLM_PROVIDERS_CONFIG.find(p => p.id === analystModelId)?.name || analystModelId || "Gemini";

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
        provider = LLM_PROVIDERS_CONFIG.find(p => p.id === pid)?.name || pid;
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
      const bottomBarHeight = (originalPrompt || composerDraft) ? 30 : 0;
      const refinerHeight = isRefinerOpen ? 40 : 0;
      const targetHeight = activeTarget ? 30 : 0;
      // Add height for nudge chips if visible (approx 28px + margin)
      const nudgeHeight = nudgeVisible ? 32 : 0;

      const totalHeight = newHeight + 24 + 2 + refinerHeight + targetHeight + bottomBarHeight + nudgeHeight;
      onHeightChange?.(totalHeight);
    }
  }, [prompt, onHeightChange, isRefinerOpen, activeTarget, originalPrompt, composerDraft, nudgeVisible]);

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
    if (isNudgeFrozen || isLoading || !prompt.trim() || isRefinerOpen || !isFocused) {
      if (nudgeType === "idle") setNudgeVisible(false);
      return;
    }

    // Clear existing idle timer
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    // Set new timer for idle detection (reduced to 2s for snappier chaining feel if refined)
    const idleTime = currentRefinementState ? 2000 : 3200;

    idleTimerRef.current = setTimeout(() => {
      setNudgeType("idle");
      // Calculate progress based on length (visual flair)
      setNudgeProgress(Math.min(100, (prompt.length / 50) * 100)); // Arbitrary scale
      setNudgeVisible(true);
    }, idleTime);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [prompt, isNudgeFrozen, isLoading, isRefinerOpen, isFocused, currentRefinementState, nudgeType]);

  // Reset idle nudge on typing
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (nudgeType === "idle" && nudgeVisible) {
      setNudgeVisible(false);
    }
  };

  const executeSend = (text: string) => {
    const trimmed = text.trim();
    if (isContinuationMode) {
      onContinuation(trimmed);
    } else {
      onSendPrompt(trimmed);
    }

    if (!isRefinerOpen && !hasRejectedRefinement) {
      setPrompt("");
    }
    setNudgeVisible(false);
    setIsNudgeFrozen(false);
    setNudgeProgress(0);
  };

  const handleSubmit = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (isLoading || !prompt.trim()) return;

    // Prevent send if menu was just triggered
    if (hasTriggeredMenuRef.current) {
      hasTriggeredMenuRef.current = false;
      return;
    }

    // Trigger A: On Send (Nudge)
    // Only if not already refining or in a special mode that bypasses this
    if (!isRefinerOpen && !hasRejectedRefinement && !activeTarget) {
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

  const buttonText = (isRefinerOpen || hasRejectedRefinement) ? "Launch" : (isContinuationMode ? "Continue" : "Send");
  const isDisabled = isLoading || mappingActive || !prompt.trim() || isOverLimit || isNudgeFrozen;
  const showMappingBtn = canShowMapping && !!prompt.trim() && !isRefinerOpen && !hasRejectedRefinement;
  const showAbortBtn = !!onAbort && isLoading;

  const providerName = activeTarget ? LLM_PROVIDERS_CONFIG.find(p => p.id === activeTarget.providerId)?.name || activeTarget.providerId : "";

  return (
    <div className="w-full flex justify-center flex-col items-center pointer-events-auto gap-2">

      {/* Active Council Orbs (Top Border) */}
      <div className="w-full max-w-[min(800px,calc(100%-32px))] px-3 z-20">
        <CouncilOrbs
          providers={LLM_PROVIDERS_CONFIG}
          voiceProviderId={synthesisProvider || 'claude'}
          variant="active"
          onCrownMove={(pid) => {
            setSynthesisProvider(pid);
            setProviderLock('synthesis', true); // Lock handled in chat input now? Or imported helper.
          }}
        />
      </div>

      <div className="flex gap-2.5 items-center relative w-full max-w-[min(800px,calc(100%-32px))] p-3 bg-input backdrop-blur-xl border border-border-subtle rounded-3xl flex-wrap">

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
            className={`w-full min-h-[38px] px-3 py-2 bg-transparent border-none text-text-primary text-base font-inherit resize-none outline-none overflow-y-auto ${isReducedMotion ? '' : 'transition-all duration-200 ease-out'} placeholder:text-text-muted ${isNudgeFrozen ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            className={`px-3.5 h-[38px] rounded-2xl text-white font-semibold cursor-pointer flex items-center gap-2 min-w-[90px] justify-center ${isDisabled ? 'opacity-50' : 'opacity-100'} ${(isRefinerOpen || hasRejectedRefinement) ? 'bg-gradient-to-br from-brand-500 to-brand-400 shadow-card' : 'bg-gradient-to-r from-brand-500 to-brand-400'} ${isReducedMotion ? '' : 'transition-all duration-200 ease-out'}`}
          >
            {isLoading ? (
              <div className="loading-spinner"></div>
            ) : (
              <>
                <span className="text-base">
                  {(isRefinerOpen || hasRejectedRefinement) ? "🚀" : (isContinuationMode ? "💬" : "✨")}
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
            className={`px-3 h-[38px] bg-intent-danger/15 border border-intent-danger/45 rounded-2xl text-intent-danger font-semibold cursor-pointer flex items-center gap-2 min-w-[90px] justify-center ${isReducedMotion ? '' : 'transition-all duration-200 ease-out'}`}
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
            className={`px-3 h-[38px] bg-chip-soft border border-border-subtle rounded-2xl text-text-secondary font-semibold cursor-pointer flex items-center gap-2 min-w-[110px] justify-center hover:bg-surface-highlight ${isLoading || mappingActive ? 'opacity-50' : 'opacity-100'} ${isReducedMotion ? '' : 'transition-all duration-200 ease-out'}`}
          >
            <span className="text-base">🧩</span>
            <span>Mapping</span>
          </button>
        )}

        {/* Refiner Controls Toolbar */}
        {isRefinerOpen && (
          <div className="w-full flex items-center justify-between pt-3 mt-1 border-t border-border-subtle animate-[fadeIn_0.3s_ease-out] flex-wrap">
            <div className="flex gap-3">
              <button
                onClick={onUndoRefinement}
                className="bg-none border-none text-intent-danger cursor-pointer text-sm font-semibold flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-200 hover:bg-intent-danger/10"
              >
                <span>❌</span> Reject
              </button>

              <button
                onClick={onToggleExplanation}
                className={`bg-none border-none cursor-pointer text-sm font-semibold flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 hover:bg-surface-highlight ${showExplanation ? 'text-brand-400' : 'text-text-muted'}`}
              >
                <span className={`transform transition-transform duration-200 ${showExplanation ? 'rotate-90' : 'rotate-0'}`}>▸</span> Explanation
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onToggleAudit}
                className={`bg-none border-none cursor-pointer text-sm font-semibold flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 hover:bg-surface-highlight ${showAudit ? 'text-intent-warning' : 'text-text-muted'}`}
              >
                <span className={`transform transition-transform duration-200 ${showAudit ? 'rotate-90' : 'rotate-0'}`}>▸</span> Audit
              </button>
              <button
                onClick={onToggleVariants}
                className={`bg-none border-none cursor-pointer text-sm font-semibold flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 hover:bg-surface-highlight ${showVariants ? 'text-brand-400' : 'text-text-muted'}`}
              >
                <span className={`transform transition-transform duration-200 ${showVariants ? 'rotate-90' : 'rotate-0'}`}>▸</span> Variants
              </button>
            </div>
          </div>
        )}

        {isRefinerOpen && refinerContent && (
          <div className="w-full mt-3">
            {refinerContent}
          </div>
        )}

        {/* Revert Link and Composer Draft Chip */}
        {(originalPrompt || composerDraft) && (
          <div className="w-full flex items-center gap-3 mt-2 text-xs">
            {/* Revert link - shown when we have an original prompt saved */}
            {originalPrompt && currentRefinementState && (
              <button
                onClick={onRevert}
                className="text-text-muted hover:text-text-secondary transition-colors opacity-60 hover:opacity-100"
              >
                ↩ Revert to original
              </button>
            )}

            {/* Composer draft chip - shown after reverting */}
            {composerDraft && !currentRefinementState && (
              <button
                onClick={onApplyDraft}
                className="flex items-center gap-1 px-2 py-1 bg-brand-500/10 border border-brand-500/30 rounded-md text-brand-400 hover:bg-brand-500/20 transition-all"
              >
                <span className="text-[10px]">✦</span>
                <span>Composer draft</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInput;
