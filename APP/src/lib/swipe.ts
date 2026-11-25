


export function tabProgress(
  x: number,
  firstCenter: number,
  lastCenter: number,
  count: number,
): number {
  const span = lastCenter - firstCenter
  if (count < 2 || span <= 0) return 0
  const progress = ((x - firstCenter) / span) * (count - 1)
  return Math.max(0, Math.min(count - 1, progress))
}
