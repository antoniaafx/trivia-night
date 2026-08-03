/**
 * Builds the public-facing links a Host shares (QR code, copied Join
 * link, Stage link). Takes `origin` as a plain parameter rather than
 * reading `window.location.origin` internally so this stays a pure,
 * easily-testable function - the app always calls it with the real
 * browser origin, which is `http://localhost:5173` (or similar) in
 * local development and the deployed domain in production. Never
 * hardcode a domain here; the deployed origin is whatever Cloudflare
 * Pages serves the app from.
 */
export function buildJoinUrl(origin: string, roomCode: string): string {
  return `${origin}/join?room=${roomCode}`;
}

export function buildStageUrl(origin: string, roomCode: string): string {
  return `${origin}/stage/${roomCode}`;
}
