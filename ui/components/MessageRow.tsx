import React, { useMemo } from "react";
import { useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { turnsMapAtom } from "../state/atoms";
import UserTurnBlock from "./UserTurnBlock";
import AiTurnBlock from "./AiTurnBlock";

function MessageRow({ turnId }: { turnId: string }) {
  const turnAtom = useMemo(
    () => selectAtom(turnsMapAtom, (map) => map.get(turnId)),
    [turnId],
  );
  const message = useAtomValue(turnAtom);

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
    <div className="message-row" data-turn-id={turnId} id={`turn-${turnId}`}>
      {content}
    </div>
  );
}

export default React.memo(MessageRow);
