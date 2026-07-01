import { Navigate, Route, Routes } from "react-router-dom";
import { GamePage } from "../pages/GamePage";
import { HomePage } from "../pages/HomePage";
import { ResultsPage } from "../pages/ResultsPage";
import { RoomPage } from "../pages/RoomPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room/:code" element={<RoomPage />} />
      <Route path="/game/:code" element={<GamePage />} />
      <Route path="/results/:code" element={<ResultsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
