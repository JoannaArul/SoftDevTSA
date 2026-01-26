import { BrowserRouter, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Home from "./pages/Home";

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/teacher"
          element={<div style={{ paddingTop: "calc(var(--header-h) + 24px)" }}>Teacher Page</div>}
        />
        <Route
          path="/join"
          element={<div style={{ paddingTop: "calc(var(--header-h) + 24px)" }}>Join Page</div>}
        />
        <Route
          path="/our-mission"
          element={<div style={{ paddingTop: "calc(var(--header-h) + 24px)" }}>Our Mission</div>}
        />
      </Routes>
    </BrowserRouter>
  );
}
