/**
 * Pure position-arithmetic for ordering Deck Questions. Positions are
 * fractional (see deckRepository.ts's Design Note on why: duplicating a
 * Question must insert it immediately after its source by touching
 * only that one new row, never renumbering everything after it).
 */
export const POSITION_GAP = 1000;
export const MIN_POSITION_GAP = 1e-6;

export interface PositionedItem {
  id: string;
  position: number;
}

/** Position for a brand-new Question appended to the end of the Deck. */
export function computeAppendPosition(existing: PositionedItem[]): number {
  if (existing.length === 0) return POSITION_GAP;
  return Math.max(...existing.map((item) => item.position)) + POSITION_GAP;
}

/**
 * Position for a Question inserted immediately after `afterId`, given
 * the Deck's current order (must already be sorted by position
 * ascending). Returns null when the gap to the next Question has
 * become too small to safely subdivide again - the caller should
 * renormalize (see normalizedPositions) and retry.
 */
export function computeInsertAfterPosition(ordered: PositionedItem[], afterId: string): number | null {
  const index = ordered.findIndex((item) => item.id === afterId);
  if (index === -1) throw new Error("afterId not found in ordered list");

  const after = ordered[index];
  const next = ordered[index + 1];
  if (!next) return after.position + POSITION_GAP;

  const gap = next.position - after.position;
  if (gap <= MIN_POSITION_GAP * 2) return null;

  return (after.position + next.position) / 2;
}

/**
 * Fresh, evenly-spaced positions for the same items in their current
 * order - the normalization safety net for when repeated duplication
 * has pushed two neighbors' positions too close together.
 */
export function normalizedPositions(ordered: PositionedItem[]): PositionedItem[] {
  return ordered.map((item, index) => ({ id: item.id, position: (index + 1) * POSITION_GAP }));
}
