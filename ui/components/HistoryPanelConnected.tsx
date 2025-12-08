import React, { useMemo, useState, Suspense } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  historySessionsAtom,
  isHistoryLoadingAtom,
  isHistoryPanelOpenAtom,
  currentSessionIdAtom,
} from "../state/atoms";
import { useChat } from "../hooks/useChat";
import HistoryPanel from "./HistoryPanel";
import api from "../services/extension-api";
import { sanitizeSessionForExport } from "../utils/copy-format-utils";
import { toastAtom } from "../state/atoms";
const RenameDialog = React.lazy(() => import("./RenameDialog"));

export default function HistoryPanelConnected() {
  const sessions = useAtomValue(historySessionsAtom);
  const isLoading = useAtomValue(isHistoryLoadingAtom);
  const isOpen = useAtomValue(isHistoryPanelOpenAtom);
  const currentSessionId = useAtomValue(currentSessionIdAtom);
  const setHistorySessions = useSetAtom(historySessionsAtom);
  const setIsHistoryPanelOpen = useSetAtom(isHistoryPanelOpenAtom);
  const setToast = useSetAtom(toastAtom);
  const { newChat, selectChat, deleteChat, deleteChats } = useChat();

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameDefaultTitle, setRenameDefaultTitle] = useState<string>("");
  const [isRenaming, setIsRenaming] = useState<boolean>(false);

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

  const handleExportChat = async (sessionId: string) => {
    try {
      const sessionPayload = await api.getSession(sessionId);
      if (!sessionPayload) throw new Error("Could not fetch session data");

      const exportData = sanitizeSessionForExport(sessionPayload);
      const jsonString = JSON.stringify(exportData, null, 2);

      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      const safeTitle = (exportData.session.title || "session").replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.download = `singularity_export_${safeTitle}_${exportData.exportedAt}.json`;

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
      <HistoryPanel
        isOpen={isOpen}
        sessions={sessions}
        isLoading={isLoading}
        onNewChat={handleNewChat}
        onSelectChat={selectChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={(sessionId: string, currentTitle: string) =>
          openRenameDialog(sessionId, currentTitle)
        }
        onExportChat={handleExportChat}
        deletingIds={deletingIds}
        isBatchMode={isBatchMode}
        selectedIds={selectedIds}
        onToggleBatchMode={handleToggleBatchMode}
        onToggleSessionSelected={handleToggleSelected}
        onConfirmBatchDelete={handleConfirmBatchDelete}
        currentSessionId={currentSessionId}
      />

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
