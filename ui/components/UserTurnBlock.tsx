import React, { useState, useCallback } from "react";
import { UserTurn } from "../types";
import { UserIcon, ChevronDownIcon, ChevronUpIcon } from "./Icons";
import MarkdownDisplay from "./MarkdownDisplay";
import clsx from "clsx";

import { useSetAtom } from "jotai";
import { toastAtom } from "../state/atoms";

const CopyButton = ({
  text,
  label,
  onClick,
}: {
  text: string;
  label: string;
  onClick?: () => void;
}) => {
  const setToast = useSetAtom(toastAtom);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setToast({ id: Date.now(), message: 'Copied to clipboard', type: 'info' });
        setTimeout(() => setCopied(false), 2000);
        onClick?.();
      } catch (error) {
        console.error("Failed to copy text:", error);
        setToast({ id: Date.now(), message: 'Failed to copy', type: 'error' });
      }
    },
    [text, onClick, setToast],
  );

  return (
    <button
      onClick={handleCopy}
      aria-label={label}
      className="bg-surface-raised border border-border-subtle rounded-md px-2 py-1 text-text-muted text-xs cursor-pointer hover:bg-surface-highlight transition-all"
    >
      {copied ? "✓" : "📋"} {copied ? "Copied" : "Copy"}
    </button>
  );
};

interface UserTurnBlockProps {
  userTurn: UserTurn;
  isExpanded: boolean;
  onToggle: () => void;
  // Note: All props related to the action bar have been removed.
  // The UserTurnBlock is now a pure display component for the prompt.
}

const UserTurnBlock = ({
  userTurn,
  isExpanded,
  onToggle,
}: UserTurnBlockProps) => {
  const date = new Date(userTurn.createdAt);
  const readableTimestamp = date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const isoTimestamp = date.toISOString();

  return (
    <div
      className="user-turn-block flex gap-3 p-3 bg-surface-raised border border-border-subtle rounded-2xl mx-auto max-w-3xl"
    >
      <div className="user-avatar w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center flex-shrink-0">
        <UserIcon className="w-4.5 h-4.5 text-brand-500" />
      </div>
      <div className="user-content flex-1 min-w-0 flex flex-col overflow-x-hidden min-h-[80px]">
        <div
          className={clsx(
            "flex justify-between items-center cursor-pointer",
            isExpanded ? "mb-2" : "mb-0"
          )}
          onClick={onToggle}
        >
          <span className="text-xs font-semibold text-text-secondary">
            Your Prompt
          </span>
          {isExpanded ? (
            <ChevronUpIcon className="w-4 h-4 text-text-secondary" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-text-secondary" />
          )}
        </div>

        {isExpanded ? (
          <>
            {/* Prose wrapper for consistent line width */}
            <div className="mx-auto max-w-3xl w-full">
              <div
                className="user-message text-base leading-relaxed text-text-primary break-words mb-2"
                style={{ overflowWrap: "anywhere" }}
              >
                <MarkdownDisplay content={String(userTurn.text || "")} />
              </div>
            </div>
            <div className="user-metadata flex items-center gap-3 text-xs text-text-muted">
              <span
                className="timestamp"
                title={isoTimestamp}
                aria-label={`Sent at ${readableTimestamp}`}
              >
                {readableTimestamp}
              </span>
              {userTurn.sessionId && (
                <span className="session-id" title={userTurn.sessionId}>
                  Session: {userTurn.sessionId.slice(-6)}
                </span>
              )}
            </div>
            <div className="mt-auto flex justify-end">
              <CopyButton text={userTurn.text} label="Copy user prompt" />
            </div>
          </>
        ) : (
          <div className="mx-auto max-w-3xl w-full">
            <div
              className="user-message-preview text-base text-text-secondary overflow-hidden pt-1 mb-1 line-clamp-3 break-words"
              style={{ overflowWrap: "anywhere" }}
            >
              <MarkdownDisplay content={String(userTurn.text || "")} />
            </div>
          </div>
        )}

        {!isExpanded && (
          <div className="mt-auto flex justify-end">
            <CopyButton
              text={String(userTurn.text || "")}
              label="Copy user prompt"
            />
          </div>
        )}
      </div>
    </div >
  );
};

export default React.memo(UserTurnBlock);
