import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import LandingPage from "./pages/LandingPage";
import HostSetupPage from "./pages/HostSetupPage";
import HostControlPanelPage from "./pages/HostControlPanelPage";
import JoinPage from "./pages/JoinPage";
import PlayerRoomPage from "./pages/PlayerRoomPage";
import GamePresentationPage from "./pages/GamePresentationPage";
import NotFoundPage from "./pages/NotFoundPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/host" element={<HostSetupPage />} />
          <Route path="/host/:roomCode" element={<HostControlPanelPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/play/:roomCode" element={<PlayerRoomPage />} />
          <Route path="/game/:roomCode" element={<GamePresentationPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
