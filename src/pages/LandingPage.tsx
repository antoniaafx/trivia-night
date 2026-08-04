import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Presentation, Users } from "lucide-react";
import { createHostedRoom } from "../services/hostFlow";
import "./LandingPage.css";

/**
 * Hosting a game creates the room immediately and goes straight to the
 * Invite Screen - no Deck/mode chooser first. No Deck is preselected
 * (Game Setup opens with Quick Play, the built-in sample Questions,
 * ready to keep or replace with real Decks once the Host gets there).
 */
function LandingPage() {
  const navigate = useNavigate();
  const [hosting, setHosting] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);

  async function handleHostGame() {
    if (hosting) return;
    setHostError(null);
    setHosting(true);
    try {
      const roomCode = await createHostedRoom();
      navigate(`/host/${roomCode}`);
    } catch {
      setHostError("Couldn't create the room. Try again.");
      setHosting(false);
    }
  }

  return (
    <div className="landing">
      <motion.div
        className="landing-inner container"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <span className="landing-eyebrow">Live trivia, made for a room full of people</span>
        <h1 className="landing-title">
          <span className="text-gradient">Trivia Night</span>
        </h1>
        <p className="landing-subtitle">
          Host a live trivia show on the big screen and let everyone play along
          from their own phone. No app to install, no accounts to create.
        </p>

        <div className="landing-actions">
          <button type="button" className="btn btn-primary" onClick={() => void handleHostGame()} disabled={hosting}>
            <Presentation size={20} strokeWidth={2.25} />
            {hosting ? "Creating room…" : "Host a Game"}
          </button>
          <Link to="/join" className="btn btn-secondary">
            <Users size={20} strokeWidth={2.25} />
            Join a Game
          </Link>
        </div>

        {hostError && (
          <p className="landing-error" role="alert">
            {hostError}
          </p>
        )}

        <p className="landing-reassurance">
          Free to play. Players just need a phone and a room code — no signup, ever.
        </p>
      </motion.div>
    </div>
  );
}

export default LandingPage;
