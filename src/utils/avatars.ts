/**
 * Placeholder-simple stand-ins for the custom mascots planned later - an
 * animal emoji per Player, derived from their clientId rather than list
 * position, so a given Player's avatar is stable across re-renders and
 * roster changes elsewhere in the list. Shared by every place a Player
 * gets a visual avatar (the Stage Lobby, the Host Dashboard's Room
 * Status) so the same Player always shows the same emoji everywhere,
 * not a different one per screen.
 */
const AVATAR_EMOJIS = [
  "🐼",
  "🐸",
  "🐧",
  "🐰",
  "🦊",
  "🐻",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐵",
  "🐶",
  "🐱",
  "🐹",
  "🐺",
];

export function avatarForClientId(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_EMOJIS[hash % AVATAR_EMOJIS.length];
}
