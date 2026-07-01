import type { PlayerRoomView } from "@drawandguess/game-core";
import { Check, Play, X } from "lucide-react";
import { roomActions } from "../store/roomStore";

export function RoomPlayerDrawerFooter({ view }: { view: PlayerRoomView }) {
  const self = view.players.find((player) => player.id === view.selfId);
  if (!self) return null;

  const isReady = self.submitted;
  const guestPlayers = view.players.filter((player) => !player.isHost);
  const guestReadyCount = guestPlayers.filter((player) => player.submitted).length;
  const canStart = view.players.length >= 2 && view.players.length <= 10 && view.players.every((player) => player.connected) && guestPlayers.every((player) => player.submitted);

  return (
    <div className="room-drawer-controls">
      {self.isHost ? (
        <button type="button" className="primary-button room-drawer-start" disabled={!canStart} onClick={() => roomActions.start()} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "6px" }}>
          <Play size={17} fill="currentColor" />
          <strong style={{ fontSize: "14px" }}>{guestReadyCount}/{guestPlayers.length}</strong>
        </button>
      ) : (
        <button
          type="button"
          className="primary-button room-drawer-start"
          onClick={() => roomActions.ready()}
          style={{
            background: isReady ? "var(--green)" : "var(--cyan)",
            borderColor: isReady ? "rgba(63, 230, 161, 0.8)" : "rgba(91, 226, 255, 0.8)",
            color: "#07111d",
            boxShadow: isReady ? "0 0 24px rgba(63, 230, 161, 0.3)" : "0 0 24px rgba(91, 226, 255, 0.18)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          {isReady ? <Check size={18} strokeWidth={3} /> : <Play size={17} fill="currentColor" />}
        </button>
      )}
    </div>
  );
}
