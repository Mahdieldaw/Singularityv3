import React, { useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { EXAMPLE_PROMPT } from "../constants";
import logoIcon from "../assets/logos/logo-icon.svg";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { CouncilOrbs } from "./CouncilOrbs";
import { useProviderStatus } from "../hooks/useProviderStatus";
import { useSmartProviderDefaults } from "../hooks/useSmartProviderDefaults";
import { synthesisProviderAtom, mappingProviderAtom, composerModelAtom, analystModelAtom } from "../state/atoms";
import { setProviderLock } from "@shared/provider-locks";

interface WelcomeScreenProps {
  onSendPrompt?: (prompt: string) => void;
  isLoading?: boolean;
}

const WelcomeScreen = ({ onSendPrompt, isLoading }: WelcomeScreenProps) => {
  useProviderStatus();
  useSmartProviderDefaults();

  const providers = useMemo(() => LLM_PROVIDERS_CONFIG.filter(p => p.id !== "system"), []);
  const [trayExpanded, setTrayExpanded] = useState(false);
  const synthesisProvider = useAtomValue(synthesisProviderAtom);
  const activeVoice = synthesisProvider || "";
  const [, setSynth] = useAtom(synthesisProviderAtom);
  const [, setMapper] = useAtom(mappingProviderAtom);
  const [, setComposer] = useAtom(composerModelAtom);
  const [, setAnalyst] = useAtom(analystModelAtom);

  const handleOrbClick = (providerId: string) => {
    setSynth(providerId);
    setProviderLock('synthesis', true);
  };

  const handleCrownMove = (providerId: string) => {
    setProviderLock('synthesis', true);
  };

  const handleTrayExpand = () => setTrayExpanded(v => !v);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-10 relative">
      {/* Orb Icon */}
      <img
        src={logoIcon}
        alt="Singularity AI"
        className="h-32 w-32 mb-6"
      />

      {/* Brand Text */}
      <h1 className="text-4xl font-semibold tracking-[0.15em] mb-2 uppercase">
        <span className="text-white">SINGULAR</span>
        <span className="text-brand-400">ITY AI</span>
      </h1>

      <h2 className="text-xl font-medium mb-3 text-text-primary">
        Intelligence Augmentation
      </h2>

      <p className="text-base text-text-muted mb-8 max-w-md">
        Ask one question, get synthesized insights from multiple AI models in
        real-time
      </p>

      {onSendPrompt && (
        <button
          onClick={() => onSendPrompt(EXAMPLE_PROMPT)}
          disabled={isLoading}
          className="text-sm text-text-brand px-4 py-2
                     border border-text-brand rounded-lg
                     bg-chip-soft hover:bg-surface-highlight
                     disabled:cursor-not-allowed disabled:opacity-50
                     transition-all duration-200"
        >
          Try: "{EXAMPLE_PROMPT}"
        </button>
      )}

      <div className="fixed inset-x-0 bottom-[96px] pointer-events-auto z-[3002] flex justify-center">
        <div className="w-full max-w-[820px] opacity-50 hover:opacity-100 transition-opacity">
          <CouncilOrbs
            turnId="welcome"
            providers={providers}
            voiceProviderId={String(activeVoice)}
            onOrbClick={handleOrbClick}
            onCrownMove={handleCrownMove}
            onTrayExpand={handleTrayExpand}
            isTrayExpanded={trayExpanded}
            variant="divider"
          />
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
