import { describe, expect, it } from 'vitest';
import { subscriptionDocId } from './_lib/push';
import { handleRenew, type RenewDeps } from './push-renew';

const OLD = 'https://fcm.googleapis.com/fcm/send/old-endpoint';
const NEW = 'https://fcm.googleapis.com/fcm/send/new-endpoint';
const keys = { p256dh: 'BNewPublicKey', auth: 'newAuth' };

function fakeStore(initial: Record<string, { uid: string; employeeId: string }>) {
  const docs = new Map(Object.entries(initial));
  const deps: RenewDeps = {
    findOwner: async (id) => docs.get(id) ?? null,
    replace: async (oldId, newId, data) => {
      docs.delete(oldId);
      docs.set(newId, data);
    },
  };
  return { deps, docs };
}

describe('handleRenew (the browser renewed a push subscription)', () => {
  it('moves the reminders to the new subscription, same employee', async () => {
    const { deps, docs } = fakeStore({ [subscriptionDocId(OLD)]: { uid: 'u1', employeeId: 'EMP1' } });
    await handleRenew(deps, { oldEndpoint: OLD, subscription: { endpoint: NEW, keys } });
    expect(docs.has(subscriptionDocId(OLD))).toBe(false);
    expect(docs.get(subscriptionDocId(NEW))).toMatchObject({ uid: 'u1', employeeId: 'EMP1', endpoint: NEW, ...keys });
  });

  it('an unknown old subscription cannot be used to register anything', async () => {
    const { deps, docs } = fakeStore({});
    await expect(handleRenew(deps, { oldEndpoint: OLD, subscription: { endpoint: NEW, keys } })).rejects.toMatchObject({
      status: 404,
    });
    expect(docs.size).toBe(0);
  });

  it('rejects endpoints that are not a push service, and missing keys', async () => {
    const { deps } = fakeStore({ [subscriptionDocId(OLD)]: { uid: 'u1', employeeId: 'EMP1' } });
    for (const body of [
      { oldEndpoint: OLD, subscription: { endpoint: 'https://attacker.example/x', keys } },
      { oldEndpoint: 'https://attacker.example/x', subscription: { endpoint: NEW, keys } },
      { oldEndpoint: OLD, subscription: { endpoint: NEW, keys: { p256dh: '', auth: 'a' } } },
      { oldEndpoint: OLD, subscription: { endpoint: NEW } },
      null,
    ]) {
      await expect(handleRenew(deps, body)).rejects.toMatchObject({ status: 400 });
    }
  });
});

describe('subscriptionDocId', () => {
  it('is the same id the web app computes (SHA-256 hex, 40 characters)', async () => {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(OLD));
    const browserId = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 40);
    expect(subscriptionDocId(OLD)).toBe(browserId);
  });
});
