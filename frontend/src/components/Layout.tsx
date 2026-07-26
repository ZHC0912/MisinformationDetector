// ============================================================
// LAYOUT
// Persistent global navbar (MIDAS) + routed page outlet.
// The navbar's centred search drives the /app fact-check feed.
// ============================================================

import { Outlet } from "react-router-dom";
import Navbar from "@/components/Navbar";

export default function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Outlet />
    </div>
  );
}
