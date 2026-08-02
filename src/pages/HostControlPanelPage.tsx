import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useClientId } from "../hooks/useClientId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import PlayerList from "../components/PlayerList";
import type { RoomPlayer } from "../types/room";
import "./HostControlPanelPage.css";

// TODO: once the Question System is implemented, this page grows into the
// full Live Game Dashboard (question control, reveal, pacing) for the
// "active" phase. For this milestone it only covers the lobby.
function HostControlPanelPage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const clientId = useClientId();

  const self = useMemo<RoomPlayer>(
    () => ({ clientId, displayName: "Host", isHost: true, joinedAt: Date.now() }),
    [clientId],
  );

  const { players, phase, connectionStatus, broadcastPhaseChange } = useRoomChannel({
    roomCode,
    self,
  });

  const joinUrl = `${window.location.origin}/join?room=${roomCode}`;
  const joinedPlayers = players.filter((player) => !player.isHost);

  return (
    <div className="host-lobby">
      <div className="host-lobby-invite card">
        <QRCodeSVG value={joinUrl} size={180} bgColor="transparent" fgColor="#f5f3ff" />
        <p className="host-lobby-code">
          Room code: <strong>{roomCode}</strong>
        </p>
        <p className="host-lobby-status">
          {connectionStatus === "connected" ? "Room is live" : "Connecting..."}
        </p>
      </div>

      <div className="host-lobby-roster">
        <h2>
          {joinedPlayers.length} player{joinedPlayers.length === 1 ? "" : "s"} joined
        </h2>
        <PlayerList players={joinedPlayers} emptyMessage="Waiting for players to join..." />
      </div>

      {phase === "lobby" ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => broadcastPhaseChange("active")}
        >
          Start Game
        </button>
      ) : (
        <p className="host-lobby-started">
          Game started! Question screens arrive in the next milestone.
        </p>
      )}
    </div>
  );
}

export default HostControlPanelPage;
