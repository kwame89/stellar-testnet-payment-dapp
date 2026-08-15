/** Pure formatting helpers — no DOM, no SDK — kept separate so they're
 * trivially unit-testable. */

export function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export function votePercentages(counts: number[]): number[] {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total === 0) return counts.map(() => 0);
  return counts.map((c) => Math.round((c / total) * 100));
}

export function pluralizeVotes(count: number): string {
  return `${count} vote${count === 1 ? "" : "s"}`;
}

export function pluralizePoints(count: number): string {
  return `${count} point${count === 1 ? "" : "s"}`;
}
