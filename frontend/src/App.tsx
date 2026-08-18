// ============================================================
// APP — router setup.
//   /            → landing page (dark; owns its own navbar + footer)
//   /app         → the analysis tool
//   /evaluation  → model evaluation dashboard
// The landing page sits OUTSIDE the shared Layout so it can render
// its own dark chrome. Every other route keeps the shared (light)
// Layout with the global Navbar + Footer.
// ============================================================

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import LandingPage from "@/components/LandingPage";
import AnalysePage from "@/components/AnalysePage";
import EvaluationPage from "@/components/EvaluationPage";
import SourcesPage from "@/components/SourcesPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing: standalone, no shared Layout (its own dark navbar/footer). */}
        <Route path="/" element={<LandingPage />} />

        {/* App surfaces: shared light Layout with global Navbar + Footer. */}
        <Route element={<Layout />}>
          <Route path="/app" element={<AnalysePage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/evaluation" element={<EvaluationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
