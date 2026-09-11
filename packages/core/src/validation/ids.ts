// Next free id for a list whose ids may have gaps after user deletions (q1, q3 → q4, never q3 again).
export function nextId(prefix: 'r' | 'q' | 'f', existing: { id: string }[]): string {
  let max = 0;
  for (const { id } of existing) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}
