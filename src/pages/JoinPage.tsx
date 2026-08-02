import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./JoinPage.css";

function JoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState(searchParams.get("room")?.toUpperCase() ?? "");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedCode = roomCode.trim().toUpperCase();
    const trimmedName = displayName.trim();

    if (!trimmedCode) {
      setError("Enter a room code to join.");
      return;
    }
    if (!trimmedName) {
      setError("Enter a display name.");
      return;
    }

    // Stored per-tab so PlayerRoomPage can pick it up, and so a refresh
    // on the same tab doesn't lose it.
    sessionStorage.setItem("trivia-night:display-name", trimmedName);
    navigate(`/play/${trimmedCode}`);
  }

  return (
    <div className="join-page">
      <form className="join-form card" onSubmit={handleSubmit}>
        <h1>Join a game</h1>

        <label htmlFor="roomCode">Room code</label>
        <input
          id="roomCode"
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          placeholder="e.g. BANANA"
          autoComplete="off"
          maxLength={8}
        />

        <label htmlFor="displayName">Your name</label>
        <input
          id="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="What should we call you?"
          autoComplete="off"
          maxLength={24}
        />

        {error && (
          <p className="join-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary">
          Join
        </button>
      </form>
    </div>
  );
}

export default JoinPage;
