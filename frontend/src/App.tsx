// ============================================================
// APP — router setup.
//   /            → landing page
//   /app         → the analysis tool
//   /evaluation  → model evaluation dashboard
// A shared Layout renders the persistent header + routed outlet.
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
        <Route element={<Layout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<AnalysePage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/evaluation" element={<EvaluationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
