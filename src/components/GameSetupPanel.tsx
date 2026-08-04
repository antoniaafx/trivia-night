import { isQuestionComplete } from "../utils/deckValidation";
import { computePlanSummary } from "../utils/gamePlan";
import { formatApproximateMinutes } from "../utils/formatDuration";
import {
  GAME_DURATION_MINUTES_MAX,
  GAME_DURATION_MINUTES_MIN,
  GAME_DURATION_PRESETS_MINUTES,
  MAX_DECKS_PER_GAME,
} from "../config/timingEstimates";
import type { DeckQuestionRecord, DeckRecord } from "../types/deck";
import "./GameSetupPanel.css";

export interface DeckEntry {
  deck: DeckRecord;
  questions: DeckQuestionRecord[];
}

interface GameSetupPanelProps {
  availableDecks: DeckEntry[];
  selectedDeckIds: string[];
  targetDurationSeconds: number;
  onChangeSelection: (selectedDeckIds: string[]) => void;
  onChangeDuration: (targetDurationSeconds: number) => void;
  /** Opens the DeckPicker overlay - browsing/adding Decks happens there, not inline here. See components/DeckPicker.tsx. */
  onOpenPicker: () => void;
}

/**
 * The live, editable Selected-Decks/duration summary embedded directly
 * in Game Setup - every change here calls straight back to the parent,
 * which persists it to rooms.deck_snapshot (see HostControlPanelPage).
 * Browsing and adding Decks happens in the DeckPicker overlay (opened
 * via "+ Add Deck"); this component only shows what's already chosen
 * plus reordering/removal, so it stays compact even with many Decks
 * available. The plan summary shown here is computed locally, from the
 * same pure computePlanSummary the persisted write uses, so what the
 * Host sees can never drift from what actually gets saved.
 */
function GameSetupPanel({
  availableDecks,
  selectedDeckIds,
  targetDurationSeconds,
  onChangeSelection,
  onChangeDuration,
  onOpenPicker,
}: GameSetupPanelProps) {
  const entryById = new Map(availableDecks.map((entry) => [entry.deck.id, entry]));
  const selectedEntries = selectedDeckIds.map((id) => entryById.get(id)).filter((e): e is DeckEntry => e !== undefined);

  const planSummary = computePlanSummary(
    selectedEntries.map(({ deck, questions }) => ({
      deckId: deck.id,
      deckTitle: deck.title,
      questions: questions.filter(isQuestionComplete),
    })),
    targetDurationSeconds,
  );

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

  function handleDurationChange(value: number) {
    if (Number.isNaN(value)) return;
    const clampedMinutes = Math.min(GAME_DURATION_MINUTES_MAX, Math.max(GAME_DURATION_MINUTES_MIN, value));
    onChangeDuration(clampedMinutes * 60);
  }

  const durationMinutes = Math.round(targetDurationSeconds / 60);

  return (
    <div className="game-setup-panel">
      <div className="game-setup-panel-section">
        <h3>
          Selected Decks ({selectedDeckIds.length}/{MAX_DECKS_PER_GAME})
        </h3>
        {selectedEntries.length === 0 ? (
          <p className="game-setup-panel-hint">
            No Decks selected yet — you&rsquo;ll play the built-in Quick Play sample Questions.
          </p>
        ) : (
          <ul className="game-setup-panel-list">
            {selectedEntries.map(({ deck, questions }, index) => {
              const section = planSummary.sections.find((s) => s.deckId === deck.id);
              return (
                <li key={deck.id} className="game-setup-panel-item">
                  <div className="game-setup-panel-item-info">
                    <span className="game-setup-panel-order">{index + 1}.</span>
                    <span>{deck.title}</span>
                    <span className="game-setup-panel-hint">
                      {questions.length} available
                      {section &&
                        ` · ${section.selectedQuestionCount} selected · ${formatApproximateMinutes(section.estimatedSeconds)}`}
                    </span>
                  </div>
                  <div className="game-setup-panel-item-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleMove(deck.id, "up")}
                      disabled={index === 0}
                      aria-label={`Move ${deck.title} up`}
                    >
                      Move Up
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleMove(deck.id, "down")}
                      disabled={index === selectedEntries.length - 1}
                      aria-label={`Move ${deck.title} down`}
                    >
                      Move Down
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleRemove(deck.id)}
                      aria-label={`Remove ${deck.title}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onOpenPicker}
          disabled={selectedDeckIds.length >= MAX_DECKS_PER_GAME}
        >
          {selectedEntries.length === 0 ? "+ Add Deck" : "+ Add Another Deck"}
        </button>
      </div>

      <div className="game-setup-panel-section">
        <h3>Target duration</h3>
        <div className="game-setup-panel-presets">
          {GAME_DURATION_PRESETS_MINUTES.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`btn btn-ghost${durationMinutes === preset ? " game-setup-panel-preset-selected" : ""}`}
              onClick={() => handleDurationChange(preset)}
            >
              {preset} min
            </button>
          ))}
        </div>
        <label htmlFor="setup-duration-input">Custom (minutes)</label>
        <input
          id="setup-duration-input"
          type="number"
          min={GAME_DURATION_MINUTES_MIN}
          max={GAME_DURATION_MINUTES_MAX}
          step={5}
          value={durationMinutes}
          onChange={(event) => handleDurationChange(Number(event.target.value))}
        />
      </div>

      {selectedEntries.length > 0 && (
        <div className="game-setup-panel-section game-setup-panel-summary">
          <h3>Game Plan</h3>
          <p>
            {planSummary.deckCount} Deck{planSummary.deckCount === 1 ? "" : "s"} · {planSummary.questionCount} Question
            {planSummary.questionCount === 1 ? "" : "s"} · {formatApproximateMinutes(planSummary.estimatedDurationSeconds)}
          </p>
        </div>
      )}
    </div>
  );
}

export default GameSetupPanel;
