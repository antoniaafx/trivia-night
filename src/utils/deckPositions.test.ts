import { describe, expect, it } from "vitest";
import {
  computeAppendPosition,
  computeInsertAfterPosition,
  MIN_POSITION_GAP,
  normalizedPositions,
  POSITION_GAP,
} from "./deckPositions";

describe("computeAppendPosition", () => {
  it("returns the first gap value for an empty Deck", () => {
    expect(computeAppendPosition([])).toBe(POSITION_GAP);
  });

  it("returns max position plus one gap, regardless of array order", () => {
    const items = [
      { id: "a", position: 1000 },
      { id: "c", position: 3000 },
      { id: "b", position: 2000 },
    ];
    expect(computeAppendPosition(items)).toBe(3000 + POSITION_GAP);
  });
});

describe("computeInsertAfterPosition", () => {
  const ordered = [
    { id: "a", position: 1000 },
    { id: "b", position: 2000 },
    { id: "c", position: 3000 },
  ];

  it("returns the midpoint when inserting after a middle item with room", () => {
    expect(computeInsertAfterPosition(ordered, "a")).toBe(1500);
  });

  it("returns source + gap when inserting after the last item", () => {
    expect(computeInsertAfterPosition(ordered, "c")).toBe(3000 + POSITION_GAP);
  });

  it("returns null when the gap to the next item is too small to subdivide safely", () => {
    const tight = [
      { id: "a", position: 1 },
      { id: "b", position: 1 + MIN_POSITION_GAP },
    ];
    expect(computeInsertAfterPosition(tight, "a")).toBeNull();
  });

  it("throws for an id that isn't in the list", () => {
    expect(() => computeInsertAfterPosition(ordered, "missing")).toThrow();
  });
});

describe("normalizedPositions", () => {
  it("assigns fresh, evenly-spaced positions in the given order", () => {
    const items = [
      { id: "a", position: 1.0001 },
      { id: "b", position: 1.0002 },
      { id: "c", position: 1.0003 },
    ];
    expect(normalizedPositions(items)).toEqual([
      { id: "a", position: POSITION_GAP },
      { id: "b", position: POSITION_GAP * 2 },
      { id: "c", position: POSITION_GAP * 3 },
    ]);
  });

  it("leaves ample room to subdivide again immediately after normalizing", () => {
    const items = [
      { id: "a", position: 1 },
      { id: "b", position: 1 + MIN_POSITION_GAP },
    ];
    const normalized = normalizedPositions(items);
    expect(computeInsertAfterPosition(normalized, "a")).not.toBeNull();
  });
});
