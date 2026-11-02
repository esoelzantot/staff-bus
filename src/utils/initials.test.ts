import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it('first letters of the first two words, upper case', () => {
    expect(initials('Ahmed Antar')).toBe('AA');
    expect(initials('eslam shaker mohamed')).toBe('ES');
    expect(initials('  Karim  ')).toBe('K');
  });

  it('Arabic letters stay two separate letters (no joining)', () => {
    expect(initials('سارة علي')).toBe('س\u200Cع');
  });

  it('never empty', () => {
    expect(initials('   ')).toBe('؟');
  });
});
