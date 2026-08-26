// ============================================================
// SEARCH LOCK CONTEXT
// Lets a routed page (AnalysePage) tell the GLOBAL navbar to disable its
// fact-check search — e.g. while the results view is showing, where a search
// would navigate away and silently discard the user's analysis.
//
// `reason` is null when search is enabled, or a short human-readable string
// (also used as the tooltip / SR description) when it must be disabled.
// The provider wraps the shared Layout, so it only covers Layout routes and
// resets to null whenever the setting page unmounts (route change).
// ============================================================

import { createContext, useContext, useMemo, useState } from "react";

interface SearchLock {
  reason: string | null;
  setReason: (reason: string | null) => void;
}

const SearchLockContext = createContext<SearchLock>({
  reason: null,
  setReason: () => {},
});

export function SearchLockProvider({ children }: { children: React.ReactNode }) {
  const [reason, setReason] = useState<string | null>(null);
  const value = useMemo(() => ({ reason, setReason }), [reason]);
  return <SearchLockContext.Provider value={value}>{children}</SearchLockContext.Provider>;
}

export function useSearchLock() {
  return useContext(SearchLockContext);
}
