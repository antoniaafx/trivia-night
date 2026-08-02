import { useParams } from "react-router-dom";
import PlaceholderPage from "../components/PlaceholderPage";

function GamePresentationPage() {
  const { roomCode } = useParams<{ roomCode: string }>();

  return (
    <PlaceholderPage
      eyebrow="Presentation Screen"
      title={`Room ${roomCode ?? ""}`}
      description="This full-screen view will show questions, live answer counts, and the leaderboard for everyone to watch. Coming in the next development phase."
    />
  );
}

export default GamePresentationPage;
