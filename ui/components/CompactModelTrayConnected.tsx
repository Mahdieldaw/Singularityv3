import React from "react";
import { useAtom } from "jotai";
import CompactModelTray from "./CompactModelTray";
import {
  selectedModelsAtom,
  mappingEnabledAtom,
  mappingProviderAtom,
  synthesisProviderAtom,
  synthesisProvidersAtom,
  powerUserModeAtom,
  thinkOnChatGPTAtom,
  chatInputHeightAtom,
  isFirstTurnAtom,
  isLoadingAtom,
  composerModelAtom, // Import
  analystModelAtom, // Import
} from "../state/atoms";
// NEW: Import the hook
import { useProviderStatus } from "../hooks/useProviderStatus";

const CompactModelTrayConnected = () => {
  // NEW: Initialize provider status logic
  const { status: providerStatus } = useProviderStatus();

  const [selectedModels, setSelectedModels] = useAtom(selectedModelsAtom);
  const [mappingEnabled, setMappingEnabled] = useAtom(mappingEnabledAtom);
  const [mappingProvider, setMappingProvider] = useAtom(mappingProviderAtom);
  const [synthesisProvider, setSynthesisProvider] = useAtom(synthesisProviderAtom);
  const [synthesisProviders, setSynthesisProviders] = useAtom(synthesisProvidersAtom);
  const [powerUserMode] = useAtom(powerUserModeAtom);
  const [thinkOnChatGPT, setThinkOnChatGPT] = useAtom(thinkOnChatGPTAtom);
  const [chatInputHeight] = useAtom(chatInputHeightAtom);
  const [isFirstLoad] = useAtom(isFirstTurnAtom);
  const [isLoading] = useAtom(isLoadingAtom);
  const [composerModel, setComposerModel] = useAtom(composerModelAtom);
  const [analystModel, setAnalystModel] = useAtom(analystModelAtom);

  const handleToggleModel = (providerId: string) => {
    setSelectedModels((prev) => ({
      ...prev,
      [providerId]: !prev[providerId],
    }));
  };

  const handleToggleMapping = (enabled: boolean) => {
    setMappingEnabled(enabled);
    try {
      localStorage.setItem("htos_mapping_enabled", JSON.stringify(enabled));
    } catch { }
  };

  const handleSetMappingProvider = (providerId: string | null) => {
    setMappingProvider(providerId);
    try {
      if (providerId) {
        localStorage.setItem("htos_mapping_provider", providerId);
      } else {
        localStorage.removeItem("htos_mapping_provider");
      }
    } catch { }
  };

  const handleSetSynthesisProvider = (providerId: string | null) => {
    setSynthesisProvider(providerId);
    try {
      if (providerId) {
        localStorage.setItem("htos_synthesis_provider", providerId);
      } else {
        localStorage.removeItem("htos_synthesis_provider");
      }
    } catch { }
  };

  const handleToggleSynthesisProvider = (providerId: string) => {
    setSynthesisProviders((prev) => {
      if (prev.includes(providerId)) {
        return prev.filter((id) => id !== providerId);
      } else {
        return [...prev, providerId];
      }
    });
  };

  const handleToggleThinkChatGPT = () => {
    setThinkOnChatGPT((prev) => !prev);
  };

  const handleSetComposerModel = (model: string) => {
    setComposerModel(model);
    try {
      localStorage.setItem('htos_composer_model', model);
    } catch { }
  };

  const handleSetAnalystModel = (model: string) => {
    setAnalystModel(model);
    try {
      localStorage.setItem('htos_analyst_model', model);
    } catch { }
  };

  return (
    <CompactModelTray
      selectedModels={selectedModels}
      onToggleModel={handleToggleModel}
      isLoading={isLoading}
      thinkOnChatGPT={thinkOnChatGPT}
      onToggleThinkChatGPT={handleToggleThinkChatGPT}
      synthesisProvider={synthesisProvider}
      onSetSynthesisProvider={handleSetSynthesisProvider}
      mappingEnabled={mappingEnabled}
      onToggleMapping={handleToggleMapping}
      mappingProvider={mappingProvider}
      onSetMappingProvider={handleSetMappingProvider}
      powerUserMode={powerUserMode}
      synthesisProviders={synthesisProviders}
      onToggleSynthesisProvider={handleToggleSynthesisProvider}
      isFirstLoad={isFirstLoad}
      onAcknowledgeFirstLoad={() => {
        try {
          localStorage.setItem("htos_has_used", "true");
        } catch { }
      }}
      chatInputHeight={chatInputHeight}
      composerModel={composerModel}
      onSetComposerModel={handleSetComposerModel}
      analystModel={analystModel}
      onSetAnalystModel={handleSetAnalystModel}
    />
  );
};

export default CompactModelTrayConnected;
