import { useEffect, useState } from "react";

/**
 * How many joined Players/Teams to show as name chips before
 * summarizing the rest as "+N more" - deliberately viewport-based so
 * the card never grows into its own scroll container: a chip row wraps
 * to at most a couple of lines at any of these limits, instead of an
 * unbounded list. Recomputed on breakpoint crossings only (matchMedia
 * "change", not a raw resize listener) since it only ever needs to
 * change at those three tiers. Shared by every roster that needs this
 * truncation - the Host Dashboard's own Invite Lobby roster and Live
 * Game result groups, and the Stage Lobby's "Players Joined" roster.
 */
function computeRosterLimit(): number {
  if (window.matchMedia("(max-width: 420px)").matches) return 3;
  if (window.matchMedia("(max-width: 768px)").matches) return 4;
  return 6;
}

export function useRosterLimit(): number {
  const [limit, setLimit] = useState(computeRosterLimit);

  useEffect(() => {
    const queries = [window.matchMedia("(max-width: 420px)"), window.matchMedia("(max-width: 768px)")];
    function update() {
      setLimit(computeRosterLimit());
    }
    queries.forEach((query) => query.addEventListener("change", update));
    return () => queries.forEach((query) => query.removeEventListener("change", update));
  }, []);

  return limit;
}
