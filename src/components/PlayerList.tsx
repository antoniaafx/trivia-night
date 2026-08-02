import type { RoomPlayer } from "../types/room";
import "./PlayerList.css";

interface PlayerListProps {
  players: RoomPlayer[];
  emptyMessage: string;
}

function PlayerList({ players, emptyMessage }: PlayerListProps) {
  if (players.length === 0) {
    return <p className="player-list-empty">{emptyMessage}</p>;
  }

  return (
    <ul className="player-list">
      {players.map((player) => (
        <li key={player.clientId} className="player-list-item">
          {player.displayName}
          {player.isHost && <span className="player-list-badge">Host</span>}
        </li>
      ))}
    </ul>
  );
}

export default PlayerList;
