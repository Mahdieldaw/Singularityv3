import React, { useMemo, useEffect, useRef } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  turnIdsAtom,
  isLoadingAtom,
  showWelcomeAtom,
  currentSessionIdAtom,
  isSplitOpenAtom,
  activeSplitPanelAtom,
  isDecisionMapOpenAtom,
  splitPaneRatioAtom,
  chatInputHeightAtom
} from "../state/atoms";
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelGroupHandle } from "react-resizable-panels";
import clsx from "clsx";

import MessageRow from "../components/MessageRow";
import ChatInput from "../components/ChatInput";
import WelcomeScreen from "../components/WelcomeScreen";
import { useScrollPersistence } from "../hooks/useScrollPersistence";
import { useChat } from "../hooks/useChat";
import { SplitPaneRightPanel } from "../components/SplitPaneRightPanel";
import { DecisionMapSheet } from "../components/DecisionMapSheet";
import { CouncilOrbsVertical } from "../components/CouncilOrbsVertical";
import { useSmartProviderDefaults } from "../hooks/useSmartProviderDefaults";

export default function ChatView() {
  const [turnIds] = useAtom(turnIdsAtom as any) as [string[], any];
  const [isLoading] = useAtom(isLoadingAtom as any) as [boolean, any];
  const [showWelcome] = useAtom(showWelcomeAtom as any) as [boolean, any];
  const [currentSessionId] = useAtom(currentSessionIdAtom as any) as [
    string | null,
    any,
  ];

  // Split Pane State
  const isSplitOpen = useAtomValue(isSplitOpenAtom);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
  const isDecisionMapOpen = useAtomValue(isDecisionMapOpenAtom);
  const setDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);
  const splitPaneRatio = useAtomValue(splitPaneRatioAtom);
  const chatInputHeight = useAtomValue(chatInputHeightAtom);
  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);

  // Sync split pane ratio to panel layout (for auto-open/widen)
  useEffect(() => {
    if (panelGroupRef.current && isSplitOpen) {
      panelGroupRef.current.setLayout([splitPaneRatio, 100 - splitPaneRatio]);
    }
  }, [splitPaneRatio, isSplitOpen]);

  // Smart Defaults
  useSmartProviderDefaults();

  const scrollerRef = useScrollPersistence();
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const { selectChat } = useChat();

  // ESC Key Handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDecisionMapOpen) {
          setDecisionMapOpen(null);
        } else if (isSplitOpen) {
          setActiveSplitPanel(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDecisionMapOpen, isSplitOpen, setDecisionMapOpen, setActiveSplitPanel]);

  const itemContent = useMemo(
    () => (index: number, turnId: string) => {
      if (!turnId) {
        return (
          <div className="p-2 text-intent-danger">
            Error: Invalid turn ID
          </div>
        );
      }
      return <MessageRow turnId={turnId} />;
    },
    [],
  );

  // Memoize Virtuoso Scroller to avoid remounts that can reset scroll position
  type ScrollerProps = Pick<
    React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLDivElement>,
      HTMLDivElement
    >,
    "children" | "style" | "tabIndex"
  >;
  const ScrollerComponent = useMemo(
    () =>
      React.forwardRef<HTMLDivElement, ScrollerProps>((props, ref) => (
        <div
          {...props}
          ref={(node) => {
            if (typeof ref === "function") ref(node as HTMLDivElement | null);
            else if (ref && "current" in (ref as any))
              (ref as React.MutableRefObject<HTMLDivElement | null>).current =
                node as HTMLDivElement | null;
            (
              scrollerRef as React.MutableRefObject<HTMLElement | null>
            ).current = node as HTMLDivElement | null;
          }}
          style={{
            ...(props.style || {}),
            WebkitOverflowScrolling: "touch",
          }}
          className="h-full min-h-0 overflow-y-auto"
        />
      )),
    [scrollerRef],
  );

  // Jump-to-turn event listener with optional cross-session loading
  useEffect(() => {
    const handler = async (evt: Event) => {
      try {
        const detail = (evt as CustomEvent<any>).detail || {};
        const targetTurnId: string | undefined =
          detail.turnId || detail.aiTurnId || detail.userTurnId;
        const targetProviderId: string | undefined = detail.providerId;
        const targetSessionId: string | undefined = detail.sessionId;
        if (!targetTurnId) return;

        const doScroll = () => {
          try {
            const index = turnIds.findIndex((id) => id === targetTurnId);
            if (index !== -1) {
              virtuosoRef.current?.scrollToIndex({
                index,
                behavior: "smooth",
                align: "center",
              });
            } else {
              // Fallback to DOM query when item is rendered
              const el = document.querySelector(
                `[data-turn-id="${CSS.escape(targetTurnId)}"]`,
              ) as HTMLElement | null;
              if (el && typeof el.scrollIntoView === "function") {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
            // Brief highlight pulse
            const row =
              document.getElementById(`turn-${targetTurnId}`) ||
              document.querySelector(
                `[data-turn-id="${CSS.escape(targetTurnId)}"]`,
              );
            if (row && row instanceof HTMLElement) {
              row.classList.add('shadow-glow-brand-soft');
              setTimeout(() => {
                row.classList.remove('shadow-glow-brand-soft');
              }, 1200);
            }
            // Focus provider card if requested - open split pane directly
            if (targetProviderId) {
              setTimeout(() => {
                setActiveSplitPanel({
                  turnId: targetTurnId,
                  providerId: targetProviderId
                });
              }, 120);
            }
          } catch (e) {
            console.warn("[ChatView] doScroll failed", e);
          }
        };

        // Cross-session navigation support
        if (
          targetSessionId &&
          currentSessionId &&
          targetSessionId !== currentSessionId
        ) {
          const summary = {
            id: targetSessionId,
            sessionId: targetSessionId,
            startTime: Date.now(),
            lastActivity: Date.now(),
            title: "",
            firstMessage: "",
            messageCount: 0,
            messages: [],
          };
          await selectChat(summary as any);
          // Wait a tick for state to settle then scroll
          requestAnimationFrame(() => doScroll());
        } else {
          doScroll();
        }
      } catch (e) {
        console.warn("[ChatView] jump-to-turn handler failed", e);
      }
    };
    document.addEventListener("jump-to-turn", handler as EventListener);
    return () =>
      document.removeEventListener("jump-to-turn", handler as EventListener);
  }, [turnIds, currentSessionId, selectChat]);

  return (
    <div className="chat-view flex flex-col h-full w-full flex-1 min-h-0 relative">
      {showWelcome ? (
        <WelcomeScreen />
      ) : (
        <PanelGroup
          ref={panelGroupRef}
          direction="horizontal"
          className="flex-1 h-full"
          style={{ paddingBottom: (chatInputHeight || 80) + 12 }}
        >
          {/* LEFT: Main Thread */}
          <Panel defaultSize={60} minSize={35}>
            <Virtuoso
              className="h-full"
              data={turnIds}
              followOutput={(isAtBottom: boolean) =>
                isAtBottom ? "smooth" : false
              }
              increaseViewportBy={{ top: 300, bottom: 200 }}
              components={{
                Scroller: ScrollerComponent as unknown as React.ComponentType<any>,
                Footer: () => <div style={{ height: 24 }} />
              }}
              itemContent={itemContent}
              computeItemKey={(index, turnId) => turnId || `fallback-${index}`}
              ref={virtuosoRef as any}
            />
          </Panel>

          {/* RIGHT: Model Response Panel (only when open) */}
          {isSplitOpen && (
            <>
              {/* Divider with Orbs */}
              <PanelResizeHandle className="w-1.5 bg-border-subtle hover:bg-brand-500/50 transition-colors cursor-col-resize relative z-10">
                {/* Adjacent Orb Column - uses fixed Y centering to prevent shift when ChatInput changes */}
                <div
                  className="divider-handle absolute left-0 -translate-x-full w-10 flex flex-col items-center justify-center gap-2 bg-surface-raised border-y border-l border-border-subtle rounded-l-xl shadow-sm z-20"
                  style={{
                    pointerEvents: 'none',
                    top: 'calc(50vh - 60px)',  // Center relative to viewport height, offset for ChatInput
                    transform: 'translateX(-100%)'
                  }}
                >
                  <div className="orb-bar pointer-events-auto cursor-default" style={{ cursor: 'default' }}>
                    <CouncilOrbsVertical />
                  </div>
                </div>
              </PanelResizeHandle>

              <Panel defaultSize={40} minSize={0} className="min-w-0 overflow-hidden">
                <SplitPaneRightPanel />
              </Panel>
            </>
          )}
        </PanelGroup>
      )}

      {/* Decision Map - Fixed Overlay */}
      <DecisionMapSheet />

      <div
        className={clsx(
          "absolute left-1/2 -translate-x-1/2 max-w-[min(900px,calc(100%-24px))] z-[50] flex flex-col items-center pointer-events-none transition-opacity duration-300",
          showWelcome ? "bottom-[16px]" : "bottom-0",
        )}
      >
        <ChatInput />
      </div>
    </div>
  );
}
