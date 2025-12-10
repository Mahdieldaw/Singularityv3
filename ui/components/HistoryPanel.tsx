import React, { useMemo, useState, Suspense, useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  historySessionsAtom,
  isHistoryLoadingAtom,
  isHistoryPanelOpenAtom,
  currentSessionIdAtom,
  toastAtom
} from "../state/atoms";
import { useChat } from "../hooks/useChat";
import api from "../services/extension-api";
import { normalizeBackendRoundsToTurns } from "../utils/turn-helpers";
import { formatSessionForMarkdown, sanitizeSessionForExport } from "../utils/copy-format-utils";
import logoIcon from "../assets/logos/logo-icon.svg";
import { PlusIcon, TrashIcon, EllipsisHorizontalIcon, ChevronRightIcon } from "./Icons";
import { HistorySessionSummary } from "../types";

const RenameDialog = React.lazy(() => import("./RenameDialog"));

export default function HistoryPanel() {
  // Connected State
  const sessions = useAtomValue(historySessionsAtom);
  const isLoading = useAtomValue(isHistoryLoadingAtom);
  const isOpen = useAtomValue(isHistoryPanelOpenAtom);
  const currentSessionId = useAtomValue(currentSessionIdAtom);
  const setHistorySessions = useSetAtom(historySessionsAtom);
  const setIsHistoryPanelOpen = useSetAtom(isHistoryPanelOpenAtom);
  const setToast = useSetAtom(toastAtom);
  const { newChat, selectChat, deleteChat, deleteChats } = useChat();

  // Local State
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameDefaultTitle, setRenameDefaultTitle] = useState<string>("");
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [activeMenuId, setActiveMenuId] = React.useState<string | null>(null);
  const [showExportSubmenu, setShowExportSubmenu] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // Handlers
  const handleNewChat = () => {
    newChat();
    setIsHistoryPanelOpen(false);
  };

  const handleDeleteChat = async (sessionId: string) => {
    // Track pending deletion
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });

    // Optimistically remove from panel
    const prevSessions = sessions;
    setHistorySessions((draft: any) =>
      draft.filter((s: any) => (s.sessionId || s.id) !== sessionId),
    );

    const ok = await deleteChat(sessionId);

    // Revalidate against backend to prevent flicker-and-revert when SW response is delayed
    try {
      const response = await api.getHistoryList();
      const refreshed = (response?.sessions || []).map((s: any) => ({
        id: s.sessionId,
        sessionId: s.sessionId,
        title: s.title || "Untitled",
        startTime: s.startTime || Date.now(),
        lastActivity: s.lastActivity || Date.now(),
        messageCount: s.messageCount || 0,
        firstMessage: s.firstMessage || "",
        messages: [],
      }));

      setHistorySessions(refreshed as any);

      const stillExists = refreshed.some(
        (s: any) => (s.sessionId || s.id) === sessionId,
      );
      // If the deleted session is gone and was active, clear the chat view immediately
      if (!stillExists && currentSessionId === sessionId) {
        newChat();
      }
    } catch (e) {
      console.error(
        "[HistoryPanel] Failed to refresh history after deletion:",
        e,
      );
      if (!ok) {
        // If the delete call failed and we also failed to refresh, revert UI to previous list
        setHistorySessions(prevSessions as any);
      }
    }

    // Clear pending state
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  };

  const handleToggleBatchMode = () => {
    setIsBatchMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const handleToggleSelected = (sessionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const handleConfirmBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      // If nothing selected, just exit batch mode
      setIsBatchMode(false);
      return;
    }

    // Optimistically remove selected sessions
    const prevSessions = sessions;
    setHistorySessions((draft: any) =>
      draft.filter((s: any) => !ids.includes(s.sessionId || s.id)),
    );

    try {
      const { removed } = await deleteChats(ids);
      // Revalidate list with backend
      const response = await api.getHistoryList();
      const refreshed = (response?.sessions || []).map((s: any) => ({
        id: s.sessionId,
        sessionId: s.sessionId,
        title: s.title || "Untitled",
        startTime: s.startTime || Date.now(),
        lastActivity: s.lastActivity || Date.now(),
        messageCount: s.messageCount || 0,
        firstMessage: s.firstMessage || "",
        messages: [],
      }));
      setHistorySessions(refreshed as any);
    } catch (e) {
      console.error("[HistoryPanel] Batch delete failed:", e);
      // revert UI list on failure
      setHistorySessions(prevSessions as any);
    } finally {
      setIsBatchMode(false);
      setSelectedIds(new Set());
    }
  };

  const openRenameDialog = (sessionId: string, currentTitle: string) => {
    setRenameSessionId(sessionId);
    setRenameDefaultTitle(currentTitle || "Untitled");
  };

  const closeRenameDialog = () => {
    if (isRenaming) return; // prevent closing during active rename to avoid accidental state issues
    setRenameSessionId(null);
    setRenameDefaultTitle("");
  };

  const handleRenameChat = async (newTitle: string) => {
    const sessionId = renameSessionId;
    if (!sessionId) return;
    setIsRenaming(true);

    // Optimistically update local history list
    const prevSessions = sessions;
    setHistorySessions((draft: any) =>
      draft.map((s: any) => {
        const id = s.sessionId || s.id;
        if (id === sessionId) {
          return { ...s, title: newTitle };
        }
        return s;
      }),
    );

    try {
      const res = await api.renameSession(sessionId, newTitle);

      // ✅ FIX: Just check if updated is false/undefined, don't access .error
      if (!res?.updated) {
        throw new Error("Rename failed");
      }
      // Revalidate with backend list to ensure consistency
      try {
        const response = await api.getHistoryList();
        const refreshed = (response?.sessions || []).map((s: any) => ({
          id: s.sessionId,
          sessionId: s.sessionId,
          title: s.title || "Untitled",
          startTime: s.startTime || Date.now(),
          lastActivity: s.lastActivity || Date.now(),
          messageCount: s.messageCount || 0,
          firstMessage: s.firstMessage || "",
          messages: [],
        }));
        setHistorySessions(refreshed as any);
      } catch (e) {
        console.warn(
          "[HistoryPanel] Failed to refresh after rename, keeping optimistic title:",
          e,
        );
      }
      closeRenameDialog();
    } catch (e) {
      console.error("[HistoryPanel] Rename failed:", e);
      // revert optimistic update
      setHistorySessions(prevSessions as any);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleExportChat = async (sessionId: string, format: 'json-safe' | 'json-full' | 'markdown') => {
    try {
      const sessionPayload = await api.getSession(sessionId);
      if (!sessionPayload) throw new Error("Could not fetch session data");

      // Normalize the raw backend rounds to proper TurnMessage[]
      const normalizedTurns = normalizeBackendRoundsToTurns(sessionPayload.turns || [], sessionId);
      const normalizedSession = {
        ...sessionPayload,
        turns: normalizedTurns
      };

      let blob: Blob;
      let filename: string;

      if (format === 'markdown') {
        const markdown = formatSessionForMarkdown(normalizedSession);
        blob = new Blob([markdown], { type: "text/markdown" });
        filename = `singularity_export_${(normalizedSession.title || "session").replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
      } else {
        const mode = format === 'json-full' ? 'full' : 'safe';
        const exportData = sanitizeSessionForExport(normalizedSession, mode);
        const jsonString = JSON.stringify(exportData, null, 2);
        blob = new Blob([jsonString], { type: "application/json" });

        const safeTitle = (exportData.session.title || "session").replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const suffix = format === 'json-full' ? '_backup' : '';
        filename = `singularity_export_${safeTitle}${suffix}_${exportData.exportedAt}.json`;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setToast({ id: Date.now(), message: "Session exported successfully", type: "success" });
    } catch (error) {
      console.error("Export failed:", error);
      setToast({ id: Date.now(), message: "Failed to export session", type: "error" });
    }
  };


  return (
    <>
      <div className="relative w-full h-full bg-surface-soft/90 backdrop-blur-xl border-r border-border-subtle text-text-secondary p-5 overflow-y-auto overflow-x-hidden flex flex-col">
        {isOpen && (
          <>
            <div className="flex items-center gap-2 mb-4 px-1">
              <img src={logoIcon} alt="Singularity" className="w-6 h-6" />
              <span className="font-semibold text-lg text-text-primary">History</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleNewChat}
                className="flex-1 flex items-center justify-center px-3 py-2.5 rounded-lg border border-border-subtle bg-brand-500/15 text-text-secondary cursor-pointer mb-3 transition-all duration-200 hover:bg-brand-500/20 hover:border-border-strong"
                title="Start a new chat"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  if (!isBatchMode) {
                    handleToggleBatchMode();
                    return;
                  }
                  const count = selectedIds ? selectedIds.size : 0;
                  if (count > 0) {
                    handleConfirmBatchDelete();
                  } else {
                    // If none selected, exit batch mode
                    handleToggleBatchMode();
                  }
                }}
                className={`flex-1 flex items-center justify-center px-3 py-2.5 rounded-lg border cursor-pointer mb-3 transition-all duration-200 ${isBatchMode
                  ? "bg-intent-danger/15 border-intent-danger/45 text-text-secondary hover:bg-intent-danger/20"
                  : "bg-brand-500/15 border-border-subtle text-text-secondary hover:bg-brand-500/20 hover:border-border-strong"
                  }`}
                title={
                  isBatchMode
                    ? "Confirm delete selected chats"
                    : "Select chats to delete"
                }
              >
                {isBatchMode ? (
                  <span className="text-sm font-medium">
                    {selectedIds && selectedIds.size ? `Delete (${selectedIds.size})` : "Delete"}
                  </span>
                ) : (
                  <TrashIcon className="w-5 h-5" />
                )}
              </button>
            </div>
            <div className="history-items flex-grow overflow-y-auto">
              {isLoading ? (
                <p className="text-text-muted text-sm text-center mt-5">
                  Loading history...
                </p>
              ) : sessions.length === 0 ? (
                <p className="text-text-muted text-sm text-center mt-5">
                  No chat history yet.
                </p>
              ) : (
                (sessions as HistorySessionSummary[])
                  .filter((s) => s && s.sessionId)
                  .sort(
                    (a, b) =>
                      (b.lastActivity || b.startTime || 0) -
                      (a.lastActivity || a.startTime || 0),
                  )
                  .map((session: HistorySessionSummary) => (
                    <div
                      key={session.id}
                      onClick={() => {
                        const isDeleting =
                          !!deletingIds &&
                          (deletingIds as Set<string>).has(session.sessionId);
                        if (isDeleting) return; // disable selection while deletion is pending
                        if (isBatchMode) {
                          handleToggleSelected(session.sessionId);
                        } else {
                          selectChat(session);
                        }
                      }}
                      className={`p-2.5 px-3 rounded-lg text-base cursor-pointer mb-2 flex items-start justify-between gap-2 transition-all duration-200 
                        ${session.sessionId === currentSessionId
                          ? "bg-brand-500/10 text-text-primary shadow-sm"
                          : "bg-chip text-text-secondary hover:bg-surface-highlight"
                        }
                        ${!!deletingIds && (deletingIds as Set<string>).has(session.sessionId)
                          ? "opacity-60 pointer-events-none"
                          : ""
                        }`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          const isDeleting =
                            !!deletingIds &&
                            (deletingIds as Set<string>).has(session.sessionId);
                          if (!isDeleting) {
                            if (isBatchMode) {
                              handleToggleSelected(session.sessionId);
                            } else {
                              selectChat(session);
                            }
                          }
                        }
                      }}
                      title={session.title}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {isBatchMode && (
                          <input
                            type="checkbox"
                            checked={
                              !!selectedIds &&
                              (selectedIds as Set<string>).has(session.sessionId)
                            }
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleSelected(session.sessionId);
                            }}
                            aria-label={`Select ${session.title} for deletion`}
                            className="flex-shrink-0 accent-brand-500"
                          />
                        )}
                        <span className="overflow-wrap-anywhere break-words whitespace-normal">
                          {session.title}
                        </span>
                      </div>
                      {!isBatchMode && (
                        <div className="relative ml-2">
                          <button
                            className="p-1 rounded-md hover:bg-surface-highlight text-text-secondary transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(
                                activeMenuId === session.sessionId
                                  ? null
                                  : session.sessionId,
                              );
                            }}
                          >
                            <EllipsisHorizontalIcon className="w-5 h-5" />
                          </button>

                          {activeMenuId === session.sessionId && (
                            <div
                              className="absolute right-0 top-full mt-1 w-32 bg-surface-raised border border-border-subtle rounded-lg shadow-lg z-20 overflow-hidden flex flex-col py-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="text-left px-3 py-2 text-sm hover:bg-surface-highlight text-text-primary flex items-center gap-2 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRenameDialog(session.sessionId, session.title);
                                  setActiveMenuId(null);
                                }}
                              >
                                <span className="text-xs">✏️</span> Rename
                              </button>
                              <div
                                className="relative group"
                                onMouseEnter={() => setShowExportSubmenu(session.sessionId)}
                                onMouseLeave={() => setShowExportSubmenu(null)}
                              >
                                <button
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-highlight text-text-primary flex items-center justify-between transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs">💾</span> Export
                                  </div>
                                  <ChevronRightIcon className="w-4 h-4 text-text-muted" />
                                </button>

                                {showExportSubmenu === session.sessionId && (
                                  <div className="absolute left-full top-0 ml-1 w-48 bg-surface-raised border border-border-subtle rounded-lg shadow-lg overflow-hidden flex flex-col py-1 z-30">
                                    <button
                                      className="text-left px-3 py-2 text-sm hover:bg-surface-highlight text-text-primary transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExportChat(session.sessionId, 'json-safe');
                                        setActiveMenuId(null);
                                      }}
                                    >
                                      JSON (Safe)
                                    </button>
                                    <button
                                      className="text-left px-3 py-2 text-sm hover:bg-surface-highlight text-text-primary transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExportChat(session.sessionId, 'json-full');
                                        setActiveMenuId(null);
                                      }}
                                    >
                                      JSON (Full Backup)
                                    </button>
                                    <button
                                      className="text-left px-3 py-2 text-sm hover:bg-surface-highlight text-text-primary transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExportChat(session.sessionId, 'markdown');
                                        setActiveMenuId(null);
                                      }}
                                    >
                                      Markdown
                                    </button>
                                  </div>
                                )}
                              </div>
                              <button
                                className={`text-left px-3 py-2 text-sm hover:bg-intent-danger/10 text-intent-danger flex items-center gap-2 transition-colors ${!!deletingIds &&
                                  (deletingIds as Set<string>).has(session.sessionId)
                                  ? "opacity-50 cursor-not-allowed"
                                  : ""
                                  }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    !!deletingIds &&
                                    (deletingIds as Set<string>).has(session.sessionId)
                                  )
                                    return;
                                  handleDeleteChat(session.sessionId);
                                  setActiveMenuId(null);
                                }}
                              >
                                <span className="text-xs">🗑️</span> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </>
        )}
      </div>

      <Suspense fallback={null}>
        <RenameDialog
          isOpen={!!renameSessionId}
          onClose={closeRenameDialog}
          onRename={handleRenameChat}
          defaultTitle={renameDefaultTitle}
          isRenaming={isRenaming}
        />
      </Suspense>
    </>
  );
}
