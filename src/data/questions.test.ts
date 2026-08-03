import { describe, expect, it } from "vitest";
import { getNextQuestionId, getQuestionById } from "./questions";
import type { Question } from "./questions";

function makeList(ids: string[]): Question[] {
  return ids.map((id) => ({
    id,
    answerMethod: "multiple_choice",
    prompt: `Prompt ${id}`,
    points: 100,
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correctOptionId: "a",
  }));
}

describe("getQuestionById (list-based, arbitrary length)", () => {
  it("finds a Question by id in a list of any length", () => {
    const list = makeList(["a", "b", "c", "d", "e"]);
    expect(getQuestionById(list, "c")?.id).toBe("c");
  });

  it("returns null for an id not in the list", () => {
    const list = makeList(["a", "b"]);
    expect(getQuestionById(list, "missing")).toBeNull();
  });

  it("returns null for a null id (lobby)", () => {
    const list = makeList(["a", "b"]);
    expect(getQuestionById(list, null)).toBeNull();
  });

  it("works for a single-Question list", () => {
    const list = makeList(["only"]);
    expect(getQuestionById(list, "only")?.id).toBe("only");
  });
});

describe("getNextQuestionId (list-based, arbitrary length)", () => {
  it("returns the next id in sequence", () => {
    const list = makeList(["a", "b", "c"]);
    expect(getNextQuestionId(list, "a")).toBe("b");
    expect(getNextQuestionId(list, "b")).toBe("c");
  });

  it("returns null once the last Question is reached", () => {
    const list = makeList(["a", "b", "c"]);
    expect(getNextQuestionId(list, "c")).toBeNull();
  });

  it("returns null for a single-Question list (no next Question)", () => {
    const list = makeList(["only"]);
    expect(getNextQuestionId(list, "only")).toBeNull();
  });

  it("returns null for an unrecognized current id", () => {
    const list = makeList(["a", "b"]);
    expect(getNextQuestionId(list, "unknown")).toBeNull();
  });

  it("works across a much longer list (multi-Deck Game Plan scale)", () => {
    const list = makeList(Array.from({ length: 25 }, (_, i) => `q${i + 1}`));
    expect(getNextQuestionId(list, "q1")).toBe("q2");
    expect(getNextQuestionId(list, "q24")).toBe("q25");
    expect(getNextQuestionId(list, "q25")).toBeNull();
  });
});
