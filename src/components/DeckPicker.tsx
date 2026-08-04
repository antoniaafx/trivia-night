import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreatorId } from "../hooks/useCreatorId";
import { createDeck } from "../services/deckRepository";
import { computeDeckReadiness, isQuestionComplete } from "../utils/deckValidation";
import { formatApproximateMinutes } from "../utils/formatDuration";
import { MAX_DECKS_PER_GAME, QUESTION_SECONDS_ESTIMATE } from "../config/timingEstimates";
import type { DeckEntry } from "./GameSetupPanel";
import "./DeckPicker.css";

const MOBILE_BREAKPOINT_QUERY = "(max-width: 640px)";

function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
}

interface DeckPickerProps {
  open: boolean;
  /** null while the creator's Decks are still loading. Today this is always "My Decks" - see the module doc comment below for why the prop isn't named that. */
  decks: DeckEntry[] | null;
  selectedDeckIds: string[];
  onChangeSelection: (selectedDeckIds: string[]) => void;
  onClose: () => void;
  /** The active room's code, carried as `?selectForRoom=` into the Create New Deck / Open My Decks escape routes so the Host always lands back on this same room instead of starting a new one. */
  roomCode: string;
}

/**
 * The single place a Host chooses what gets played - opened from Game
 * Setup's "+ Add Deck" button, never a separate page. A centered modal
 * (full-screen below the mobile breakpoint via DeckPicker.css) rather
 * than a drawer: choosing tonight's Decks is a primary decision, not
 * supplementary context, so it earns the room's full attention either
 * way. Every toggle commits immediately through `onChangeSelection` -
 * the same autosave-everywhere pattern the rest of Game Setup already
 * uses - so there's no separate "Cancel" to reason about; Done and
 * Escape/backdrop-click are just ways to close an overlay whose state
 * is already saved.
 *
 * `decks` is deliberately just "the Decks available to choose from,"
 * not "My Decks" - Version 1 only ever passes the creator's own Decks,
 * but nothing here assumes that. A future source picker (Official,
 * Community, Purchased, AI-generated) can sit above this component and
 * feed it a different `decks` array, or a merged one, without this
 * component changing at all.
 */
function DeckPicker({ open, decks, selectedDeckIds, onChangeSelection, onClose, roomCode }: DeckPickerProps) {
  const creatorId = useCreatorId();
  const navigate = useNavigate();
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleToggle(deckId: string) {
    if (selectedDeckIds.includes(deckId)) {
      onChangeSelection(selectedDeckIds.filter((id) => id !== deckId));
      return;
    }
    if (selectedDeckIds.length >= MAX_DECKS_PER_GAME) return;
    onChangeSelection([...selectedDeckIds, deckId]);
  }

  async function handleCreateNew() {
    setCreateError(null);
    setCreatingDeck(true);

    const mobile = isMobileViewport();
    // Opened synchronously, in the same tick as the click, and redirected
    // once the Deck exists - window.open() called after the `await` below
    // is a *new* async task by the time it runs, so browsers no longer
    // treat it as tied to the click and silently block it as a popup.
    const newTab = mobile ? null : window.open("", "_blank");

    try {
      const deck = await createDeck(creatorId);
      const url = `/decks/${deck.id}?selectForRoom=${roomCode}`;
      if (mobile) {
        onClose();
        navigate(url);
        return;
      }
      if (newTab) {
        newTab.location.href = url;
      } else {
        // The synchronous open was itself blocked - fall back to same-tab
        // navigation rather than leaving the Host with a dead click.
        onClose();
        navigate(url);
      }
    } catch {
      newTab?.close();
      setCreateError("Couldn't create a new Deck. Try again.");
    } finally {
      setCreatingDeck(false);
    }
  }

  function handleOpenMyDecksClick() {
    if (isMobileViewport()) onClose();
  }

  const readyEntries = decks?.filter(({ questions }) => computeDeckReadiness(questions).ready) ?? [];
  const notReadyEntries = decks?.filter(({ questions }) => !computeDeckReadiness(questions).ready) ?? [];
  const atMax = selectedDeckIds.length >= MAX_DECKS_PER_GAME;

  return (
    <div
      className="deck-picker-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="deck-picker card" role="dialog" aria-modal="true" aria-label="Add Decks">
        <div className="deck-picker-header">
          <h2>Add Decks</h2>
          <button type="button" className="btn btn-ghost deck-picker-close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <p className="deck-picker-subheading">
          {selectedDeckIds.length}/{MAX_DECKS_PER_GAME} selected
          {atMax && " — remove one to add another"}
        </p>

        <div className="deck-picker-body">
          {decks === null && <p className="deck-picker-status">Loading your Decks...</p>}

          {decks !== null && decks.length === 0 && (
            <p className="deck-picker-status">
              You haven&rsquo;t created any Decks yet — create one below, and Quick Play will keep the game playable in
              the meantime.
            </p>
          )}

          {readyEntries.length > 0 && (
            <ul className="deck-picker-list">
              {readyEntries.map((entry) => (
                <DeckPickerRow
                  key={entry.deck.id}
                  entry={entry}
                  selected={selectedDeckIds.includes(entry.deck.id)}
                  disabled={!selectedDeckIds.includes(entry.deck.id) && atMax}
                  onToggle={() => handleToggle(entry.deck.id)}
                />
              ))}
            </ul>
          )}

          {notReadyEntries.length > 0 && (
            <div className="deck-picker-unready">
              <h3>Not ready to host</h3>
              <ul className="deck-picker-list">
                {notReadyEntries.map((entry) => (
                  <DeckPickerRow key={entry.deck.id} entry={entry} selected={false} disabled unready />
                ))}
              </ul>
            </div>
          )}

          {decks !== null && (
            <div className="deck-picker-secondary">
              <button type="button" className="btn btn-ghost" onClick={() => void handleCreateNew()} disabled={creatingDeck}>
                {creatingDeck ? "Creating…" : "+ Create New Deck"}
              </button>
              <a
                href={`/decks?selectForRoom=${roomCode}`}
                target={isMobileViewport() ? undefined : "_blank"}
                rel={isMobileViewport() ? undefined : "noreferrer"}
                className="btn btn-ghost"
                onClick={handleOpenMyDecksClick}
              >
                Open My Decks
              </a>
            </div>
          )}

          {createError && (
            <p className="deck-picker-error" role="alert">
              {createError}
            </p>
          )}
        </div>

        <button type="button" className="btn btn-primary deck-picker-done" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function DeckPickerRow({
  entry,
  selected,
  disabled,
  unready,
  onToggle,
}: {
  entry: DeckEntry;
  selected: boolean;
  disabled: boolean;
  unready?: boolean;
  onToggle?: () => void;
}) {
  const { deck, questions } = entry;
  const mcCount = questions.filter((question) => question.answerMethod === "multiple_choice").length;
  const typedCount = questions.filter((question) => question.answerMethod === "typed_answer").length;
  const typeParts = [
    mcCount > 0 && `${mcCount} Multiple Choice`,
    typedCount > 0 && `${typedCount} Typed Answer`,
  ].filter((part): part is string => Boolean(part));

  if (unready) {
    const readiness = computeDeckReadiness(questions);
    return (
      <li className="deck-picker-row deck-picker-row-unready">
        <div className="deck-picker-row-info">
          <span className="deck-picker-row-title">{deck.title}</span>
          <span className="deck-picker-row-meta">{readiness.problems[0]}</span>
        </div>
      </li>
    );
  }

  const estimatedSeconds = questions
    .filter(isQuestionComplete)
    .reduce((sum, question) => sum + QUESTION_SECONDS_ESTIMATE[question.answerMethod], 0);

  return (
    <li className="deck-picker-row">
      <label>
        <input type="checkbox" checked={selected} disabled={disabled} onChange={onToggle} />
        <div className="deck-picker-row-info">
          <span className="deck-picker-row-title">{deck.title}</span>
          <span className="deck-picker-row-meta">
            {questions.length} Question{questions.length === 1 ? "" : "s"}
            {estimatedSeconds > 0 && ` · ${formatApproximateMinutes(estimatedSeconds)}`}
            {typeParts.length > 0 && ` · ${typeParts.join(" · ")}`}
          </span>
          <span className="deck-picker-row-meta">Updated {new Date(deck.updatedAt).toLocaleDateString()}</span>
        </div>
      </label>
    </li>
  );
}

export default DeckPicker;
