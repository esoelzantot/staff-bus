/**
 * Sets (or changes) the PIN of a manager / admin. Run from a trusted machine only.
 *
 *   npm run set-pin -- <ID>
 *
 * The PIN is typed twice in the terminal (never as an argument) and stored hashed (scrypt) in
 * credentials/{uid}. Changing a PIN also lifts a lock caused by too many wrong attempts.
 */
import { adminAuth, adminDb, ID_PATTERN, employeeEmail, normalizeId, setPin } from './lib/admin';
import { promptNewPin } from './lib/prompt';

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error('Usage: npm run set-pin -- <ID>');
  const id = normalizeId(raw);
  if (!ID_PATTERN.test(id)) throw new Error('ID must be 3–32 chars: A–Z, 0–9, _ or -');

  const user = await adminAuth.getUserByEmail(employeeEmail(id)).catch(() => null);
  if (!user) throw new Error(`No account for ID ${id}. Create it first: npm run create-user -- manager ${id}`);
  const role = (await adminDb.collection('users').doc(user.uid).get()).data()?.role;
  if (role !== 'manager' && role !== 'admin')
    throw new Error(`${id} is not a manager / admin – employees sign in with the ID only.`);

  await setPin(user.uid, await promptNewPin(id));
  console.log(`PIN saved for ${role} ${id}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
