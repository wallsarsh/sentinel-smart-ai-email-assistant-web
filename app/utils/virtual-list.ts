/** Which rows to render for a fixed-height list: a window plus overscan on both sides. */
export function visibleRange(o: {
  scrollTop: number
  viewport: number
  rowHeight: number
  total: number
  overscan?: number
}) {
  const over = o.overscan ?? 5
  const first = Math.max(0, Math.floor(o.scrollTop / o.rowHeight) - over)
  const last = Math.min(o.total, Math.ceil((o.scrollTop + o.viewport) / o.rowHeight) + over)
  return {
    start: first,
    end: Math.max(first, last),
    padTop: first * o.rowHeight,
    padBottom: Math.max(0, o.total - Math.max(first, last)) * o.rowHeight,
  }
}
