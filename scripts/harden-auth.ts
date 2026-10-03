/**
 * One-time hardening after moving to /api/login. Run from a trusted machine.
 *
 *   npm run harden-auth -- --dry-run   # report only
 *   npm run harden-auth                # do it
 *
 * Accounts created before the change have a password derived from the Employee ID and a suffix that ships
 * in the old browser bundle. Anyone could still sign in with it straight against Firebase Auth, bypassing
 * /api/login. This gives every ID account a fresh random password (nobody needs it any more) and lists the
 * managers / admins that still have no PIN (they cannot sign in until you run `npm run set-pin -- <ID>`).
 *
 * Also turn OFF  Authentication → Sign-in method → Email/Password  in the Firebase console afterwards.
 */
import { EMAIL_DOMAIN, adminAuth, adminDb, FieldValue } from './lib/admin';
import { randomPassword } from '../api/_lib/core.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const suffix = `@${EMAIL_DOMAIN}`;
  let rotated = 0;
  let skipped = 0;
  const privilegedWithoutPin: string[] = [];

  let pageToken: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (!user.email?.endsWith(suffix)) {
        skipped++;
        continue;
      }
      if (!dryRun) await adminAuth.updateUser(user.uid, { password: randomPassword() });
      rotated++;

      const role = (await adminDb.collection('users').doc(user.uid).get()).data()?.role;
      if (
        (role === 'manager' || role === 'admin') &&
        !(await adminDb.collection('credentials').doc(user.uid).get()).exists
      ) {
        privilegedWithoutPin.push(`${user.email.slice(0, -suffix.length).toUpperCase()} (${role})`);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  if (!dryRun) {
    await adminDb
      .collection('meta')
      .doc('authHardening')
      .set({ doneAt: FieldValue.serverTimestamp(), accountsRotated: rotated });
  }
  console.log(
    `${dryRun ? '[DRY RUN] would rotate' : 'Rotated'} ${rotated} account password(s); ${skipped} other account(s) untouched.`,
  );
  if (privilegedWithoutPin.length) {
    console.warn('\nThese accounts have NO PIN yet and cannot sign in:');
    privilegedWithoutPin.forEach((who) => console.warn(`  • ${who}  →  npm run set-pin -- ${who.split(' ')[0]}`));
  }
  console.log('\nNext: disable Email/Password in Firebase console → Authentication → Sign-in method.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
