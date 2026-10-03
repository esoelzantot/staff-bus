import { describe, expect, it } from 'vitest';
import { hashPin, pinProblem, verifyPin } from './pin';

describe('PIN hashing', () => {
  it('verifies the right PIN and rejects a wrong one', async () => {
    const stored = await hashPin('correct horse 42');
    expect(await verifyPin('correct horse 42', stored)).toBe(true);
    expect(await verifyPin('correct horse 43', stored)).toBe(false);
    expect(await verifyPin('', stored)).toBe(false);
  });

  it('salts every hash (same PIN, different output)', async () => {
    expect(await hashPin('same-pin-1')).not.toBe(await hashPin('same-pin-1'));
  });

  it('never throws on a garbage stored value', async () => {
    expect(await verifyPin('x', 'not-a-hash')).toBe(false);
    expect(await verifyPin('x', 'scrypt$1$2$3$$')).toBe(false);
    expect(await verifyPin('x', 'scrypt$0$0$0$AAAA$AAAA')).toBe(false);
  });
});

describe('pinProblem', () => {
  it('accepts a reasonable PIN', () => {
    expect(pinProblem('k7x2q9', 'MGR001')).toBeNull();
  });

  it('rejects short, repeated, common and ID-equal PINs', () => {
    expect(pinProblem('12345', 'MGR001')).not.toBeNull();
    expect(pinProblem('aaaaaa', 'MGR001')).not.toBeNull();
    expect(pinProblem('123456', 'MGR001')).not.toBeNull();
    expect(pinProblem('mgr001', 'MGR001')).not.toBeNull();
    expect(pinProblem('x'.repeat(65), 'MGR001')).not.toBeNull();
  });
});
