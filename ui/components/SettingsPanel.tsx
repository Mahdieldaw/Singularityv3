import React, { useState } from "react";
import { useAtom } from "jotai";
import {
  selectedModelsAtom,
  isVisibleModeAtom,
  powerUserModeAtom,
  isReducedMotionAtom,
  isSettingsOpenAtom,
} from "../state/atoms";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { useProviderStatus } from "../hooks/useProviderStatus";

export default function SettingsPanel() {
  const [isSettingsOpen, setIsSettingsOpen] = useAtom(isSettingsOpenAtom);
  const [selectedModels, setSelectedModels] = useAtom(selectedModelsAtom);
  const [isVisibleMode, setIsVisibleMode] = useAtom(isVisibleModeAtom);
  const [powerUserMode, setPowerUserMode] = useAtom(powerUserModeAtom);
  const [isReducedMotion, setIsReducedMotion] = useAtom(isReducedMotionAtom);

  // NEW: Hook for auth status
  const { status: providerStatus, manualRefresh } = useProviderStatus();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleToggleModel = (providerId: string) => {
    setSelectedModels((prev: any) => ({
      ...prev,
      [providerId]: !prev[providerId],
    }));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await manualRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div
      className={`fixed top-0 w-[350px] h-screen bg-surface-highest/95 backdrop-blur-xl border-l border-border-subtle z-[1100] p-5 overflow-y-auto transition-[right] duration-300 ease-out ${isSettingsOpen ? "right-0" : "-right-[350px]"
        }`}
    >
      <div className="settings-header flex items-center justify-between mb-6">
        <h2 className="settings-title text-lg font-semibold text-text-secondary">
          Model Configuration
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            title="Check Login Status"
            className={`p-2 bg-none border-none cursor-pointer rounded transition-all duration-300 text-lg ${isRefreshing ? "text-brand-500 rotate-180" : "text-text-muted"
              }`}
          >
            ↻
          </button>
          <button
            className="close-settings p-2 bg-none border-none text-text-muted cursor-pointer rounded transition-colors duration-200 text-lg hover:bg-surface-highlight hover:text-text-secondary"
            onClick={() => setIsSettingsOpen(false)}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="model-config">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-text-brand m-0">
            Active Models
          </h3>
        </div>

        {LLM_PROVIDERS_CONFIG.map((provider) => {
          // Default to true if undefined (for providers without specific cookies mapped yet)
          const isAuth = providerStatus[provider.id] !== false;

          return (
            <div
              key={provider.id}
              className={`model-item flex items-center justify-between p-3 bg-chip border border-border-subtle rounded-lg mb-2 transition-all duration-200 ${isAuth ? "opacity-100" : "opacity-60"
                }`}
            >
              <div className="model-info flex items-center gap-2">
                <div
                  className={`model-logo w-4 h-4 rounded ${provider.logoBgClass}`}
                ></div>
                <div className="flex flex-col">
                  <span className="text-text-secondary">{provider.name}</span>
                  {!isAuth && (
                    <span className="text-xs text-intent-danger">
                      Login Required
                    </span>
                  )}
                </div>
              </div>
              <div
                className={`model-toggle relative w-10 h-5 rounded-full cursor-pointer transition-all duration-200 ${selectedModels[provider.id]
                  ? "bg-brand-500"
                  : "bg-border-strong"
                  } ${!isAuth ? "cursor-not-allowed opacity-50" : ""}`}
                onClick={() => isAuth && handleToggleModel(provider.id)}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 ${selectedModels[provider.id] ? "left-[22px]" : "left-0.5"
                    }`}
                />
              </div>
            </div>
          );
        })}

        <h3 className="text-sm font-semibold mb-3 text-text-brand mt-5">
          Execution Mode
        </h3>
        <div className="mode-item flex items-center justify-between p-3 bg-chip border border-border-subtle rounded-lg mb-2">
          <span className="text-text-secondary">
            Run in Visible Tabs (for debugging)
          </span>
          <div
            onClick={() => setIsVisibleMode(!isVisibleMode)}
            className={`relative w-10 h-5 rounded-full cursor-pointer transition-all duration-200 ${isVisibleMode ? "bg-brand-500" : "bg-border-strong"
              }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 ${isVisibleMode ? "left-[22px]" : "left-0.5"
                }`}
            />
          </div>
        </div>

        <h3 className="text-sm font-semibold mb-3 text-text-brand mt-5">
          Advanced Features
        </h3>
        <div className="mode-item flex items-center justify-between p-3 bg-chip border border-border-subtle rounded-lg mb-2">
          <div className="flex flex-col">
            <span className="text-text-secondary">Power User Mode</span>
            <span className="text-xs text-text-muted mt-0.5">
              Enable multi-synthesis selection
            </span>
          </div>
          <div
            className={`mode-toggle relative w-10 h-5 rounded-full cursor-pointer transition-all duration-200 ${powerUserMode ? "bg-brand-500" : "bg-border-strong"
              }`}
            onClick={() => setPowerUserMode(!powerUserMode)}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 ${powerUserMode ? "left-[22px]" : "left-0.5"
                }`}
            />
          </div>
        </div>

        <h3 className="text-sm font-semibold mb-3 text-text-brand mt-5">
          Accessibility
        </h3>
        <div className="mode-item flex items-center justify-between p-3 bg-chip border border-border-subtle rounded-lg mb-2">
          <span className="text-text-secondary">Reduced Motion</span>
          <div
            className={`mode-toggle relative w-10 h-5 rounded-full cursor-pointer transition-all duration-200 ${isReducedMotion ? "bg-brand-500" : "bg-border-strong"
              }`}
            onClick={() => setIsReducedMotion(!isReducedMotion)}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 ${isReducedMotion ? "left-[22px]" : "left-0.5"
                }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
