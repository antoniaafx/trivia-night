import { useState } from "react";

const STORAGE_KEY = "trivia-night:creator-id";

/**
 * A convenience-based anonymous creator identity, not an account.
 * Deliberately localStorage (not the sessionStorage useClientId uses for
 * game participants): a creator needs "my Decks are still mine" to
 * survive closing the browser and coming back tomorrow, not just a
 * refresh within the same tab. Generated once and never regenerated -
 * "My Decks only shows mine" is enforced entirely by the app always
 * filtering queries on this id, not by any database-side check, since
 * there is no real auth for RLS to verify against.
 *
 * Known limitations (see the Milestone 5 report for the full version):
 * clearing this browser's storage, using a different browser, or a
 * different device loses access to every Deck created under this id,
 * permanently and unrecoverably. This is not a substitute for
 * authentication - anyone who obtained this id could act as this
 * creator, exactly as anyone holding the anon key already could act as
 * any room participant today.
 */
export function useCreatorId(): string {
  const [creatorId] = useState<string>(() => {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const created = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  });

  return creatorId;
}
