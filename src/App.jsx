import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import Home from "./pages/Home";
import Host from "./pages/Host";
import Teacher from "./pages/Teacher";
import Join from "./pages/Join";
import Professional from "./pages/Professional";
import FamilyAndFriends from "./pages/FamilyAndFriends";

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<Host />} />

        <Route path="/teacher" element={<Teacher />} />
        <Route path="/join" element={<Join />} />

        <Route path="/professional" element={<Professional />} />
        <Route path="/family-and-friends" element={<FamilyAndFriends />} />

        <Route
          path="/our-mission"
          element={<div style={{ paddingTop: "calc(var(--header-h) + 24px)" }}>Our Mission</div>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
