// ui/components/AiTurnBlock.tsx - FIXED ALIGNMENT
import React, { useState } from "react";
import { useSetAtom } from "jotai";
import { toastAtom } from "../state/atoms";
import { AiTurn } from "../types";
import MarkdownDisplay from "./MarkdownDisplay";
import { useSingularityOutput } from "../hooks/useSingularityOutput";


import { CognitiveOutputRenderer } from "./cognitive/CognitiveOutputRenderer";

// --- Helper Functions ---

interface AiTurnBlockProps {
  aiTurn: AiTurn;
}


const AiTurnBlock: React.FC<AiTurnBlockProps> = ({
  aiTurn,
}) => {
  // --- CONNECTED STATE LOGIC ---

  const singularityState = useSingularityOutput(aiTurn.id);

  // --- PRESENTATION LOGIC ---

  const setToast = useSetAtom(toastAtom);
  // State for Claude artifact overlay
  const [selectedArtifact, setSelectedArtifact] = useState<{
    title: string;
    identifier: string;
    content: string;
  } | null>(null);

  const userPrompt: string | null =
    (aiTurn as any)?.userPrompt ??
    (aiTurn as any)?.prompt ??
    (aiTurn as any)?.input ??
    null;



  // --- NEW: Crown Move Handler (Recompute) - REMOVED for historical turns ---
  // The crown is now static for historical turns. Recompute is handled via the button below.


  return (
    <div className="turn-block pb-32 mt-4">
      {userPrompt && (
        <div className="user-prompt-block mt-24 mb-8">
          <div className="text-xs text-text-muted mb-1.5">
            Your Prompt
          </div>
          <div className="bg-surface border border-border-subtle rounded-lg p-3 text-text-secondary">
            {userPrompt}
          </div>
        </div>
      )}

      <div className="ai-turn-block relative group/turn">
        <div className="ai-turn-content flex flex-col gap-3">
          <div className="flex justify-center w-full transition-all duration-300 px-4">
            <div className="w-full max-w-7xl">
              <div className="flex-1 flex flex-col relative min-w-0" style={{ maxWidth: '820px', margin: '0 auto' }}>

                {aiTurn.type === 'ai' ? (
                  <CognitiveOutputRenderer
                    aiTurn={aiTurn}
                    singularityState={singularityState}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Artifact Overlay Modal */}
      {selectedArtifact && (
        <div className="fixed inset-0 bg-overlay-backdrop z-[9999] flex items-center justify-center p-5" onClick={() => setSelectedArtifact(null)}>
          <div className="bg-surface-raised border border-border-strong rounded-2xl max-w-[900px] w-full max-h-[90vh] flex flex-col shadow-elevated" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <div>
                <h3 className="m-0 text-lg text-text-primary font-semibold">
                  📄 {selectedArtifact.title}
                </h3>
                <div className="text-xs text-text-muted mt-1">
                  {selectedArtifact.identifier}
                </div>
              </div>
              <button
                onClick={() => setSelectedArtifact(null)}
                className="bg-transparent border-none text-text-muted text-2xl cursor-pointer px-2 py-1"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar p-5 bg-surface">
              <div className="w-fit min-w-full">
                <MarkdownDisplay content={selectedArtifact.content} />
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t border-border-subtle justify-end">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(selectedArtifact.content);
                    setToast({ id: Date.now(), message: 'Copied artifact', type: 'info' });
                  } catch (err) {
                    console.error("Failed to copy artifact:", err);
                    setToast({ id: Date.now(), message: 'Failed to copy', type: 'error' });
                  }
                }}
                className="bg-surface-raised border border-border-subtle rounded-md px-4 py-2 text-text-secondary text-sm cursor-pointer flex items-center gap-1.5 hover:bg-surface-highlight transition-all"
              >
                📋 Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AiTurnBlock);
