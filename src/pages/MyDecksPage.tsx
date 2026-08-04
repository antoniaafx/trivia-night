import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCreatorId } from "../hooks/useCreatorId";
import { createDeck, deleteDeck, duplicateDeck, fetchDecksForCreator } from "../services/deckRepository";
import { addDeckToRoom, checkRoomSelectable, createHostedRoom, type RoomSelectionStatus } from "../services/hostFlow";
import { importOfficialDemoDeck, officialDemoDeckStatus } from "../services/officialDemoDeck";
import { formatApproximateMinutes } from "../utils/formatDuration";
import LoadingScreen from "../components/LoadingScreen";
import type { DeckSummary } from "../types/deck";
import "./MyDecksPage.css";

/**
 * "Write first. Organize later." - no folders, no tags, no filters.
 * Just a flat, most-recently-updated list of the creator's own Decks,
 * scoped entirely by the anonymous creator id (see useCreatorId) - the
 * server never enforces this, so this filter is the actual mechanism,
 * not just a UI convenience.
 */
function MyDecksPage() {
  const creatorId = useCreatorId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectForRoom = searchParams.get("selectForRoom");
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyDeckId, setBusyDeckId] = useState<string | null>(null);

  // "active-room selection mode" - reached via the DeckPicker's empty-state
  // link or "Create one in My Decks" fallback while a Host already has a
  // room with connected Players. Re-checked on every mount rather than
  // trusted from the URL alone, since the room could finish or the game
  // could start in another tab while this page sits open.
  const [roomSelectionStatus, setRoomSelectionStatus] = useState<RoomSelectionStatus | "checking">("checking");

  useEffect(() => {
    if (!selectForRoom) return;
    let cancelled = false;
    setRoomSelectionStatus("checking");
    checkRoomSelectable(selectForRoom)
      .then((status) => {
        if (!cancelled) setRoomSelectionStatus(status);
      })
      .catch(() => {
        if (!cancelled) setRoomSelectionStatus("not_found");
      });
    return () => {
      cancelled = true;
    };
  }, [selectForRoom]);

  // Temporary developer control - see services/officialDemoDeck.ts. Only
  // rendered while this browser's creator doesn't already have a complete
  // copy, so it disappears on its own once used; to be removed entirely
  // once the Official Demo Deck is confirmed visible in every environment
  // that needs it.
  const [demoDeckNeeded, setDemoDeckNeeded] = useState(false);
  const [importingDemoDeck, setImportingDemoDeck] = useState(false);
  const [demoDeckError, setDemoDeckError] = useState<string | null>(null);

  const loadDecks = useCallback(async () => {
    try {
      const result = await fetchDecksForCreator(creatorId);
      setDecks(result);
      setError(null);
    } catch {
      setError("Couldn't load your Decks. Try refreshing.");
    }
  }, [creatorId]);

  useEffect(() => {
    void loadDecks();
  }, [loadDecks]);

  useEffect(() => {
    let cancelled = false;
    officialDemoDeckStatus(creatorId)
      .then((status) => {
        if (!cancelled) setDemoDeckNeeded(status !== "complete");
      })
      .catch(() => {
        // Non-critical: the control simply won't offer to fix itself if this check fails.
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId, decks]);

  async function handleImportDemoDeck() {
    setImportingDemoDeck(true);
    setDemoDeckError(null);
    try {
      await importOfficialDemoDeck(creatorId);
      await loadDecks();
      setDemoDeckNeeded(false);
    } catch {
      setDemoDeckError("Couldn't import the Official Demo Deck. Try again.");
    } finally {
      setImportingDemoDeck(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const deck = await createDeck(creatorId);
      navigate(selectForRoom ? `/decks/${deck.id}?selectForRoom=${selectForRoom}` : `/decks/${deck.id}`);
    } catch {
      setError("Couldn't create a new Deck. Try again.");
      setCreating(false);
    }
  }

  async function handleDuplicate(deckId: string) {
    setBusyDeckId(deckId);
    setError(null);
    try {
      await duplicateDeck(deckId, creatorId);
      await loadDecks();
    } catch {
      setError("Couldn't duplicate that Deck. Try again.");
    } finally {
      setBusyDeckId(null);
    }
  }

  async function handleHost(deckId: string) {
    setBusyDeckId(deckId);
    setError(null);
    try {
      const roomCode = await createHostedRoom([deckId]);
      navigate(`/host/${roomCode}`);
    } catch {
      setError("Couldn't create the room. Try again.");
      setBusyDeckId(null);
    }
  }

  async function handleAddToGame(deckId: string) {
    if (!selectForRoom) return;
    setBusyDeckId(deckId);
    setError(null);
    try {
      const result = await addDeckToRoom(selectForRoom, deckId);
      if (!result.ok) {
        setRoomSelectionStatus(result.reason === "deck_limit_reached" ? roomSelectionStatus : result.reason);
        setError(
          result.reason === "deck_limit_reached"
            ? "That room already has the maximum number of Decks."
            : "That room can't accept new Decks right now.",
        );
        setBusyDeckId(null);
        return;
      }
      navigate(`/host/${selectForRoom}`);
    } catch {
      setError("Couldn't add that Deck to the room. Try again.");
      setBusyDeckId(null);
    }
  }

  async function handleDelete(deck: DeckSummary) {
    if (!window.confirm(`Delete "${deck.title}"? Its Questions will also be deleted.`)) return;
    setBusyDeckId(deck.id);
    setError(null);
    try {
      await deleteDeck(deck.id);
      setDecks((prev) => prev?.filter((existing) => existing.id !== deck.id) ?? null);
    } catch {
      setError("Couldn't delete that Deck. Try again.");
    } finally {
      setBusyDeckId(null);
    }
  }

  if (decks === null && !error) {
    return <LoadingScreen message="Loading your Decks..." />;
  }

  const selectMode = Boolean(selectForRoom);
  const selectValid = roomSelectionStatus === "valid";

  return (
    <div className="my-decks">
      <div className="my-decks-header">
        <h1>{selectMode ? `Choose a Deck for room ${selectForRoom}` : "My Decks"}</h1>
        <button type="button" className="btn btn-primary" onClick={() => void handleCreate()} disabled={creating}>
          Create Deck
        </button>
      </div>

      {selectMode && (
        <p className="my-decks-select-context">
          {roomSelectionStatus === "checking" && "Checking that room..."}
          {roomSelectionStatus === "not_found" && `Room ${selectForRoom} couldn't be found.`}
          {roomSelectionStatus === "not_editable" &&
            `Room ${selectForRoom} has already started or ended, so it can't accept a new Deck.`}
          {selectValid && (
            <>
              Adding a Deck here will add it to that room and bring you back to Game Setup.{" "}
              <Link to={`/host/${selectForRoom}`}>Back to Game Setup</Link>
            </>
          )}
        </p>
      )}

      {error && (
        <p className="my-decks-error" role="alert">
          {error}
        </p>
      )}

      {demoDeckNeeded && (
        <div className="my-decks-dev-tool">
          <p>
            Temporary developer tool: this browser doesn&rsquo;t have the Official Demo Deck yet.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void handleImportDemoDeck()}
            disabled={importingDemoDeck}
          >
            {importingDemoDeck ? "Importing…" : "Import Official Demo Deck"}
          </button>
          {demoDeckError && (
            <p className="my-decks-error" role="alert">
              {demoDeckError}
            </p>
          )}
        </div>
      )}

      {decks && decks.length === 0 ? (
        <div className="my-decks-empty">
          <p>You haven&rsquo;t created any trivia yet.</p>
          <button type="button" className="btn btn-primary" onClick={() => void handleCreate()} disabled={creating}>
            Create your first Deck
          </button>
        </div>
      ) : (
        <ul className="my-decks-list">
          {decks?.map((deck) => (
            <li key={deck.id} className="my-decks-item">
              <div className="my-decks-item-info">
                <h2>{deck.title}</h2>
                <p className="my-decks-meta">
                  {deck.questionCount} Question{deck.questionCount === 1 ? "" : "s"}
                  {deck.estimatedSeconds > 0 && ` · ${formatApproximateMinutes(deck.estimatedSeconds)}`}
                </p>
                {deck.incompleteCount > 0 && (
                  <p className="my-decks-meta">
                    {deck.incompleteCount} Question{deck.incompleteCount === 1 ? "" : "s"} need attention
                  </p>
                )}
                <p className="my-decks-meta">Updated {new Date(deck.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="my-decks-item-actions">
                <Link
                  to={selectMode ? `/decks/${deck.id}?selectForRoom=${selectForRoom}` : `/decks/${deck.id}`}
                  className="btn btn-ghost"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void (selectMode ? handleAddToGame(deck.id) : handleHost(deck.id))}
                  disabled={busyDeckId === deck.id || (selectMode && !selectValid)}
                >
                  {selectMode ? "Add to Game" : "Host"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void handleDuplicate(deck.id)}
                  disabled={busyDeckId === deck.id}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void handleDelete(deck)}
                  disabled={busyDeckId === deck.id}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MyDecksPage;
