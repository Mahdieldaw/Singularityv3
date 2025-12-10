import React from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { activeSplitPanelAtom, currentSessionIdAtom } from "../state/atoms";
import { ModelResponsePanel } from "./ModelResponsePanel";

export const SplitPaneRightPanel = React.memo(() => {
    const panelState = useAtomValue(activeSplitPanelAtom);
    const setActivePanel = useSetAtom(activeSplitPanelAtom);
    const sessionId = useAtomValue(currentSessionIdAtom);

    if (!panelState) return null;

    return (
        <div className="h-full w-full min-w-0 flex flex-col bg-surface-raised border-l border-border-subtle overflow-hidden">
            <ModelResponsePanel
                turnId={panelState.turnId}
                providerId={panelState.providerId}
                sessionId={sessionId || undefined}
                onClose={() => setActivePanel(null)}
            />
        </div>
    );
});
