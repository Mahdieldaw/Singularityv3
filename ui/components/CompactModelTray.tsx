import { useState, useRef, useEffect } from "react";
import { LLMProvider } from "..";
import { LLM_PROVIDERS_CONFIG } from "../constants";

interface CompactModelTrayProps {
  selectedModels: Record<string, boolean>;
  onToggleModel: (providerId: string) => void;
  isLoading?: boolean;
  // Think-mode (global) toggle for ChatGPT
  thinkOnChatGPT?: boolean;
  onToggleThinkChatGPT?: () => void;
  // Synthesis provider selection
  synthesisProvider?: string | null;
  onSetSynthesisProvider?: (providerId: string | null) => void;
  // Mapping controls
  mappingEnabled?: boolean;
  onToggleMapping?: (enabled: boolean) => void;
  mappingProvider?: string | null;
  onSetMappingProvider?: (providerId: string | null) => void;
  // Power user mode
  powerUserMode?: boolean;
  synthesisProviders?: string[];
  onToggleSynthesisProvider?: (providerId: string) => void;
  // New props for compact mode
  isFirstLoad?: boolean;
  onAcknowledgeFirstLoad?: () => void; // New callback for parent to clear isFirstLoad
  chatInputHeight?: number; // New prop for dynamic positioning
  // Refine props
  // Composer props
  composerModel?: string;
  onSetComposerModel?: (model: string) => void;
  analystModel?: string;
  onSetAnalystModel?: (model: string) => void;
  providerStatus?: Record<string, boolean>;
}

const CompactModelTray = ({
  selectedModels,
  onToggleModel,
  isLoading = false,
  thinkOnChatGPT = false,
  onToggleThinkChatGPT,
  synthesisProvider,
  onSetSynthesisProvider,
  mappingEnabled = false,
  onToggleMapping,
  mappingProvider,
  onSetMappingProvider,
  powerUserMode = false,
  synthesisProviders = [],
  onToggleSynthesisProvider,
  isFirstLoad = false,
  onAcknowledgeFirstLoad,
  chatInputHeight = 80, // Default height
  composerModel = "qwen",
  onSetComposerModel,
  analystModel = "gemini",
  onSetAnalystModel,
  providerStatus = {},
}: CompactModelTrayProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModelsDropdown, setShowModelsDropdown] = useState(false);
  const [showMapDropdown, setShowMapDropdown] = useState(false);
  const [showUnifyDropdown, setShowUnifyDropdown] = useState(false);
  const [showDraftDropdown, setShowDraftDropdown] = useState(false); // Replaces Refine dropdown
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate active models count and names
  const activeCount = Object.values(selectedModels).filter(Boolean).length;
  const selectedProviderIds = Object.keys(selectedModels).filter(
    (id) => selectedModels[id],
  );
  const selectedProviders = LLM_PROVIDERS_CONFIG.filter((provider) =>
    selectedProviderIds.includes(provider.id),
  );
  const canRefine = activeCount >= 1;
  const mapProviderId = mappingProvider || "";
  const unifyProviderId = synthesisProvider || "";
  const isMapEnabled = !!mappingEnabled;
  const isUnifyEnabled = !!unifyProviderId;


  // Prefer user's last-used providers across turns/sessions when props are empty/null
  useEffect(() => {
    try {
      // Restore selected (batch) models if the parent provided none
      const activeCount = Object.values(selectedModels || {}).filter(
        Boolean,
      ).length;
      if (activeCount === 0 && typeof onToggleModel === "function") {
        const keys = [
          "htos_selected_models",
          "htos_last_selected_models",
          "htos_last_used_selected_models",
        ];
        for (const k of keys) {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            continue;
          }
          if (parsed && typeof parsed === "object") {
            // Apply saved map by toggling differences
            LLM_PROVIDERS_CONFIG.forEach((p) => {
              const shouldBeSelected = !!parsed[p.id];
              const currentlySelected = !!selectedModels[p.id];
              if (shouldBeSelected && !currentlySelected) onToggleModel(p.id);
              else if (!shouldBeSelected && currentlySelected)
                onToggleModel(p.id);
            });
            break;
          }
        }
      }

      // Don't override if parent already provided mapping/synthesis values
      if (!mappingProvider && typeof onSetMappingProvider === "function") {
        const keys = [
          "htos_mapping_provider",
          "htos_last_turn_mapping_provider",
          "htos_last_used_mapping_provider",
        ];
        for (const k of keys) {
          const val = localStorage.getItem(k);
          if (val) {
            onSetMappingProvider(val);
            try {
              onToggleMapping?.(true);
            } catch (_) { }
            break;
          }
        }
      }

      if (!synthesisProvider && typeof onSetSynthesisProvider === "function") {
        const keys = [
          "htos_synthesis_provider",
          "htos_last_turn_synthesis_provider",
          "htos_last_used_synthesis_provider",
        ];
        for (const k of keys) {
          const val = localStorage.getItem(k);
          if (val) {
            onSetSynthesisProvider(val);
            break;
          }
        }
      }
    } catch (err) {
      // best-effort only
      console.warn(
        "[CompactModelTray] failed to restore last-used providers/selection",
        err,
      );
    }
    // run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore refine model from local storage
  // Refine model restoration is handled by atomWithStorage in atoms.ts

  // Generate compact labels
  const getWitnessLabel = () => {
    if (activeCount === 0) return "[No Models]";
    if (activeCount === LLM_PROVIDERS_CONFIG.length) return "[All Models]";
    if (activeCount === 1) return `[${selectedProviders[0]?.name}]`;
    return `[${activeCount} Models]`;
  };

  // Helper: find provider name from full config (even if not in witness selection)
  const getProviderName = (id: string | null | undefined) => {
    if (!id) return "";
    const match = LLM_PROVIDERS_CONFIG.find((p) => p.id === id);
    return match?.name || id;
  };

  // Simplified labels: only show 'inactive' when fewer than two witness models are selected
  const getMapLabel = () => {
    if (!isMapEnabled) return "[Map]";
    const name = getProviderName(mapProviderId);
    const inactive = activeCount < 2; // refine requires 2+
    const hint = inactive ? " • inactive" : "";
    return `[Map: ${name || "None"}${hint}]`;
  };

  const getUnifyLabel = () => {
    if (!isUnifyEnabled) return "[Unify]";
    const name = getProviderName(unifyProviderId);
    const inactive = activeCount < 2;
    const hint = inactive ? " • inactive" : "";
    return `[Unify: ${name || "None"}${hint}]`;
  };

  const getDraftLabel = () => {
    const composerName = getProviderName(composerModel);
    const analystName = getProviderName(analystModel);
    return `[Draft: ${composerName}/${analystName}]`;
  };

  // Handle outside clicks for closing expanded and dropdowns
  useEffect(() => {
    const shouldListen =
      isExpanded ||
      showModelsDropdown ||
      showMapDropdown ||
      showUnifyDropdown ||
      showDraftDropdown;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
        setShowModelsDropdown(false);
        setShowMapDropdown(false);
        setShowUnifyDropdown(false);
        setShowDraftDropdown(false);
      }
    };
    if (shouldListen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [
    isExpanded,
    showModelsDropdown,
    showMapDropdown,
    showUnifyDropdown,
    showDraftDropdown,
  ]);

  // Acknowledge first load if needed (but don't render special UI)
  useEffect(() => {
    if (isFirstLoad) {
      onAcknowledgeFirstLoad?.();
    }
  }, [isFirstLoad, onAcknowledgeFirstLoad]);

  // Helper to check status
  const isProviderAvailable = (id: string) => providerStatus[id] !== false;

  return (
    <div
      ref={containerRef}
      className={`w-[min(800px,calc(100%-32px))] pointer-events-auto transition-all duration-200 ease-out`}
    >
      {/* Collapsed State */}
      {!isExpanded && (
        <div className="flex items-center gap-4 text-sm text-text-secondary">
          {/* Models Label with Dropdown Arrow */}
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-1 cursor-pointer bg-chip-soft/50 rounded-full px-3 py-1 hover:bg-surface-highlight transition-colors duration-200"
              onClick={() => {
                const opening = !showModelsDropdown;
                setShowModelsDropdown(opening);
                if (opening) {
                  // ensure only one dropdown is open at a time
                  setShowMapDropdown(false);
                  setShowUnifyDropdown(false);
                  setShowDraftDropdown(false);
                }
              }}
            >
              <span>{getWitnessLabel()}</span>
              <span className="text-xs text-text-muted">▼</span>
            </button>
            {showModelsDropdown && (
              <div
                className="absolute bottom-full left-0 mb-2 bg-surface-highest backdrop-blur-md border border-border-subtle rounded-lg p-2 min-w-[160px] z-[1000] shadow-elevated cursor-default text-left"
                role="menu"
                aria-label="Model selection"
                onClick={(e) => e.stopPropagation()}
              >
                {LLM_PROVIDERS_CONFIG.map((provider) => {
                  const isSelected = !!selectedModels[provider.id];
                  const isAuth = isProviderAvailable(provider.id);
                  return (
                    <label
                      key={provider.id}
                      className={`flex items-center gap-2 p-1 px-2 rounded transition-all duration-200 ${isAuth ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-50'} ${isSelected ? 'bg-brand-500/30' : 'bg-transparent hover:bg-brand-500/10'}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => !isLoading && isAuth && onToggleModel(provider.id)}
                        disabled={isLoading || !isAuth}
                        className="w-3.5 h-3.5 accent-brand-500"
                      />
                      <span className={`text-sm ${isSelected ? 'text-text-brand' : 'text-text-muted'}`}>
                        {provider.name}
                        {!isAuth && " (Login)"}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <span className="text-text-muted/50">•</span>

          {/* Map Label with Dropdown Arrow */}
          <div className="relative">
            <button
              type="button"
              className={`flex items-center gap-1 bg-chip-soft rounded-full px-3 py-1 transition-colors duration-200 ${canRefine ? 'cursor-pointer opacity-100 hover:bg-surface-highlight' : 'cursor-default opacity-50'}`}
              onClick={
                canRefine
                  ? () => {
                    const opening = !showMapDropdown;
                    setShowMapDropdown(opening);
                    if (opening) {
                      setShowModelsDropdown(false);
                      setShowUnifyDropdown(false);
                      setShowDraftDropdown(false);
                    }
                  }
                  : undefined
              }
            >
              <span>{getMapLabel()}</span>
              <span className="text-xs text-text-muted">▼</span>
            </button>
            {showMapDropdown && canRefine && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface-highest text-text-secondary border border-border-subtle rounded-lg p-2 min-w-[170px] z-[1000] shadow-elevated cursor-default text-left"
                role="menu"
                aria-label="Map provider selection"
                onClick={(e) => e.stopPropagation()}
              >
                {LLM_PROVIDERS_CONFIG.map((provider) => {
                  const isSelected = mapProviderId === provider.id;
                  return (
                    <button
                      key={provider.id}
                      onClick={() => {
                        if (isLoading) return;

                        const clickedId = provider.id;
                        // If selecting the same as Unify, auto-switch Unify to a fallback (do not block selection)
                        if (unifyProviderId && unifyProviderId === clickedId) {
                          const selectedIds = LLM_PROVIDERS_CONFIG.map(
                            (p) => p.id,
                          ).filter((id) => selectedModels[id]);
                          const prefer =
                            clickedId === "gemini"
                              ? ["qwen"]
                              : clickedId === "qwen"
                                ? ["gemini"]
                                : ["qwen", "gemini"];
                          let fallback: string | null = null;
                          for (const cand of prefer) {
                            if (
                              cand !== clickedId &&
                              selectedIds.includes(cand)
                            ) {
                              fallback = cand;
                              break;
                            }
                          }
                          if (!fallback) {
                            const anyOther =
                              selectedIds.find((id) => id !== clickedId) || null;
                            fallback = anyOther;
                          }
                          // Apply fallback for Unify first to maintain constraint
                          onSetSynthesisProvider?.(fallback);
                          try {
                            if (fallback)
                              localStorage.setItem(
                                "htos_synthesis_provider",
                                fallback,
                              );
                          } catch { }
                        }

                        if (mapProviderId === clickedId) {
                          // Toggle off Map when clicking the already selected provider
                          onSetMappingProvider?.(null);
                          onToggleMapping?.(false);
                          try {
                            localStorage.removeItem("htos_mapping_provider");
                            localStorage.setItem(
                              "htos_mapping_enabled",
                              JSON.stringify(false),
                            );
                          } catch (_) { }
                        } else {
                          onSetMappingProvider?.(clickedId);
                          onToggleMapping?.(true);
                          try {
                            localStorage.setItem(
                              "htos_mapping_provider",
                              clickedId,
                            );
                            localStorage.setItem(
                              "htos_mapping_enabled",
                              JSON.stringify(true),
                            );
                          } catch (_) { }
                        }
                        setShowMapDropdown(false);
                      }}
                      disabled={isLoading}
                      className={`block w-full text-left px-2.5 py-1.5 rounded transition-all duration-150 text-sm ${isSelected ? 'bg-intent-success/10 text-intent-success' : 'bg-transparent text-text-secondary hover:bg-surface-highlight'}`}
                    >
                      {provider.name}
                      {isSelected && " ✓"}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <span className="text-text-muted/50">•</span>

          {/* Unify Label with Dropdown Arrow */}
          <div className="relative">
            <button
              type="button"
              className={`flex items-center gap-1 bg-chip-soft rounded-full px-3 py-1 transition-colors duration-200 ${canRefine ? 'cursor-pointer opacity-100 hover:bg-surface-highlight' : 'cursor-default opacity-50'}`}
              onClick={
                canRefine
                  ? () => {
                    const opening = !showUnifyDropdown;
                    setShowUnifyDropdown(opening);
                    if (opening) {
                      setShowModelsDropdown(false);
                      setShowMapDropdown(false);
                      setShowDraftDropdown(false);
                    }
                  }
                  : undefined
              }
            >
              <span>{getUnifyLabel()}</span>
              <span className="text-xs text-text-muted">▼</span>
            </button>
            {showUnifyDropdown && canRefine && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface-highest text-text-secondary border border-border-subtle rounded-lg p-2 min-w-[170px] z-[1000] shadow-elevated cursor-default text-left"
                role="menu"
                aria-label="Unify provider selection"
                onClick={(e) => e.stopPropagation()}
              >
                {powerUserMode
                  ? // Multi-select for power user
                  LLM_PROVIDERS_CONFIG.map((provider) => {
                    const isSelected = synthesisProviders.includes(provider.id);
                    return (
                      <label
                        key={provider.id}
                        className={`flex items-center gap-2 p-1.5 px-2 cursor-pointer rounded transition-all duration-150 ${isSelected ? 'bg-intent-warning/10' : 'bg-transparent hover:bg-surface-highlight'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isLoading) return;

                            const clickedId = provider.id;
                            // If selecting same as Map, auto-switch Map to fallback
                            if (mapProviderId === clickedId && !isSelected) {
                              const selectedIds = LLM_PROVIDERS_CONFIG.map(
                                (p) => p.id,
                              ).filter((id) => selectedModels[id]);
                              const prefer =
                                clickedId === "gemini"
                                  ? ["qwen"]
                                  : clickedId === "qwen"
                                    ? ["gemini"]
                                    : ["qwen", "gemini"];
                              let fallback: string | null = null;
                              for (const cand of prefer) {
                                if (
                                  cand !== clickedId &&
                                  selectedIds.includes(cand)
                                ) {
                                  fallback = cand;
                                  break;
                                }
                              }
                              if (!fallback) {
                                const anyOther =
                                  selectedIds.find((id) => id !== clickedId) ||
                                  null;
                                fallback = anyOther;
                              }
                              onSetMappingProvider?.(fallback);
                              try {
                                if (fallback) {
                                  localStorage.setItem(
                                    "htos_mapping_provider",
                                    fallback,
                                  );
                                } else {
                                  localStorage.removeItem(
                                    "htos_mapping_provider",
                                  );
                                }
                              } catch { }
                            }

                            onToggleSynthesisProvider?.(clickedId);
                          }}
                          disabled={isLoading}
                          className="w-3.5 h-3.5 accent-intent-warning"
                        />
                        <span className={`text-sm ${isSelected ? 'text-intent-warning' : 'text-text-muted'}`}>
                          {provider.name}
                        </span>
                      </label>
                    );
                  })
                  : // Single select
                  LLM_PROVIDERS_CONFIG.map((provider) => {
                    const isSelected = unifyProviderId === provider.id;
                    return (
                      <button
                        key={provider.id}
                        onClick={() => {
                          if (isLoading) return;
                          const clickedId = provider.id;

                          // If clicking the same provider, toggle it off. Otherwise, set it.
                          const newUnifyProvider =
                            unifyProviderId === clickedId ? null : clickedId;

                          // If selecting a provider that is the same as Map, auto-switch Map to a fallback.
                          if (
                            newUnifyProvider &&
                            mapProviderId &&
                            mapProviderId === newUnifyProvider
                          ) {
                            const selectedIds = LLM_PROVIDERS_CONFIG.map(
                              (p) => p.id,
                            ).filter((id) => selectedModels[id]);
                            const prefer =
                              newUnifyProvider === "gemini"
                                ? ["qwen"]
                                : newUnifyProvider === "qwen"
                                  ? ["gemini"]
                                  : ["qwen", "gemini"];
                            let fallback: string | null = null;
                            for (const cand of prefer) {
                              if (
                                cand !== newUnifyProvider &&
                                selectedIds.includes(cand)
                              ) {
                                fallback = cand;
                                break;
                              }
                            }
                            if (!fallback) {
                              const anyOther =
                                selectedIds.find(
                                  (id) => id !== newUnifyProvider,
                                ) || null;
                              fallback = anyOther;
                            }
                            onSetMappingProvider?.(fallback);
                            try {
                              if (fallback) {
                                localStorage.setItem(
                                  "htos_mapping_provider",
                                  fallback,
                                );
                                localStorage.setItem(
                                  "htos_mapping_enabled",
                                  JSON.stringify(true),
                                );
                              } else {
                                // If no fallback, disable mapping
                                onToggleMapping?.(false);
                                localStorage.removeItem(
                                  "htos_mapping_provider",
                                );
                                localStorage.setItem(
                                  "htos_mapping_enabled",
                                  JSON.stringify(false),
                                );
                              }
                            } catch { }
                          }

                          onSetSynthesisProvider?.(newUnifyProvider);
                          try {
                            if (newUnifyProvider) {
                              localStorage.setItem(
                                "htos_synthesis_provider",
                                newUnifyProvider,
                              );
                            } else {
                              localStorage.removeItem(
                                "htos_synthesis_provider"
                              );
                            }
                          } catch { }

                          setShowUnifyDropdown(false);
                        }}
                        disabled={isLoading}
                        className={`block w-full text-left px-2.5 py-1.5 rounded transition-all duration-150 text-sm ${isSelected ? 'bg-intent-warning/10 text-intent-warning' : 'bg-transparent text-text-secondary hover:bg-surface-highlight'}`}
                      >
                        {provider.name}
                        {isSelected && " ✓"}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <span className="text-text-muted/50">•</span>

          {/* Draft Label with Dropdown Arrow */}
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-1 cursor-pointer bg-chip-soft rounded-full px-3 py-1 hover:bg-surface-highlight transition-colors duration-200"
              onClick={() => {
                const opening = !showDraftDropdown;
                setShowDraftDropdown(opening);
                if (opening) {
                  setShowModelsDropdown(false);
                  setShowMapDropdown(false);
                  setShowUnifyDropdown(false);
                }
              }}
            >
              <span>{getDraftLabel()}</span>
              <span className="text-xs text-text-muted">▼</span>
            </button>
            {showDraftDropdown && (
              <div
                className="absolute bottom-full right-0 mb-2 bg-surface-highest text-text-secondary border border-border-subtle rounded-lg p-3 min-w-[240px] z-[1000] shadow-elevated flex flex-col gap-3 animate-[slideUp_0.2s_ease-out] cursor-default text-left"
                role="menu"
                aria-label="Draft model selection"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Composer Section */}
                <div>
                  <div className="text-sm font-semibold text-text-muted mb-1.5 uppercase">
                    Composer Model
                  </div>
                  {LLM_PROVIDERS_CONFIG.map((provider) => {
                    const isSelected = composerModel === provider.id;
                    return (
                      <button
                        key={`composer-${provider.id}`}
                        onClick={() => {
                          if (onSetComposerModel) onSetComposerModel(provider.id);
                        }}
                        className={`block w-full text-left px-2.5 py-1.5 rounded mb-0.5 text-sm ${isSelected ? 'bg-brand-500/10 text-brand-400' : 'bg-transparent text-text-secondary hover:bg-surface-highlight'}`}
                      >
                        {provider.name}
                        {isSelected && " ✓"}
                      </button>
                    );
                  })}
                </div>

                {/* Analyst Section */}
                <div>
                  <div className="text-sm font-semibold text-text-muted mb-1.5 uppercase mt-3">
                    Analyst Model
                  </div>
                  {LLM_PROVIDERS_CONFIG.map((provider) => {
                    const isSelected = analystModel === provider.id;
                    return (
                      <button
                        key={`analyst-${provider.id}`}
                        onClick={() => {
                          if (onSetAnalystModel) onSetAnalystModel(provider.id);
                        }}
                        className={`block w-full text-left px-2.5 py-1.5 rounded mb-0.5 text-sm ${isSelected ? 'bg-brand-500/10 text-brand-400' : 'bg-transparent text-text-secondary hover:bg-surface-highlight'}`}
                      >
                        {provider.name}
                        {isSelected && " ✓"}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* Settings Button */}
          <button
            onClick={() => {
              setIsExpanded(true);
              // close any open compact dropdowns when opening expanded view
              setShowModelsDropdown(false);
              setShowMapDropdown(false);
              setShowUnifyDropdown(false);
              setShowDraftDropdown(false);
            }}
            aria-expanded={isExpanded}
            aria-label="Open full settings"
            className="ml-auto bg-none border-none text-text-muted cursor-pointer text-base p-1 rounded transition-all duration-200 hover:bg-surface-highlight"
          >
            ⚙️
          </button>
        </div>
      )}

      {/* Expanded State */}
      {isExpanded && (
        <div className="bg-surface-raised backdrop-blur-md border border-border-subtle rounded-2xl p-4 px-5 max-h-[calc(100vh-160px)] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-text-secondary font-medium flex items-center gap-2">
              ⚙️ Configuration
            </span>
            <button
              onClick={() => setIsExpanded(false)}
              aria-label="Close settings"
              className="bg-none border-none text-text-muted cursor-pointer text-lg p-1 rounded transition-all duration-200 hover:bg-surface-highlight hover:text-text-secondary"
            >
              ×
            </button>
          </div>

          {/* Witness Section */}
          <div className="mb-4">
            <div className="text-xs text-text-muted font-medium mb-2 flex items-center gap-2">
              <span>Witness</span>
              <button
                onClick={() => {
                  // Toggle all models
                  const allSelected =
                    activeCount === LLM_PROVIDERS_CONFIG.length;
                  LLM_PROVIDERS_CONFIG.forEach((provider) => {
                    if (allSelected && selectedModels[provider.id]) {
                      onToggleModel(provider.id);
                    } else if (!allSelected && !selectedModels[provider.id]) {
                      onToggleModel(provider.id);
                    }
                  });
                }}
                disabled={isLoading}
                className={`ml-auto px-2 py-0.5 text-xs bg-chip-soft border border-border-subtle rounded text-text-muted transition-all duration-200 ${isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-surface-highlight'}`}
              >
                [All]
              </button>
            </div>

            <div className="flex gap-2 flex-wrap">
              {LLM_PROVIDERS_CONFIG.map((provider: LLMProvider) => {
                const isSelected = !!selectedModels[provider.id];
                return (
                  <label
                    key={provider.id}
                    className={`flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-md transition-all duration-200 border ${isSelected ? 'bg-brand-500/20 border-brand-500/40' : 'bg-chip-soft border-border-subtle'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => !isLoading && onToggleModel(provider.id)}
                      disabled={isLoading}
                      className="w-3.5 h-3.5 accent-brand-500"
                    />
                    <span className={`text-xs font-medium ${isSelected ? 'text-text-brand' : 'text-text-muted'}`}>
                      {provider.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Refine Section */}
          <div className="mb-4">
            <div className="text-xs text-text-muted font-medium mb-2">
              Refine
            </div>

            <div className="flex gap-4 items-start">
              {/* Map (Mapping) */}
              <div className={canRefine ? 'opacity-100' : 'opacity-50'}>
                <label className="flex flex-col gap-1 cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={!!mappingEnabled}
                      onChange={(e) => {
                        if (isLoading) return;
                        const checked = e.target.checked;
                        // Toggle mapping state and persist immediately
                        onToggleMapping?.(checked);
                        try {
                          localStorage.setItem(
                            "htos_mapping_enabled",
                            JSON.stringify(checked),
                          );
                        } catch (_) { }
                        if (!checked) {
                          // Clear selected mapping provider when disabling mapping
                          onSetMappingProvider?.(null);
                          try {
                            localStorage.removeItem("htos_mapping_provider");
                          } catch (_) { }
                        } else {
                          if (!mapProviderId) {
                            const selectedIds = LLM_PROVIDERS_CONFIG.map(p => p.id).filter(id => selectedModels[id]);
                            const avoid = unifyProviderId || '';
                            const fallback = selectedIds.find(id => id && id !== avoid) || null;
                            onSetMappingProvider?.(fallback);
                            try {
                              if (fallback) localStorage.setItem('htos_mapping_provider', fallback);
                            } catch { }
                          }
                        }
                      }}
                      disabled={!canRefine || isLoading}
                      className="w-3.5 h-3.5 accent-brand-500"
                    />
                    <span className="text-xs text-text-muted">
                      Map
                    </span>
                  </div>
                  <select
                    value={mapProviderId || ''}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      // If choosing same as unify, auto-switch unify to fallback
                      if (val && unifyProviderId === val) {
                        const selectedIds = LLM_PROVIDERS_CONFIG.map(
                          (p) => p.id,
                        ).filter((id) => selectedModels[id]);
                        const prefer =
                          val === "gemini"
                            ? ["qwen"]
                            : val === "qwen"
                              ? ["gemini"]
                              : ["qwen", "gemini"];
                        let fallback: string | null = null;
                        for (const cand of prefer) {
                          if (cand !== val && selectedIds.includes(cand)) {
                            fallback = cand;
                            break;
                          }
                        }
                        if (!fallback) {
                          const anyOther =
                            selectedIds.find((id) => id !== val) || null;
                          fallback = anyOther;
                        }
                        onSetSynthesisProvider?.(fallback);
                        try {
                          if (fallback)
                            localStorage.setItem(
                              "htos_synthesis_provider",
                              fallback,
                            );
                        } catch { }
                      }
                      onSetMappingProvider?.(val);
                      try {
                        if (val) {
                          // Ensure mapping is enabled when a provider is selected
                          onToggleMapping?.(true);
                          localStorage.setItem("htos_mapping_provider", val);
                          localStorage.setItem(
                            "htos_mapping_enabled",
                            JSON.stringify(true),
                          );
                        } else {
                          onToggleMapping?.(false);
                          localStorage.removeItem("htos_mapping_provider");
                          localStorage.setItem(
                            "htos_mapping_enabled",
                            JSON.stringify(false),
                          );
                        }
                      } catch (_) { }
                    }}
                    disabled={!mappingEnabled || !canRefine || isLoading}
                    className={`bg-white/10 border border-white/20 rounded text-text-secondary text-xs px-1.5 py-0.5 ${mappingEnabled && canRefine ? 'opacity-100' : 'opacity-50'}`}
                  >
                    <option value="">Select...</option>
                    {selectedProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!canRefine && (
                  <div className="text-xs text-text-muted mt-1">
                    Select 2+ models to enable.
                  </div>
                )}
              </div>

              {/* Unify (Synthesis) */}
              <div className={canRefine ? 'opacity-100' : 'opacity-50'}>
                <label className="flex flex-col gap-1 cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={isUnifyEnabled}
                      onChange={(e) => {
                        if (!isLoading) {
                          if (
                            e.target.checked &&
                            selectedProviders.length > 0 &&
                            canRefine
                          ) {
                            // For power user, start with first; else single
                            if (powerUserMode) {
                              if (
                                !synthesisProviders.includes(
                                  selectedProviders[0].id,
                                )
                              ) {
                                onToggleSynthesisProvider?.(
                                  selectedProviders[0].id,
                                );
                              }
                            } else {
                              onSetSynthesisProvider?.(selectedProviders[0].id);
                            }
                          } else {
                            if (powerUserMode) {
                              synthesisProviders.forEach((id) =>
                                onToggleSynthesisProvider?.(id),
                              );
                            } else {
                              onSetSynthesisProvider?.(null);
                            }
                          }
                        }
                      }}
                      disabled={!canRefine || isLoading}
                      className="w-3.5 h-3.5 accent-brand-500"
                    />
                    <span className="text-xs text-text-muted">
                      Unify
                    </span>
                  </div>
                  {powerUserMode ? (
                    // Multi-select checkboxes for power user
                    <div className="flex flex-col gap-1 max-h-[100px] overflow-y-auto">
                      {selectedProviders.map((provider) => {
                        const isSelected = synthesisProviders.includes(
                          provider.id,
                        );
                        return (
                          <label
                            key={provider.id}
                            className={`flex items-center gap-1.5 p-1 rounded cursor-pointer transition-all duration-200 ${isSelected ? 'bg-intent-warning/20' : 'bg-transparent'}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isLoading) return;
                                const clickedId = provider.id;
                                // If selecting same as Map, auto-switch Map to fallback
                                if (
                                  mapProviderId === clickedId &&
                                  !isSelected
                                ) {
                                  const selectedIds = LLM_PROVIDERS_CONFIG.map(
                                    (p) => p.id,
                                  ).filter((id) => selectedModels[id]);
                                  const prefer =
                                    clickedId === "gemini"
                                      ? ["qwen"]
                                      : clickedId === "qwen"
                                        ? ["gemini"]
                                        : ["qwen", "gemini"];
                                  let fallback: string | null = null;
                                  for (const cand of prefer) {
                                    if (
                                      cand !== clickedId &&
                                      selectedIds.includes(cand)
                                    ) {
                                      fallback = cand;
                                      break;
                                    }
                                  }
                                  if (!fallback) {
                                    const anyOther =
                                      selectedIds.find(
                                        (id) => id !== clickedId,
                                      ) || null;
                                    fallback = anyOther;
                                  }
                                  onSetMappingProvider?.(fallback);
                                  try {
                                    if (fallback) {
                                      localStorage.setItem(
                                        "htos_mapping_provider",
                                        fallback,
                                      );
                                    } else {
                                      localStorage.removeItem(
                                        "htos_mapping_provider",
                                      );
                                    }
                                  } catch { }
                                }
                                onToggleSynthesisProvider?.(clickedId);
                              }}
                              disabled={isLoading}
                              className="w-3.5 h-3.5 accent-intent-warning"
                            />
                            <span className={`text-xs ${isSelected ? 'text-intent-warning' : 'text-text-muted'}`}>
                              {provider.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <select
                      value={unifyProviderId || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        // If choosing same as map, auto-switch map to fallback
                        if (val && mapProviderId === val) {
                          const selectedIds = LLM_PROVIDERS_CONFIG.map(
                            (p) => p.id,
                          ).filter((id) => selectedModels[id]);
                          const prefer =
                            val === "gemini"
                              ? ["qwen"]
                              : val === "qwen"
                                ? ["gemini"]
                                : ["qwen", "gemini"];
                          let fallback: string | null = null;
                          for (const cand of prefer) {
                            if (cand !== val && selectedIds.includes(cand)) {
                              fallback = cand;
                              break;
                            }
                          }
                          if (!fallback) {
                            const anyOther =
                              selectedIds.find((id) => id !== val) || null;
                            fallback = anyOther;
                          }
                          onSetMappingProvider?.(fallback);
                          try {
                            if (fallback)
                              localStorage.setItem(
                                "htos_mapping_provider",
                                fallback,
                              );
                          } catch { }
                        }
                        onSetSynthesisProvider?.(val);
                      }}
                      disabled={!isUnifyEnabled || !canRefine || isLoading}
                      className={`bg-white/10 border border-white/20 rounded text-text-secondary text-xs px-1.5 py-0.5 ${isUnifyEnabled && canRefine ? 'opacity-100' : 'opacity-50'}`}
                    >
                      <option value="">Select...</option>
                      {selectedProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                {!canRefine && (
                  <div className="text-xs text-text-muted mt-1">
                    Select 2+ models to enable.
                  </div>
                )}
              </div>

              {/* Refine Model */}
              {/* Composer Model */}
              <div>
                <label className="flex flex-col gap-1 cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-muted">
                      Composer
                    </span>
                  </div>
                  <select
                    value={composerModel || ''}
                    onChange={(e) => {
                      const model = e.target.value;
                      if (onSetComposerModel) onSetComposerModel(model);
                    }}
                    disabled={isLoading}
                    className="bg-white/10 border border-white/20 rounded text-text-secondary text-xs px-1.5 py-0.5"
                  >
                    {LLM_PROVIDERS_CONFIG.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Analyst Model */}
              <div>
                <label className="flex flex-col gap-1 cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-muted">
                      Analyst
                    </span>
                  </div>
                  <select
                    value={analystModel || ''}
                    onChange={(e) => {
                      const model = e.target.value;
                      if (onSetAnalystModel) onSetAnalystModel(model);
                    }}
                    disabled={isLoading}
                    className="bg-white/10 border border-white/20 rounded text-text-secondary text-xs px-1.5 py-0.5"
                  >
                    {LLM_PROVIDERS_CONFIG.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* Parley Button - No Apply, just Parley */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                // Enable all models and all refine options (Parley) - but pick different providers if possible
                LLM_PROVIDERS_CONFIG.forEach((provider) => {
                  if (!selectedModels[provider.id]) {
                    onToggleModel(provider.id);
                  }
                });
                onToggleMapping?.(true);
                const availableProviders = LLM_PROVIDERS_CONFIG.filter(
                  (p) => selectedModels[p.id],
                ); // After enabling all
                if (availableProviders.length >= 2) {
                  // Pick first for map, second for unify (avoid same)
                  onSetMappingProvider?.(availableProviders[0].id);
                  onSetSynthesisProvider?.(
                    availableProviders[1]?.id || availableProviders[0].id,
                  );
                }
                setIsExpanded(false);
              }}
              disabled={isLoading}
              className={`px-3 py-1.5 text-xs bg-intent-success/20 border border-intent-success/40 rounded-md text-intent-success font-medium transition-all duration-200 ${isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              Parley
            </button>
          </div>

          {/* Think Toggle - Only show when ChatGPT is selected */}
          {selectedModels.chatgpt && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={thinkOnChatGPT}
                  onChange={() => !isLoading && onToggleThinkChatGPT?.()}
                  disabled={isLoading}
                  className="w-3.5 h-3.5 accent-brand-500"
                />
                <span className="text-sm">🤔</span>
                <span className="text-xs text-text-muted">
                  Think mode for ChatGPT
                </span>
                <span className={`text-xs font-medium ${thinkOnChatGPT ? 'text-intent-success' : 'text-text-muted'}`}>
                  {thinkOnChatGPT ? "ON" : "OFF"}
                </span>
              </label>
            </div>
          )}
        </div>
      )
      }
    </div >
  );
};

export default CompactModelTray;
