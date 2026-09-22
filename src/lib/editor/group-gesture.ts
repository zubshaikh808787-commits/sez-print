/** Selection ids frozen at transform start — commit uses these, not live selection. */
export function gestureCommitSelectionIds(
  frozenIds: string[],
  currentIds: string[],
): string[] {
  return frozenIds.length > 0 ? frozenIds : currentIds;
}
