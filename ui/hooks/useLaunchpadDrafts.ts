import { useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import { launchpadDraftsAtom, launchpadOpenAtom } from "../state/atoms";
import type { LaunchpadDraft } from "..";

export function useLaunchpadDrafts() {
    const [drafts, setDrafts] = useAtom(launchpadDraftsAtom);
    const setOpen = useSetAtom(launchpadOpenAtom);

    const addDraft = useCallback(
        (title: string, text: string, source: LaunchpadDraft["source"]) => {
            const draft: LaunchpadDraft = {
                id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                title,
                text,
                source,
                createdAt: Date.now(),
            };
            setDrafts((prev) => [draft, ...prev]); // New drafts at top
        },
        [setDrafts]
    );

    const updateDraft = useCallback(
        (id: string, text: string) => {
            setDrafts((prev) =>
                prev.map((d) => (d.id === id ? { ...d, text } : d))
            );
        },
        [setDrafts]
    );

    const deleteDraft = useCallback(
        (id: string) => {
            setDrafts((prev) => prev.filter((d) => d.id !== id));
        },
        [setDrafts]
    );

    const reorderDrafts = useCallback(
        (fromIndex: number, toIndex: number) => {
            setDrafts((prev) => {
                const result = Array.from(prev);
                const [removed] = result.splice(fromIndex, 1);
                result.splice(toIndex, 0, removed);
                return result;
            });
        },
        [setDrafts]
    );

    const clearAll = useCallback(() => {
        setDrafts([]);
        setOpen(false);
    }, [setDrafts, setOpen]);

    return {
        drafts,
        addDraft,
        updateDraft,
        deleteDraft,
        reorderDrafts,
        clearAll,
    };
}
