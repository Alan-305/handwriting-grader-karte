/** 大問番号の若い順 → 小問 (A)(B) → (1)(2) の順で並べる。 */

function partSortKey(partLabel: string | null | undefined): string {
  const pl = (partLabel ?? "").trim().toUpperCase();
  if (!pl || pl === "本文") return "\u0000";
  if (/^\([A-Z]\)$/.test(pl)) return `\u0001${pl}`;
  if (/^\(\d+\)$/.test(pl)) return `\u0002${pl}`;
  return `\u0003${pl}`;
}

export function compareQuestionTypes<
  T extends { majorOrder: number; partLabel?: string | null },
>(a: T, b: T): number {
  if (a.majorOrder !== b.majorOrder) return a.majorOrder - b.majorOrder;
  return partSortKey(a.partLabel).localeCompare(partSortKey(b.partLabel), "en");
}

export function sortQuestionTypes<T extends { majorOrder: number; partLabel?: string | null }>(
  items: T[],
): T[] {
  return [...items].sort(compareQuestionTypes);
}
