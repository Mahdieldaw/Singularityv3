import React from "react";
import { LLMProvider, ProviderResponse } from "..";

interface ClipsCarouselProps {
  providers: LLMProvider[];
  responsesMap: Record<string, ProviderResponse[]>;
  activeProviderId?: string;
  onClipClick: (providerId: string) => void;
  type?: "synthesis" | "mapping";
}

const ClipsCarousel: React.FC<ClipsCarouselProps> = ({
  providers,
  responsesMap,
  activeProviderId,
  onClipClick,
  type = "synthesis",
}) => {
  // In ClipsCarousel.tsx - Simplified for historical-only usage
  const getProviderState = (
    providerId: string,
  ): "never-run" | "available" | "loading" => {
    const responses = responsesMap[providerId];

    if (responses === undefined) {
      return "never-run";
    }

    if (!Array.isArray(responses) || responses.length === 0) {
      return "never-run";
    }

    const last = responses[responses.length - 1];
    if (last.status === "pending" || last.status === "streaming") {
      return "loading";
    }

    return "available";
  };

  return (
    <div className="flex gap-2 flex-wrap">
      {providers.map((p) => {
        const state = getProviderState(String(p.id));
        const isSelected = activeProviderId === p.id;
        const isDisabled = state === "loading";
        const isNeverRun = state === "never-run";

        return (
          <button
            type="button"
            key={String(p.id)}
            onClick={() => !isDisabled && onClipClick(String(p.id))}
            disabled={isDisabled}
            title={
              isNeverRun
                ? `Run ${p.name} ${type}`
                : state === "loading"
                  ? `${p.name} (${type} running...)`
                  : `View ${p.name} ${type}`
            }
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
              border text-xs transition-all
              ${isDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}
              ${isNeverRun
                ? 'bg-surface-soft text-text-muted border-border-subtle'
                : 'bg-chip-soft text-text-secondary border-border-subtle'
              }
            `}
            style={{
              ...(isSelected && p.color ? {
                borderColor: p.color,
                boxShadow: `0 0 0 2px ${p.color}20`
              } : {})
            }}
          >
            {state === "loading"
              ? "⏳"
              : isNeverRun
                ? "○"
                : isSelected
                  ? "●"
                  : "◉"}
            {p.name}
          </button>
        );
      })}
    </div>
  );
};

export default ClipsCarousel;
