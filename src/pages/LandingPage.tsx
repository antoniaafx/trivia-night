import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Presentation, Users } from "lucide-react";
import "./LandingPage.css";

function LandingPage() {
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
          <Link to="/host" className="btn btn-primary">
            <Presentation size={20} strokeWidth={2.25} />
            Host a Game
          </Link>
          <Link to="/join" className="btn btn-secondary">
            <Users size={20} strokeWidth={2.25} />
            Join a Game
          </Link>
        </div>

        <p className="landing-reassurance">
          Free to play. Players just need a phone and a room code — no signup, ever.
        </p>
      </motion.div>
    </div>
  );
}

export default LandingPage;
