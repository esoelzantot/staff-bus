/**
 * Bulk-imports the REAL roster (Admin SDK – run from a trusted machine only).
 *
 *   npm run import-employees -- data/employees.csv --dry-run   # check only, writes nothing
 *   npm run import-employees -- data/employees.csv             # import
 *
 * CSV header:  employeeId,name,type[,busId]      type = main | waiting
 *
 *  - "main" employees start as IN for BOTH Going and Returning; "waiting" employees start as OUT.
 *  - The bus counters (goingCount / returningCount) are recomputed from the real employee records.
 *  - Existing employees are NOT modified (their login is refreshed) – safe to re-run.
 *  - The buses must already exist:  npm run create-user -- bus <busId> "<Route>" "<Bus number>" [capacity]
 */
import { readFileSync } from 'node:fs';
import { FieldValue, ID_PATTERN, adminDb, normalizeId, projectId, setUserProfile, upsertAuthUser } from './lib/admin';
import { parseEmployees } from './lib/employeesCsv';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));

function fail(lines: string[]): never {
  console.error(lines.join('\n'));
  process.exit(1);
}

async function main() {
  if (!file) fail(['Usage: npm run import-employees -- <file.csv> [--dry-run]']);

  const { rows, errors } = parseEmployees(readFileSync(file, 'utf8'), normalizeId, ID_PATTERN);
  if (errors.length) fail(['الملف فيه أخطاء، لم يتم تنفيذ أي شيء:', ...errors.map((e) => `  • ${e}`)]);

  // ── buses ──────────────────────────────────────────────────────────────
  const busSnap = await adminDb.collection('buses').get();
  const buses = new Map(busSnap.docs.map((d) => [d.id, { capacity: d.data().capacity as number, route: d.data().route as string }]));
  if (buses.size === 0) fail(['لا يوجد أتوبيس في المشروع. أنشئه الأول:', '  npm run create-user -- bus <busId> "<Route>" "<Bus number>" 13']);

  const onlyBus = buses.size === 1 ? [...buses.keys()][0] : null;
  const problems: string[] = [];
  for (const r of rows) {
    r.busId ??= onlyBus;
    if (!r.busId) problems.push(`سطر ${r.line}: فيه أكتر من أتوبيس، لازم تكتب busId.`);
    else if (!buses.has(r.busId)) problems.push(`سطر ${r.line}: الأتوبيس "${r.busId}" غير موجود.`);
  }
  // "main" employees fill the bus, so they must fit its capacity.
  for (const [busId, bus] of buses) {
    const mains = rows.filter((r) => r.busId === busId && r.type === 'main').length;
    if (mains > bus.capacity) problems.push(`الأتوبيس ${busId}: عدد الأساسي (${mains}) أكبر من السعة (${bus.capacity}).`);
  }
  if (problems.length) fail(['لم يتم تنفيذ أي شيء:', ...problems.map((p) => `  • ${p}`)]);

  // ── summary ────────────────────────────────────────────────────────────
  console.log(`Project: ${projectId}${dryRun ? '  (DRY RUN – nothing will be written)' : ''}`);
  for (const [busId, bus] of buses) {
    const mine = rows.filter((r) => r.busId === busId);
    if (mine.length) {
      console.log(
        `Bus ${busId} (${bus.route}, capacity ${bus.capacity}): ${mine.filter((r) => r.type === 'main').length} main (start IN) + ${mine.filter((r) => r.type === 'waiting').length} waiting (start OUT)`,
      );
    }
  }
  if (dryRun) {
    console.table(rows.map(({ employeeId, name, type, busId }) => ({ employeeId, name, type, busId })));
    return;
  }

  // ── write ──────────────────────────────────────────────────────────────
  const result: { employeeId: string; name: string; type: string; result: string }[] = [];
  for (const r of rows) {
    const uid = await upsertAuthUser(r.employeeId, r.name);
    const ref = adminDb.collection('employees').doc(r.employeeId);
    const initial = r.type === 'main' ? 'in' : 'out';
    let outcome = 'created';
    if ((await ref.get()).exists) {
      outcome = 'already exists (untouched)';
    } else {
      await ref.create({
        employeeId: r.employeeId,
        name: r.name,
        type: r.type,
        busId: r.busId,
        goingStatus: initial,
        returningStatus: initial,
        goingInCount: 0,
        returningInCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await setUserProfile(uid, { role: 'employee', employeeDocId: r.employeeId });
    result.push({ employeeId: r.employeeId, name: r.name, type: r.type, result: outcome });
  }

  // Counters = the real number of IN employees (repairs any drift, safe to repeat).
  for (const busId of new Set(rows.map((r) => r.busId as string))) {
    const emps = await adminDb.collection('employees').where('busId', '==', busId).get();
    const goingCount = emps.docs.filter((d) => d.data().goingStatus === 'in').length;
    const returningCount = emps.docs.filter((d) => d.data().returningStatus === 'in').length;
    await adminDb.collection('buses').doc(busId).update({ goingCount, returningCount, updatedAt: FieldValue.serverTimestamp() });
    console.log(`Bus ${busId}: goingCount=${goingCount}, returningCount=${returningCount}`);
  }

  console.table(result);
  console.log('Done. Employees sign in with their employeeId only (managers / admins: ID + PIN).');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
