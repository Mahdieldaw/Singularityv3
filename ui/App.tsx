import React, { useRef, Suspense } from "react";
import { useAtom } from "jotai";
import { usePortMessageHandler } from "./hooks/usePortMessageHandler";
import { useConnectionMonitoring } from "./hooks/useConnectionMonitoring";
import { useHistoryLoader } from "./hooks/useHistoryLoader";
import { useResponsiveLoadingGuard } from "./hooks/useLoadingWatchdog";
import ChatView from "./views/ChatView";
import Header from "./components/Header";
const HistoryPanelConnected = React.lazy(() => import("./components/HistoryPanelConnected"));
import BannerConnected from "./components/BannerConnected";
import CompactModelTrayConnected from "./components/CompactModelTrayConnected";
const SettingsPanel = React.lazy(() => import("./components/SettingsPanel"));
import { Toast } from "./components/Toast";
import { isHistoryPanelOpenAtom } from "./state/atoms";
import { useInitialization } from "./hooks/useInitialization"; // Import the new hook
import { useSmartProviderDefaults } from "./hooks/useSmartProviderDefaults";
import { useOnClickOutside } from "usehooks-ts";
import { useKey } from "./hooks/useKey";

export default function App() {
  // This is now the entry point for all startup logic.
  const isInitialized = useInitialization();
  useSmartProviderDefaults();

  // Initialize other global side effects that can run after init
  usePortMessageHandler();
  useConnectionMonitoring();
  useHistoryLoader(isInitialized); // Pass the flag to the history loader
  // Non-destructive loading guard: surfaces alerts when idle while loading
  useResponsiveLoadingGuard({ idleWarnMs: 15000, idleCriticalMs: 45000 });

  const [isHistoryOpen, setIsHistoryOpen] = useAtom(isHistoryPanelOpenAtom);

  const historyPanelRef = useRef<HTMLDivElement>(null);

  const closePanel = () => setIsHistoryOpen(false);

  useOnClickOutside(historyPanelRef, closePanel);
  useKey("Escape", closePanel);

  // THE INITIALIZATION BARRIER
  if (!isInitialized) {
    // Render a simple loading state or nothing at all.
    // This prevents any child components from running their hooks too early.
    return (
      <div className="flex items-center justify-center h-screen bg-surface-highest">
        <div className="loading-spinner" />
      </div>
    );
  }

  // Once initialized, render the full application.
  return (
    <div className="flex flex-col h-screen w-screen bg-app-gradient min-h-0">
      <Header />
      <BannerConnected />

      {/* Main content area */}
      <div className="flex flex-1 relative min-h-0">
        <main className="chat-main flex-1 flex flex-col relative min-h-0">
          <ChatView />
        </main>

        {/* History Panel Overlay */}
        {isHistoryOpen && (
          <>
            <div
              className="history-backdrop fixed inset-0 bg-overlay-backdrop/10 backdrop-blur-md z-[2999]"
              onClick={closePanel}
            />
            <div
              ref={historyPanelRef}
              className="fixed top-0 left-0 w-[320px] h-screen z-[3000]"
            >
              <Suspense fallback={null}>
                <HistoryPanelConnected />
              </Suspense>
            </div>
          </>
        )}
      </div>

      {/* Settings Panel - Slides in from right */}
      <Suspense fallback={null}>
        <SettingsPanel />
      </Suspense>

      {/* Global Toast Notifications */}
      <Toast />
    </div>
  );
}
