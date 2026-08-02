import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { generateRoomCode } from "../services/roomCode";
import LoadingScreen from "../components/LoadingScreen";

/**
 * "Host a Game" is a single tap, per the approved Host Lobby UX spec -
 * no setup form, no configuration screen. This page exists only to
 * generate a room code and hand off to the lobby immediately.
 */
function HostSetupPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const roomCode = generateRoomCode();
    navigate(`/host/${roomCode}`, { replace: true });
  }, [navigate]);

  return <LoadingScreen message="Setting up your room..." />;
}

export default HostSetupPage;
