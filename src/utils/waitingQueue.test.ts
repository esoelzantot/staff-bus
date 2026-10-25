import { describe, expect, it } from 'vitest';
import { moveInLine, queueRanks, renumber, sortWaiting } from './waitingQueue';

const w = (id: string, name: string, queueOrder?: number) => ({ id, name, queueOrder });

describe('sortWaiting', () => {
  it('follows the line order (1 first)', () => {
    const list = [w('c', 'Cara', 3), w('a', 'Ali', 1), w('b', 'Badr', 2)];
    expect(sortWaiting(list).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts employees without a number after the ordered ones, by name', () => {
    const list = [w('z', 'Zaki'), w('b', 'Badr', 2), w('m', 'Mona'), w('a', 'Ali', 1)];
    expect(sortWaiting(list).map((e) => e.id)).toEqual(['a', 'b', 'm', 'z']);
  });

  it('does not mutate its input', () => {
    const list = [w('b', 'B', 2), w('a', 'A', 1)];
    sortWaiting(list);
    expect(list.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('queueRanks', () => {
  it('gives 1, 2, 3 … in line order, also when the stored numbers have gaps', () => {
    const ranks = queueRanks([w('a', 'A', 4), w('b', 'B', 9), w('c', 'C')]);
    expect(Object.fromEntries(ranks)).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('renumber', () => {
  it('writes only the numbers that change', () => {
    expect(renumber([w('a', 'A', 1), w('c', 'C', 3), w('d', 'D')])).toEqual([
      { id: 'c', queueOrder: 2 },
      { id: 'd', queueOrder: 3 },
    ]);
  });

  it('nothing to write when the line is already 1 … n', () => {
    expect(renumber([w('a', 'A', 1), w('b', 'B', 2)])).toEqual([]);
  });
});

describe('moveInLine', () => {
  it('moves one place up or down', () => {
    expect(moveInLine(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveInLine(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
  });

  it('does nothing at the ends', () => {
    expect(moveInLine(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(moveInLine(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
  });
});
