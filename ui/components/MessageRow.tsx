import React, { useMemo } from "react";
import { useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { activeSplitPanelAtom, turnsMapAtom } from "../state/atoms";
import UserTurnBlock from "./UserTurnBlock";
import AiTurnBlock from "./AiTurnBlock";
import clsx from "clsx";

function MessageRow({ turnId }: { turnId: string }) {
  const turnAtom = useMemo(
    () => selectAtom(turnsMapAtom, (map) => map.get(turnId)),
    [turnId],
  );
  const message = useAtomValue(turnAtom);
  const isActiveTurn = useAtomValue(
    useMemo(
      () => selectAtom(activeSplitPanelAtom, (p) => p?.turnId === turnId),
      [turnId],
    ),
  );

  if (!message) {
    return (
      <div className="p-2 text-intent-danger">
        Error: Missing turn {turnId}
      </div>
    );
  }

  const content =
    (message as any).type === "user" ? (
      <UserTurnBlock userTurn={message as any} />
    ) : (
      <AiTurnBlock aiTurn={message as any} />
    );

  // Wrap each row with an anchor for scroll/highlight targeting
  return (
    <div
      className={clsx(
        "message-row relative",
        isActiveTurn && (message as any).type === "ai" && "active-turn",
      )}
      data-turn-id={turnId}
      data-turn-type={(message as any).type}
      id={`turn-${turnId}`}
    >
      {content}
    </div>
  );
}

export default React.memo(MessageRow);
