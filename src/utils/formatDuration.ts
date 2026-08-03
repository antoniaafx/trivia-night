/** Every duration shown to a Host or creator is a rough estimate, never claimed as second-perfect - always phrased "approximately". */
export function formatApproximateMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes <= 0) return "Less than a minute";
  return `Approximately ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
