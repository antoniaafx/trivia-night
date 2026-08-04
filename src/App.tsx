import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import LandingPage from "./pages/LandingPage";
import HostControlPanelPage from "./pages/HostControlPanelPage";
import JoinPage from "./pages/JoinPage";
import PlayerRoomPage from "./pages/PlayerRoomPage";
import StagePage from "./pages/StagePage";
import MyDecksPage from "./pages/MyDecksPage";
import DeckEditorPage from "./pages/DeckEditorPage";
import DeckPreviewPage from "./pages/DeckPreviewPage";
import NotFoundPage from "./pages/NotFoundPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/host/:roomCode" element={<HostControlPanelPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/play/:roomCode" element={<PlayerRoomPage />} />
          <Route path="/stage/:roomCode" element={<StagePage />} />
          <Route path="/decks" element={<MyDecksPage />} />
          <Route path="/decks/:deckId" element={<DeckEditorPage />} />
          <Route path="/decks/:deckId/preview" element={<DeckPreviewPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
