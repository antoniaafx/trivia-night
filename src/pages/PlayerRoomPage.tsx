import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useClientId } from "../hooks/useClientId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import PlayerList from "../components/PlayerList";
import type { RoomPlayer } from "../types/room";
import "./PlayerRoomPage.css";

const DISPLAY_NAME_KEY = "trivia-night:display-name";

/**
 * Guards on having a display name before connecting to the room - a
 * direct link/refresh with no name on file sends the player back to the
 * join form instead of joining anonymously.
 */
function PlayerRoomPage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const clientId = useClientId();
  const displayName = sessionStorage.getItem(DISPLAY_NAME_KEY);

  const self = useMemo<RoomPlayer | null>(
    () => (displayName ? { clientId, displayName, isHost: false, joinedAt: Date.now() } : null),
    [clientId, displayName],
  );

  if (!self) {
    return <Navigate to={`/join?room=${roomCode}`} replace />;
  }

  return <PlayerRoomContent roomCode={roomCode} self={self} />;
}

function PlayerRoomContent({ roomCode, self }: { roomCode: string; self: RoomPlayer }) {
  const { players, phase, connectionStatus } = useRoomChannel({ roomCode, self });
  const hostPresent = players.some((player) => player.isHost);
  const otherPlayers = players.filter((player) => player.clientId !== self.clientId);

  return (
    <div className="player-room">
      <p className="player-room-status">
        {connectionStatus === "connected"
          ? `You're in! Room ${roomCode}`
          : connectionStatus === "unconfigured"
            ? "Not connected — see the setup notice above"
            : connectionStatus === "disconnected"
              ? "Connection lost — reconnecting..."
              : "Connecting..."}
      </p>

      {phase === "lobby" ? (
        <>
          <h1>Waiting for the host to start...</h1>
          {connectionStatus === "connected" && !hostPresent && (
            <p className="player-room-warning">
              We haven't seen the host yet - double check the room code.
            </p>
          )}
          <div className="player-room-roster">
            <h2>Also here</h2>
            <PlayerList players={otherPlayers} emptyMessage="You're the first one here!" />
          </div>
        </>
      ) : (
        // TODO: replace with the actual question screen once the
        // Question System milestone is implemented.
        <h1>The host started the game! 🎉</h1>
      )}
    </div>
  );
}

export default PlayerRoomPage;
