// ============================================================
// LAYOUT
// Persistent global navbar (MIDAS) + routed page outlet.
// The navbar's centred search drives the /app fact-check feed.
// ============================================================

import { Outlet } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { SearchLockProvider } from "@/components/SearchLockContext";

export default function Layout() {
  // Sticky-footer column: the routed content grows to fill, so the shared MIDAS
  // Footer sits at the bottom on short pages instead of floating mid-screen.
  // SearchLockProvider lets a routed page disable the navbar search (e.g. the
  // /app results view) — scoped to these Layout routes only.
  return (
    <SearchLockProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </div>
    </SearchLockProvider>
  );
}
