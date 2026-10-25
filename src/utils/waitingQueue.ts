/**
 * The waiting list's order ("الدور"): when a seat is free, waiting employees take it in this order.
 * Stored as employees/{id}.queueOrder (1 = first) and set by managers only (api/employees.ts). Display only: it does
 * not stop anyone from pressing IN.
 *
 * Shared by the web app (sorting, the "الدور N" badge) and the server (keeping the numbers 1…n), so both always
 * agree. No imports on purpose – it is loaded by Vite and by the Vercel functions alike.
 */

export interface Queued {
  id: string;
  name: string;
  /** 1 = first in line. Missing for employees that were never ordered (they come after, by name). */
  queueOrder?: number | null;
}

const orderOf = (e: Queued) =>
  typeof e.queueOrder === 'number' && Number.isFinite(e.queueOrder) ? e.queueOrder : Number.POSITIVE_INFINITY;

/** Waiting employees in line order: by queueOrder, then (no number yet / a tie) by name. Does not mutate. */
export function sortWaiting<T extends Queued>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    const oa = orderOf(a);
    const ob = orderOf(b);
    if (oa !== ob) return oa < ob ? -1 : 1;
    return a.name.localeCompare(b.name, 'ar') || a.id.localeCompare(b.id);
  });
}

/** id → place in line (1, 2, 3 …), as shown on the cards. */
export function queueRanks(list: readonly Queued[]): Map<string, number> {
  return new Map(sortWaiting(list).map((e, i) => [e.id, i + 1]));
}

/**
 * The queueOrder writes that make `ordered` read 1, 2, 3 … – only for employees whose number changes.
 * Used after every change of the line (new, removed, moved, reordered), so there are never gaps or duplicates.
 */
export function renumber(ordered: readonly Queued[]): { id: string; queueOrder: number }[] {
  return ordered
    .map((e, i) => ({ id: e.id, queueOrder: i + 1, before: e.queueOrder }))
    .filter((e) => e.before !== e.queueOrder)
    .map(({ id, queueOrder }) => ({ id, queueOrder }));
}

/** Moves one employee up (-1) or down (+1) in the line; returns the new order of ids (unchanged at the ends). */
export function moveInLine(orderedIds: readonly string[], id: string, step: -1 | 1): string[] {
  const from = orderedIds.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= orderedIds.length) return [...orderedIds];
  const next = [...orderedIds];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
