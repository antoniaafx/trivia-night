import { MAX_DECKS_PER_GAME } from "../config/timingEstimates";
import type { PlannedGamePlanSummary } from "../utils/gamePlan";
import type { DeckEntry } from "../types/deck";
import "./SelectedDecksPanel.css";

interface SelectedDecksPanelProps {
  availableDecks: DeckEntry[];
  selectedDeckIds: string[];
  onChangeSelection: (selectedDeckIds: string[]) => void;
  /** Opens the DeckPicker overlay - browsing/adding Decks happens there, not inline here. See components/DeckPicker.tsx. */
  onOpenPicker: () => void;
  /** Computed once by the caller (GameSetupPhase) from the same selection, and shared with the Game Summary card, so the two can never disagree. */
  planSummary: PlannedGamePlanSummary;
}

/**
 * The live, editable Selected-Decks grid embedded in the Host Dashboard
 * - every change here calls straight back to the parent, which persists
 * it to rooms.deck_snapshot (see HostControlPanelPage). Browsing and
 * adding Decks happens in the DeckPicker overlay (opened via the "+"
 * card); this component only shows what's already chosen, plus
 * reordering/removing it, so it stays compact even with several Decks
 * selected. Deliberately selection-only - no Preview/Edit/Create
 * affordance lives here; Game Setup is Deck selection only (previewing
 * a Deck's content happens in the Deck Library, before hosting).
 *
 * There is no game-length setting here at all: the game plays every
 * Question from every selected Deck, in order - see gamePlan.ts's
 * computeGamePlan.
 */
function SelectedDecksPanel({
  availableDecks,
  selectedDeckIds,
  onChangeSelection,
  onOpenPicker,
  planSummary,
}: SelectedDecksPanelProps) {
  const entryById = new Map(availableDecks.map((entry) => [entry.deck.id, entry]));
  const selectedEntries = selectedDeckIds.map((id) => entryById.get(id)).filter((e): e is DeckEntry => e !== undefined);
  const atMax = selectedDeckIds.length >= MAX_DECKS_PER_GAME;

  function handleRemove(deckId: string) {
    onChangeSelection(selectedDeckIds.filter((id) => id !== deckId));
  }

  function handleMove(deckId: string, direction: "up" | "down") {
    const index = selectedDeckIds.indexOf(deckId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= selectedDeckIds.length) return;
    const next = [...selectedDeckIds];
    const temp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = temp;
    onChangeSelection(next);
  }

  return (
    <div className="selected-decks-panel">
      {selectedEntries.length === 0 ? (
        <p className="selected-decks-empty">
          No Decks selected yet — you&rsquo;ll play the built-in Quick Play sample Questions.
        </p>
      ) : (
        <p className="selected-decks-count">
          {selectedDeckIds.length}/{MAX_DECKS_PER_GAME} selected
        </p>
      )}

      <div className="selected-decks-grid">
        {selectedEntries.map(({ deck, questions }, index) => {
          const section = planSummary.sections.find((s) => s.deckId === deck.id);
          return (
            <div key={deck.id} className="selected-deck-card">
              <button
                type="button"
                className="selected-deck-card-remove"
                onClick={() => handleRemove(deck.id)}
                aria-label={`Remove ${deck.title}`}
              >
                ✕
              </button>
              <div className="selected-deck-card-body">
                <p className="selected-deck-card-title">{deck.title}</p>
                <p className="selected-deck-card-meta">
                  {section ? section.selectedQuestionCount : questions.length} Question
                  {(section ? section.selectedQuestionCount : questions.length) === 1 ? "" : "s"}
                </p>
              </div>
              <div className="selected-deck-card-reorder">
                <button
                  type="button"
                  className="selected-deck-card-icon-btn"
                  onClick={() => handleMove(deck.id, "up")}
                  disabled={index === 0}
                  aria-label={`Move ${deck.title} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="selected-deck-card-icon-btn"
                  onClick={() => handleMove(deck.id, "down")}
                  disabled={index === selectedEntries.length - 1}
                  aria-label={`Move ${deck.title} down`}
                >
                  ↓
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          className="selected-deck-add-card"
          onClick={onOpenPicker}
          disabled={atMax}
          aria-label={atMax ? "Deck limit reached" : "Add a Deck"}
        >
          <span className="selected-deck-add-card-icon" aria-hidden="true">
            +
          </span>
          <span className="selected-deck-add-card-label">Add Deck</span>
        </button>
      </div>
    </div>
  );
}

export default SelectedDecksPanel;
