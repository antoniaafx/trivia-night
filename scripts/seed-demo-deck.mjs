// One-time import: turns docs/DEMO-DECK.md's content into a real Deck,
// through the same tables and write shapes src/services/deckRepository.ts
// uses for `decks`/`deck_questions` (createDeck + appendQuestion) - just
// invoked from plain Node instead of the browser, since this repo has no
// TypeScript runtime (tsx/ts-node) installed to import that module
// directly. No raw SQL, no RLS bypass, no schema changes: same client
// library (@supabase/supabase-js), same two tables, same anon-key
// permissive RLS policy every Deck write already goes through.
//
// USAGE
//   node --env-file=.env.local scripts/seed-demo-deck.mjs --creator-id=<uuid>
//
// The creator id is deliberately a required argument, not guessed or
// hardcoded - it must be the same value the target browser has in
// localStorage under "trivia-night:creator-id" (see src/hooks/useCreatorId.ts),
// or "My Decks" in that browser will never see the imported Deck. Read it
// from that browser's devtools/console with:
//   localStorage.getItem('trivia-night:creator-id')
//
// IDEMPOTENT: safe to run more than once.
//   - No Deck with this title for this creator yet -> creates it.
//   - An existing Deck's 20 Questions already match exactly -> no-op.
//   - An existing Deck's Questions are missing/incomplete/wrong -> its
//     Question rows are replaced with the canonical set (the Deck row
//     itself, and its id, is left untouched). Never touches any other
//     Deck.
//
// Reads Supabase credentials from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// (the same env vars the app itself uses) via --env-file - nothing is
// hardcoded and nothing here should ever be committed with real values.

import { createClient } from "@supabase/supabase-js";

const DECK_TITLE = "General Knowledge Showcase";
const POSITION_GAP = 1000;
const DEFAULT_POINTS = 100;

/**
 * Transcribed verbatim from docs/DEMO-DECK.md, in the same order (which
 * also preserves the 4-Round grouping implicitly: Q1-5 = Round 1, Q6-10 =
 * Round 2, Q11-15 = Round 3, Q16-20 = Round 4 - there is no `round` column
 * to store that explicitly in, see the mapping note in the final report).
 * Explanations/fun facts and difficulty labels from the Markdown are NOT
 * included here - deck_questions has no column for either (see
 * src/data/questions.ts's own doc comment, which lists "explanation" as a
 * deliberately-omitted field even in the hardcoded sample Questions).
 */
const QUESTIONS = [
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
  mc(
    "Which video game franchise features a plumber named Mario?",
    ["Sonic", "Zelda", "Kirby", "Super Mario"],
    "D",
  ),
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
  typed(
    "What is the term for a word or phrase that reads the same forwards and backwards?",
    "Palindrome",
    [],
  ),
  mc("What is the hardest known natural substance on Earth?", ["Titanium", "Quartz", "Steel", "Diamond"], "D"),
  typed("What is the largest organ in the human body?", "Skin", []),
  mc(
    "Which of these four inventions came first?",
    ["The telephone", "The lightbulb", "Photography", "The zipper"],
    "C",
  ),
];

function mc(prompt, optionTexts, correctLetter) {
  const letters = ["A", "B", "C", "D"];
  return {
    answerMethod: "multiple_choice",
    prompt,
    points: DEFAULT_POINTS,
    options: optionTexts.map((text, index) => ({ id: letters[index], text })),
    correctOptionId: correctLetter,
    correctAnswer: null,
    acceptedAnswers: null,
  };
}

function typed(prompt, correctAnswer, acceptedAnswers) {
  return {
    answerMethod: "typed_answer",
    prompt,
    points: DEFAULT_POINTS,
    options: null,
    correctOptionId: null,
    correctAnswer,
    acceptedAnswers,
  };
}

function questionsMatch(existingRows, canonical) {
  if (existingRows.length !== canonical.length) return false;
  const ordered = [...existingRows].sort((a, b) => a.position - b.position);
  return ordered.every((row, index) => {
    const expected = canonical[index];
    if (row.answer_method !== expected.answerMethod) return false;
    if (row.prompt !== expected.prompt) return false;
    if (expected.answerMethod === "multiple_choice") {
      const rowOptions = row.options ?? [];
      const optionsMatch =
        rowOptions.length === expected.options.length &&
        rowOptions.every((option, i) => option.id === expected.options[i].id && option.text === expected.options[i].text);
      return optionsMatch && row.correct_option_id === expected.correctOptionId;
    }
    const rowAccepted = row.accepted_answers ?? [];
    const acceptedMatch =
      rowAccepted.length === expected.acceptedAnswers.length &&
      rowAccepted.every((value, i) => value === expected.acceptedAnswers[i]);
    return row.correct_answer === expected.correctAnswer && acceptedMatch;
  });
}

function toRow(deckId, position, question) {
  return {
    deck_id: deckId,
    position,
    answer_method: question.answerMethod,
    prompt: question.prompt,
    points: question.points,
    options: question.options,
    correct_option_id: question.correctOptionId,
    correct_answer: question.correctAnswer,
    accepted_answers: question.acceptedAnswers,
  };
}

async function main() {
  const creatorIdArg = process.argv.find((arg) => arg.startsWith("--creator-id="));
  const creatorId = creatorIdArg?.split("=")[1];
  if (!creatorId) {
    console.error("Usage: node --env-file=.env.local scripts/seed-demo-deck.mjs --creator-id=<uuid>");
    process.exit(1);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Run with --env-file=.env.local.");
    process.exit(1);
  }

  const mcCount = QUESTIONS.filter((q) => q.answerMethod === "multiple_choice").length;
  const typedCount = QUESTIONS.filter((q) => q.answerMethod === "typed_answer").length;
  console.log(`Canonical Demo Deck: ${QUESTIONS.length} Questions (${mcCount} Multiple Choice, ${typedCount} Typed Answer).`);

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: existingDecks, error: findError } = await supabase
    .from("decks")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("title", DECK_TITLE);
  if (findError) throw findError;

  let deckId = existingDecks?.[0]?.id ?? null;

  if (existingDecks && existingDecks.length > 1) {
    console.warn(
      `Found ${existingDecks.length} existing Decks titled "${DECK_TITLE}" for this creator - repairing only the first (${deckId}), leaving the rest untouched. Investigate manually if this is unexpected.`,
    );
  }

  if (!deckId) {
    const { data: created, error: createError } = await supabase
      .from("decks")
      .insert({ creator_id: creatorId, title: DECK_TITLE })
      .select()
      .single();
    if (createError) throw createError;
    deckId = created.id;
    console.log(`Created Deck "${DECK_TITLE}" (${deckId}).`);
  } else {
    console.log(`Found existing Deck "${DECK_TITLE}" (${deckId}) - checking its Questions...`);
  }

  const { data: existingRows, error: questionsError } = await supabase
    .from("deck_questions")
    .select("*")
    .eq("deck_id", deckId)
    .order("position", { ascending: true });
  if (questionsError) throw questionsError;

  if (questionsMatch(existingRows ?? [], QUESTIONS)) {
    console.log("Already up to date - all 20 Questions match exactly. No changes made.");
    return;
  }

  console.log(
    `Existing Questions don't match the canonical set (found ${existingRows?.length ?? 0}, expected ${QUESTIONS.length}) - repairing.`,
  );

  if (existingRows && existingRows.length > 0) {
    const { error: deleteError } = await supabase.from("deck_questions").delete().eq("deck_id", deckId);
    if (deleteError) throw deleteError;
  }

  const rows = QUESTIONS.map((question, index) => toRow(deckId, (index + 1) * POSITION_GAP, question));
  const { error: insertError } = await supabase.from("deck_questions").insert(rows);
  if (insertError) throw insertError;

  const { error: touchError } = await supabase
    .from("decks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", deckId);
  if (touchError) throw touchError;

  console.log(`Inserted ${rows.length} Questions (${mcCount} Multiple Choice, ${typedCount} Typed Answer). Done.`);
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
