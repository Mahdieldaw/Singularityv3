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
  isDecisionMapOpenAtom
} from "../state/atoms";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import clsx from "clsx";

import MessageRow from "../components/MessageRow";
import ChatInputConnected from "../components/ChatInputConnected";
import WelcomeScreen from "../components/WelcomeScreen";
import { useScrollPersistence } from "../hooks/useScrollPersistence";
import CompactModelTrayConnected from "../components/CompactModelTrayConnected";
import { useChat } from "../hooks/useChat";
import { SplitPaneRightPanel } from "../components/SplitPaneRightPanel";
import { DecisionMapSheet } from "../components/DecisionMapSheet";
import { CouncilOrbsVertical } from "../components/CouncilOrbsVertical";

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
            // Focus provider card if requested
            if (targetProviderId) {
              setTimeout(() => {
                document.dispatchEvent(
                  new CustomEvent("htos:scrollToProvider", {
                    detail: {
                      aiTurnId: targetTurnId,
                      providerId: targetProviderId,
                    },
                  }),
                );
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
    <div className="chat-view flex flex-col h-full w-full flex-1 min-h-0">
      {showWelcome ? (
        <WelcomeScreen />
      ) : (
        <PanelGroup direction="horizontal" className="flex-1">
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
                {/* Adjacent Orb Column - pointer-events-none wrapper */}
                <div className="absolute top-1/2 -translate-y-1/2 left-0 -translate-x-full w-10 flex flex-col items-center justify-center gap-2 bg-surface-raised border-y border-l border-border-subtle rounded-l-xl shadow-sm z-20 pointer-events-none">
                  <div className="pointer-events-auto">
                    <CouncilOrbsVertical />
                  </div>
                </div>
              </PanelResizeHandle>

              <Panel defaultSize={40} minSize={0}>
                <SplitPaneRightPanel />
              </Panel>
            </>
          )}
        </PanelGroup>
      )}

      {/* Decision Map - Fixed Overlay */}
      <DecisionMapSheet />

      {/* Bottom Dock: Tray + Input */}
      <div
        className={clsx(
          "sticky bottom-0 left-0 w-full z-[2001] flex flex-col items-center gap-1 pointer-events-none pb-2 bg-transparent transition-opacity duration-300",
          isDecisionMapOpen && "opacity-0"
        )}
      >
        <CompactModelTrayConnected />
        <ChatInputConnected />
      </div>
    </div>
  );
}