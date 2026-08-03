import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createHostedRoom, createQuickPlayRoom } from "../services/hostFlow";
import "./HostSetupPage.css";

/**
 * The one fork in the road for hosting. Both choices create the room
 * immediately - the room code, QR, and Join link are live before any
 * game content is finalized. Quick Play's room deliberately never gets
 * a deck_snapshot at all (stays SQL NULL - the sentinel for "use the
 * built-in sample content"); Custom Game's room gets a `planned_game`
 * snapshot with no Deck selected yet, which the Host fills in live from
 * inside the Lobby (see GameSetupPanel).
 */
function HostSetupPage() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState<"quick" | "custom" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleQuickPlay() {
    setStarting("quick");
    setError(null);
    try {
      const roomCode = await createQuickPlayRoom();
      navigate(`/host/${roomCode}`, { replace: true });
    } catch {
      setError("Couldn't create the room. Try again.");
      setStarting(null);
    }
  }

  async function handleCustomGame() {
    setStarting("custom");
    setError(null);
    try {
      const roomCode = await createHostedRoom();
      navigate(`/host/${roomCode}`, { replace: true });
    } catch {
      setError("Couldn't create the room. Try again.");
      setStarting(null);
    }
  }

  return (
    <div className="host-setup-choice">
      <h1>How do you want to host?</h1>

      <div className="host-setup-options">
        <button
          type="button"
          className="host-setup-option"
          onClick={() => void handleQuickPlay()}
          disabled={starting !== null}
        >
          <h2>Quick Play</h2>
          <p>Start immediately with sample questions.</p>
        </button>

        <button
          type="button"
          className="host-setup-option"
          onClick={() => void handleCustomGame()}
          disabled={starting !== null}
        >
          <h2>Create or choose a Deck</h2>
          <p>Host your own trivia.</p>
        </button>
      </div>

      {error && (
        <p className="host-setup-error" role="alert">
          {error}
        </p>
      )}

      <Link to="/decks" className="host-setup-manage-link">
        Manage your Decks
      </Link>
    </div>
  );
}

export default HostSetupPage;
