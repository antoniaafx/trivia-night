import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCreatorId } from "../hooks/useCreatorId";
import { useAutosaveController, type SaveStatus } from "../hooks/useAutosaveController";
import {
  appendQuestion,
  deleteQuestion,
  duplicateQuestion,
  fetchDeck,
  fetchDeckQuestions,
  moveQuestion,
  renameDeck,
  restoreQuestion,
  updateQuestion,
  type DeckQuestionPatch,
} from "../services/deckRepository";
import { createHostedRoom } from "../services/hostFlow";
import { computeDeckReadiness, cleanAcceptedVariants } from "../utils/deckValidation";
import LoadingScreen from "../components/LoadingScreen";
import type { AnswerMethod, QuestionOption } from "../data/questions";
import type { DeckQuestionRecord, DeckRecord } from "../types/deck";
import "./DeckEditorPage.css";

const UNDO_WINDOW_MS = 6000;
const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;

function DeckEditorPage() {
  const { deckId = "" } = useParams<{ deckId: string }>();
  const creatorId = useCreatorId();
  const navigate = useNavigate();
  const autosave = useAutosaveController();
  const [hostBusy, setHostBusy] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);

  const [deck, setDeck] = useState<DeckRecord | null>(null);
  const [questions, setQuestions] = useState<DeckQuestionRecord[] | null>(null);
  const [title, setTitle] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pendingUndo, setPendingUndo] = useState<DeckQuestionRecord | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [deckRecord, questionRecords] = await Promise.all([fetchDeck(deckId), fetchDeckQuestions(deckId)]);
        if (cancelled) return;
        // Not distinguishing "doesn't exist" from "isn't yours" avoids
        // leaking whether a given Deck id exists to a non-owner - see
        // the Milestone 5 report's ownership-model limitations.
        if (!deckRecord || deckRecord.creatorId !== creatorId) {
          setNotFound(true);
          return;
        }
        setDeck(deckRecord);
        setTitle(deckRecord.title);
        setQuestions(questionRecords);
      } catch {
        if (!cancelled) setLoadError("Couldn't load this Deck. Try refreshing.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [deckId, creatorId]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  function handleTitleChange(value: string) {
    setTitle(value);
    autosave.scheduleSave("deck:title", (signal) => renameDeck(deckId, value, signal));
  }

  const patchQuestionLocal = useCallback((questionId: string, patch: Partial<DeckQuestionRecord>) => {
    setQuestions((prev) => prev?.map((q) => (q.id === questionId ? { ...q, ...patch } : q)) ?? null);
  }, []);

  function scheduleQuestionSave(questionId: string, field: string, patch: DeckQuestionPatch) {
    autosave.scheduleSave(`question:${questionId}:${field}`, (signal) => updateQuestion(deckId, questionId, patch, signal));
  }

  function saveQuestionNow(questionId: string, field: string, patch: DeckQuestionPatch) {
    return autosave.saveNow(`question:${questionId}:${field}`, (signal) => updateQuestion(deckId, questionId, patch, signal));
  }

  async function handleAddQuestion(method: AnswerMethod) {
    setActionError(null);
    let created: DeckQuestionRecord | null = null;
    try {
      await autosave.saveNow(`deck:add-question:${Date.now()}`, async () => {
        created = await appendQuestion(deckId, method);
      });
    } catch {
      setActionError("Couldn't add that Question. Try again.");
      return;
    }
    if (created) {
      setQuestions((prev) => [...(prev ?? []), created as DeckQuestionRecord]);
      setExpandedIds((prev) => new Set(prev).add((created as DeckQuestionRecord).id));
    }
  }

  async function handleMove(questionId: string, direction: "up" | "down") {
    if (!questions) return;
    setActionError(null);
    const ordered = [...questions].sort((a, b) => a.position - b.position);
    try {
      await autosave.saveNow(`question:${questionId}:move`, () => moveQuestion(deckId, ordered, questionId, direction));
    } catch {
      setActionError("Couldn't reorder that Question. Try again.");
      return;
    }
    const refreshed = await fetchDeckQuestions(deckId);
    setQuestions(refreshed);
  }

  async function handleDuplicate(question: DeckQuestionRecord) {
    setActionError(null);
    let created: DeckQuestionRecord | null = null;
    try {
      await autosave.saveNow(`question:${question.id}:duplicate`, async () => {
        created = await duplicateQuestion(deckId, question);
      });
    } catch {
      setActionError("Couldn't duplicate that Question. Try again.");
      return;
    }
    const refreshed = await fetchDeckQuestions(deckId);
    setQuestions(refreshed);
    if (created) setExpandedIds((prev) => new Set(prev).add((created as DeckQuestionRecord).id));
  }

  async function handleDelete(question: DeckQuestionRecord) {
    setActionError(null);
    try {
      await autosave.saveNow(`question:${question.id}:delete`, () => deleteQuestion(deckId, question.id));
    } catch {
      setActionError("Couldn't delete that Question. Try again.");
      return;
    }
    setQuestions((prev) => prev?.filter((q) => q.id !== question.id) ?? null);

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setPendingUndo(question);
    undoTimerRef.current = setTimeout(() => setPendingUndo(null), UNDO_WINDOW_MS);
  }

  async function handleUndo() {
    if (!pendingUndo) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const question = pendingUndo;
    setPendingUndo(null);
    try {
      await autosave.saveNow(`question:${question.id}:restore`, () => restoreQuestion(deckId, question));
    } catch {
      setActionError("Couldn't undo that delete. Try again.");
      return;
    }
    const refreshed = await fetchDeckQuestions(deckId);
    setQuestions(refreshed);
  }

  function toggleExpanded(questionId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  async function handleHostThisDeck() {
    setHostError(null);
    setHostBusy(true);
    try {
      const roomCode = await createHostedRoom([deckId]);
      navigate(`/host/${roomCode}`);
    } catch {
      setHostError("Couldn't create the room. Try again.");
      setHostBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="deck-editor-message">
        <h1>Deck not found</h1>
        <p>This Deck doesn&rsquo;t exist, or isn&rsquo;t one you created in this browser.</p>
        <Link to="/decks" className="btn btn-primary">
          Back to My Decks
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="deck-editor-message">
        <p role="alert">{loadError}</p>
      </div>
    );
  }

  if (!deck || !questions) {
    return <LoadingScreen message="Loading your Deck..." />;
  }

  const readiness = computeDeckReadiness(questions);
  const ordered = [...questions].sort((a, b) => a.position - b.position);

  return (
    <div className="deck-editor">
      <div className="deck-editor-header">
        <label htmlFor="deck-title-input" className="deck-editor-title-label">
          Deck title
        </label>
        <input
          id="deck-title-input"
          className="deck-editor-title"
          value={title}
          onChange={(event) => handleTitleChange(event.target.value)}
          maxLength={100}
        />
        <SaveStatusBadge status={autosave.status} onRetry={autosave.retry} />
      </div>

      <p className="deck-editor-readiness" role="status">
        {readiness.ready ? "Ready to Host" : "Draft"}
      </p>
      {!readiness.ready && (
        <ul className="deck-editor-problems">
          {readiness.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {actionError && (
        <p className="deck-editor-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="deck-editor-actions">
        {readiness.ready ? (
          <Link to={`/decks/${deckId}/preview`} className="btn btn-ghost">
            Preview
          </Link>
        ) : (
          <button type="button" className="btn btn-ghost" disabled>
            Preview
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleHostThisDeck()}
          disabled={!readiness.ready || hostBusy}
        >
          Host This Deck
        </button>
      </div>

      {hostError && (
        <p className="deck-editor-error" role="alert">
          {hostError}
        </p>
      )}

      <ul className="deck-editor-questions">
        {ordered.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            total={ordered.length}
            expanded={expandedIds.has(question.id)}
            onToggleExpand={() => toggleExpanded(question.id)}
            onFieldChange={(patch, field) => {
              patchQuestionLocal(question.id, patch as Partial<DeckQuestionRecord>);
              scheduleQuestionSave(question.id, field, patch);
            }}
            onImmediateFieldChange={(patch, field) => {
              patchQuestionLocal(question.id, patch as Partial<DeckQuestionRecord>);
              void saveQuestionNow(question.id, field, patch).catch(() => {
                setActionError("Couldn't save that change. Try again.");
              });
            }}
            onMoveUp={() => void handleMove(question.id, "up")}
            onMoveDown={() => void handleMove(question.id, "down")}
            onDuplicate={() => void handleDuplicate(question)}
            onDelete={() => void handleDelete(question)}
          />
        ))}
      </ul>

      {pendingUndo && (
        <div className="deck-editor-undo" role="status">
          <span>Question deleted.</span>
          <button type="button" className="btn btn-ghost" onClick={() => void handleUndo()}>
            Undo
          </button>
        </div>
      )}

      <div className="deck-editor-add">
        <button type="button" className="btn btn-secondary" onClick={() => void handleAddQuestion("multiple_choice")}>
          Add Multiple Choice
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void handleAddQuestion("typed_answer")}>
          Add Typed Answer
        </button>
      </div>
    </div>
  );
}

function SaveStatusBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") return null;
  return (
    <p className="deck-editor-save-status" role="status">
      {status === "saving" && "Saving…"}
      {status === "saved" && "Saved"}
      {status === "error" && (
        <>
          Couldn&rsquo;t save.{" "}
          <button type="button" className="deck-editor-retry" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </p>
  );
}

interface QuestionCardProps {
  question: DeckQuestionRecord;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onFieldChange: (patch: DeckQuestionPatch, field: string) => void;
  onImmediateFieldChange: (patch: DeckQuestionPatch, field: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function QuestionCard({
  question,
  index,
  total,
  expanded,
  onToggleExpand,
  onFieldChange,
  onImmediateFieldChange,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: QuestionCardProps) {
  const methodLabel = question.answerMethod === "multiple_choice" ? "Multiple Choice" : "Typed Answer";

  return (
    <li className="deck-question-card">
      <div className="deck-question-summary">
        <button type="button" className="deck-question-toggle" onClick={onToggleExpand} aria-expanded={expanded}>
          <span className="deck-question-number">Question {index + 1}</span>
          <span className="deck-question-method">{methodLabel}</span>
          <span className="deck-question-preview">{question.prompt.trim() || "(no prompt yet)"}</span>
        </button>
        <div className="deck-question-controls">
          <button type="button" className="btn btn-ghost" onClick={onMoveUp} disabled={index === 0} aria-label={`Move Question ${index + 1} up`}>
            Move Up
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label={`Move Question ${index + 1} down`}
          >
            Move Down
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDuplicate} aria-label={`Duplicate Question ${index + 1}`}>
            Duplicate
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDelete} aria-label={`Delete Question ${index + 1}`}>
            Delete
          </button>
        </div>
      </div>

      {expanded && (
        <div className="deck-question-body">
          {question.answerMethod === "multiple_choice" ? (
            <MultipleChoiceEditor question={question} onFieldChange={onFieldChange} onImmediateFieldChange={onImmediateFieldChange} />
          ) : (
            <TypedAnswerEditor question={question} onFieldChange={onFieldChange} onImmediateFieldChange={onImmediateFieldChange} />
          )}
        </div>
      )}
    </li>
  );
}

interface EditorProps {
  question: DeckQuestionRecord;
  onFieldChange: (patch: DeckQuestionPatch, field: string) => void;
  onImmediateFieldChange: (patch: DeckQuestionPatch, field: string) => void;
}

function MultipleChoiceEditor({ question, onFieldChange, onImmediateFieldChange }: EditorProps) {
  const options: QuestionOption[] = question.options ?? [];

  function updateOptionText(optionId: string, text: string) {
    const nextOptions = options.map((option) => (option.id === optionId ? { ...option, text } : option));
    onFieldChange({ options: nextOptions }, "options");
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    const nextOptions = [...options, { id: crypto.randomUUID(), text: "" }];
    onImmediateFieldChange({ options: nextOptions }, "options");
  }

  function removeOption(optionId: string) {
    if (options.length <= MIN_OPTIONS) return;
    const nextOptions = options.filter((option) => option.id !== optionId);
    const correctOptionId = question.correctOptionId === optionId ? null : question.correctOptionId;
    onImmediateFieldChange({ options: nextOptions, correctOptionId }, "options");
  }

  function markCorrect(optionId: string) {
    onImmediateFieldChange({ correctOptionId: optionId }, "correctOptionId");
  }

  return (
    <div className="deck-question-fields">
      <label htmlFor={`prompt-${question.id}`}>Prompt</label>
      <textarea
        id={`prompt-${question.id}`}
        value={question.prompt}
        onChange={(event) => onFieldChange({ prompt: event.target.value }, "prompt")}
        rows={2}
      />

      <fieldset className="deck-question-options">
        <legend>Answer options</legend>
        {options.map((option, optionIndex) => (
          <div key={option.id} className="deck-question-option-row">
            <label className="deck-question-option-radio">
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={question.correctOptionId === option.id}
                onChange={() => markCorrect(option.id)}
              />
              <span className="sr-only-label">Correct</span>
            </label>
            <label className="deck-question-option-text-label" htmlFor={`option-${option.id}`}>
              Option {optionIndex + 1}
            </label>
            <input
              id={`option-${option.id}`}
              type="text"
              value={option.text}
              onChange={(event) => updateOptionText(option.id, event.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => removeOption(option.id)}
              disabled={options.length <= MIN_OPTIONS}
              aria-label={`Remove option ${optionIndex + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" onClick={addOption} disabled={options.length >= MAX_OPTIONS}>
          Add option
        </button>
      </fieldset>

      <label htmlFor={`points-${question.id}`}>Points</label>
      <input
        id={`points-${question.id}`}
        type="number"
        min={1}
        max={1000}
        value={question.points}
        onChange={(event) => onFieldChange({ points: Number(event.target.value) }, "points")}
      />
    </div>
  );
}

function TypedAnswerEditor({ question, onFieldChange, onImmediateFieldChange }: EditorProps) {
  const variants = question.acceptedAnswers ?? [];

  function updateVariantText(index: number, text: string) {
    const next = variants.map((variant, i) => (i === index ? text : variant));
    onFieldChange({ acceptedAnswers: cleanAcceptedVariants(next) }, "acceptedAnswers");
  }

  function addVariant() {
    onImmediateFieldChange({ acceptedAnswers: [...variants, ""] }, "acceptedAnswers");
  }

  function removeVariant(index: number) {
    const next = variants.filter((_, i) => i !== index);
    onImmediateFieldChange({ acceptedAnswers: cleanAcceptedVariants(next) }, "acceptedAnswers");
  }

  return (
    <div className="deck-question-fields">
      <label htmlFor={`prompt-${question.id}`}>Prompt</label>
      <textarea
        id={`prompt-${question.id}`}
        value={question.prompt}
        onChange={(event) => onFieldChange({ prompt: event.target.value }, "prompt")}
        rows={2}
      />

      <label htmlFor={`correct-answer-${question.id}`}>Correct answer</label>
      <input
        id={`correct-answer-${question.id}`}
        type="text"
        value={question.correctAnswer ?? ""}
        onChange={(event) => onFieldChange({ correctAnswer: event.target.value }, "correctAnswer")}
      />

      <div className="deck-question-variants">
        <p className="deck-question-hint">Add common abbreviations, alternate names or accepted spellings.</p>
        {variants.map((variant, index) => (
          <div key={index} className="deck-question-variant-row">
            <label className="sr-only-label" htmlFor={`variant-${question.id}-${index}`}>
              Accepted variant {index + 1}
            </label>
            <input
              id={`variant-${question.id}-${index}`}
              type="text"
              value={variant}
              onChange={(event) => updateVariantText(index, event.target.value)}
            />
            <button type="button" className="btn btn-ghost" onClick={() => removeVariant(index)} aria-label={`Remove accepted variant ${index + 1}`}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" onClick={addVariant}>
          Add accepted variant
        </button>
      </div>

      <label htmlFor={`points-${question.id}`}>Points</label>
      <input
        id={`points-${question.id}`}
        type="number"
        min={1}
        max={1000}
        value={question.points}
        onChange={(event) => onFieldChange({ points: Number(event.target.value) }, "points")}
      />
    </div>
  );
}

export default DeckEditorPage;
