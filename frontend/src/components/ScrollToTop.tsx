// ============================================================
// SCROLL TO TOP
// On every route (pathname) change, reset the window scroll to the top so a
// new page never opens at the previous page's scroll offset. Mounted once
// inside the router in App.tsx, so it covers all routes.
//
// Deliberately keyed on pathname (with a hash guard) so it does NOT fire for:
//   - the landing page's in-page anchor links (#how / #what / #limits / #top) —
//     those change only the hash; the guard bails and the browser performs the
//     native fragment scroll;
//   - the /app fact-check search (?q=…) — that changes only the query string,
//     leaving AnalysePage's own scroll-to-results behaviour intact.
// ============================================================

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    // A fragment target (#section) means the user is navigating to an anchor —
    // let the browser scroll to it rather than yanking the page to the top.
    if (hash) return;
    // Respect prefers-reduced-motion: instant jump instead of a smooth glide.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: reduce ? "auto" : "smooth" });
  }, [pathname, hash]);

  return null;
}
