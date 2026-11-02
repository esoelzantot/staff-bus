/** U+200C ZERO WIDTH NON-JOINER: keeps two Arabic initials as two letters instead of one joined word. */
const ZWNJ = '\u200C';
const ARABIC = /[\u0600-\u06FF]/;

/**
 * The letters shown in a card's avatar: the first letter of the first two words.
 * "Ahmed Antar" → "AA", "eslam" → "E", "سارة علي" → "س\u200Cع" (two separate letters).
 */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '');
  if (letters.length === 0) return '؟';
  return letters.some((c) => ARABIC.test(c)) ? letters.join(ZWNJ) : letters.join('').toUpperCase();
}
