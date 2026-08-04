import { supabase } from "./supabaseClient";
import { createDeck, renameDeck, appendQuestion, updateQuestion, deleteQuestion, fetchDeckQuestions } from "./deckRepository";
import type { DeckQuestionRecord } from "../types/deck";

/**
 * The one-time "General Knowledge Showcase" content bridge from
 * docs/DEMO-DECK.md into a real Deck - see that file for the source of
 * truth this was transcribed from (and scripts/seed-demo-deck.mjs,
 * which does the same import from a standalone Node script for
 * environments where clicking a button in the browser isn't possible).
 * This module exists specifically because a Deck's ownership is scoped
 * to whichever browser's `localStorage` creator_id created it (see
 * useCreatorId.ts) - a Deck imported from outside the browser (a script,
 * a different browser profile) is invisible to any other browser no
 * matter how "correct" its data is. Running the import from inside the
 * app itself, in the same browser the Host is using to view My Decks,
 * is the only way to guarantee it lands under the identity that browser
 * will actually query with.
 */
export const OFFICIAL_DEMO_DECK_TITLE = "General Knowledge Showcase";

interface CanonicalQuestion {
  answerMethod: "multiple_choice" | "typed_answer";
  prompt: string;
  options: { id: string; text: string }[] | null;
  correctOptionId: string | null;
  correctAnswer: string | null;
  acceptedAnswers: string[] | null;
}

function mc(prompt: string, optionTexts: string[], correctLetter: string): CanonicalQuestion {
  const letters = ["A", "B", "C", "D"];
  return {
    answerMethod: "multiple_choice",
    prompt,
    options: optionTexts.map((text, index) => ({ id: letters[index], text })),
    correctOptionId: correctLetter,
    correctAnswer: null,
    acceptedAnswers: null,
  };
}

function typed(prompt: string, correctAnswer: string, acceptedAnswers: string[]): CanonicalQuestion {
  return {
    answerMethod: "typed_answer",
    prompt,
    options: null,
    correctOptionId: null,
    correctAnswer,
    acceptedAnswers,
  };
}

export const OFFICIAL_DEMO_DECK_QUESTIONS: CanonicalQuestion[] = [
  mc("How many continents are there on Earth?", ["5", "6", "7", "8"], "C"),
  typed("What is the largest planet in our solar system?", "Jupiter", []),
  mc("Which of these is the largest species of big cat?", ["Lion", "Tiger", "Jaguar", "Leopard"], "B"),
  mc("What is the capital city of France?", ["Marseille", "Lyon", "Paris", "Nice"], "C"),
  typed("What food do bees produce that people eat?", "Honey", []),

  mc(
    "Which fictional wizard has a lightning-bolt scar on his forehead?",
    ["Gandalf", "Merlin", "Harry Potter", "Dumbledore"],
    "C",
  ),
  typed('Which British rock band released the album "Abbey Road"?', "The Beatles", ["Beatles"]),
  mc("Which video game franchise features a plumber named Mario?", ["Sonic", "Zelda", "Kirby", "Super Mario"], "D"),
  mc(
    'Which streaming service produced the show "Stranger Things"?',
    ["Hulu", "Disney+", "Netflix", "Amazon Prime"],
    "C",
  ),
  typed(
    "What internet term describes an image, video, or phrase that spreads rapidly online?",
    "Meme",
    ["Internet meme"],
  ),

  mc("Which country has the most natural lakes in the world?", ["Russia", "Finland", "Canada", "USA"], "C"),
  typed("What is the only mammal capable of true, sustained flight?", "Bat", []),
  mc(
    'Which artist painted "The Starry Night"?',
    ["Claude Monet", "Pablo Picasso", "Salvador Dalí", "Vincent van Gogh"],
    "D",
  ),
  typed("What is the term for an intense fear of spiders?", "Arachnophobia", []),
  mc('Which element has the chemical symbol "Au"?', ["Silver", "Aluminum", "Gold", "Argon"], "C"),

  mc(
    "Which ancient wonder of the world is the only one still standing today?",
    ["Hanging Gardens of Babylon", "Colossus of Rhodes", "Great Pyramid of Giza", "Lighthouse of Alexandria"],
    "C",
  ),
  typed("What is the term for a word or phrase that reads the same forwards and backwards?", "Palindrome", []),
  mc("What is the hardest known natural substance on Earth?", ["Titanium", "Quartz", "Steel", "Diamond"], "D"),
  typed("What is the largest organ in the human body?", "Skin", []),
  mc(
    "Which of these four inventions came first?",
    ["The telephone", "The lightbulb", "Photography", "The zipper"],
    "C",
  ),
];

function questionsMatchCanonical(existing: DeckQuestionRecord[]): boolean {
  if (existing.length !== OFFICIAL_DEMO_DECK_QUESTIONS.length) return false;
  const ordered = [...existing].sort((a, b) => a.position - b.position);
  return ordered.every((row, index) => {
    const expected = OFFICIAL_DEMO_DECK_QUESTIONS[index];
    if (row.answerMethod !== expected.answerMethod) return false;
    if (row.prompt !== expected.prompt) return false;
    if (expected.answerMethod === "multiple_choice") {
      const options = row.options ?? [];
      const expectedOptions = expected.options ?? [];
      const optionsMatch =
        options.length === expectedOptions.length &&
        options.every((option, i) => option.id === expectedOptions[i].id && option.text === expectedOptions[i].text);
      return optionsMatch && row.correctOptionId === expected.correctOptionId;
    }
    const accepted = row.acceptedAnswers ?? [];
    const expectedAccepted = expected.acceptedAnswers ?? [];
    const acceptedMatch =
      accepted.length === expectedAccepted.length && accepted.every((value, i) => value === expectedAccepted[i]);
    return row.correctAnswer === expected.correctAnswer && acceptedMatch;
  });
}

export type OfficialDemoDeckStatus = "missing" | "complete" | "incomplete";

/** Read-only - safe to call on every My Decks mount to decide whether to show the import control. */
export async function officialDemoDeckStatus(creatorId: string): Promise<OfficialDemoDeckStatus> {
  const { data, error } = await supabase
    .from("decks")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("title", OFFICIAL_DEMO_DECK_TITLE)
    .limit(1);
  if (error) throw error;
  const deckId = data?.[0]?.id as string | undefined;
  if (!deckId) return "missing";

  const questions = await fetchDeckQuestions(deckId);
  return questionsMatchCanonical(questions) ? "complete" : "incomplete";
}

/**
 * Idempotent: no-ops if a complete Deck already exists for this
 * creator, repairs an incomplete one in place (same Deck id, Questions
 * replaced), or creates fresh - never touches any other Deck. Every
 * write goes through the same deckRepository functions the Deck Editor
 * itself calls (createDeck/renameDeck/appendQuestion/updateQuestion),
 * so the result is indistinguishable from one built by hand.
 */
export async function importOfficialDemoDeck(creatorId: string): Promise<{ deckId: string; action: "created" | "repaired" | "noop" }> {
  const { data, error } = await supabase
    .from("decks")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("title", OFFICIAL_DEMO_DECK_TITLE)
    .limit(1);
  if (error) throw error;
  const existingDeckId = data?.[0]?.id as string | undefined;

  let deckId: string;
  let action: "created" | "repaired" | "noop";

  if (!existingDeckId) {
    const deck = await createDeck(creatorId);
    await renameDeck(deck.id, OFFICIAL_DEMO_DECK_TITLE);
    deckId = deck.id;
    action = "created";
  } else {
    deckId = existingDeckId;
    const existingQuestions = await fetchDeckQuestions(deckId);
    if (questionsMatchCanonical(existingQuestions)) {
      return { deckId, action: "noop" };
    }
    for (const question of existingQuestions) {
      await deleteQuestion(deckId, question.id);
    }
    action = "repaired";
  }

  for (const canonical of OFFICIAL_DEMO_DECK_QUESTIONS) {
    const created = await appendQuestion(deckId, canonical.answerMethod);
    await updateQuestion(deckId, created.id, {
      prompt: canonical.prompt,
      ...(canonical.answerMethod === "multiple_choice"
        ? { options: canonical.options!, correctOptionId: canonical.correctOptionId! }
        : { correctAnswer: canonical.correctAnswer!, acceptedAnswers: canonical.acceptedAnswers! }),
    });
  }

  return { deckId, action };
}
