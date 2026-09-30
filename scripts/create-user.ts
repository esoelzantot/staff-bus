/**
 * Production provisioning (Admin SDK – run from a trusted machine only).
 *
 *   npm run create-user -- bus      <busId> "<Route>" "<Bus number>" [capacity]
 *   npm run create-user -- employee <EMPLOYEE_ID> "<Full Name>" <main|waiting> <busId>
 *   npm run create-user -- manager  <ID>
 *   npm run create-user -- admin    <ID>
 *
 * Everyone signs in with the ID only. Re-running "employee" for an existing ID does not touch their record.
 */
import { FieldValue, ID_PATTERN, adminDb, normalizeId, setUserProfile, upsertAuthUser } from './lib/admin';

const [kind, ...args] = process.argv.slice(2);

function usage(): never {
  console.error(
    [
      'Usage:',
      '  npm run create-user -- bus      <busId> "<Route>" "<Bus number>" [capacity]',
      '  npm run create-user -- employee <EMPLOYEE_ID> "<Full Name>" <main|waiting> <busId>',
      '  npm run create-user -- manager  <ID>',
      '  npm run create-user -- admin    <ID>',
    ].join('\n'),
  );
  process.exit(1);
}

function checkId(raw: string | undefined): string {
  if (!raw) usage();
  const id = normalizeId(raw);
  if (!ID_PATTERN.test(id)) throw new Error('ID must be 3–32 chars: A–Z, 0–9, _ or -');
  return id;
}

async function main() {
  if (kind === 'manager' || kind === 'admin') {
    const id = checkId(args[0]);
    const uid = await upsertAuthUser(id, id);
    await setUserProfile(uid, { role: kind });
    console.log(`${kind} ready → sign in with ID: ${id}`);
    return;
  }

  if (kind === 'employee') {
    const [rawId, name, type, busId] = args;
    const employeeId = checkId(rawId);
    if (!name || (type !== 'main' && type !== 'waiting') || !busId) usage();
    if (!(await adminDb.collection('buses').doc(busId).get()).exists) throw new Error(`Bus "${busId}" does not exist.`);

    const uid = await upsertAuthUser(employeeId, name);
    const ref = adminDb.collection('employees').doc(employeeId);
    if ((await ref.get()).exists) {
      console.log(`Employee ${employeeId} already exists – login refreshed, record untouched.`);
    } else {
      await ref.create({
        employeeId,
        name,
        type,
        busId,
        goingStatus: 'out',
        returningStatus: 'out',
        goingInCount: 0,
        returningInCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await setUserProfile(uid, { role: 'employee', employeeDocId: employeeId });
    console.log(`employee ready → sign in with ID: ${employeeId}`);
    return;
  }

  if (kind === 'bus') {
    const [busId, route, busNumber, capacityArg = '13'] = args;
    const capacity = Number.parseInt(capacityArg, 10);
    if (!busId || !route || !busNumber || !Number.isInteger(capacity) || capacity < 1) usage();
    await adminDb.collection('buses').doc(busId).create({
      route,
      busNumber,
      capacity,
      activeTripType: 'going',
      goingCount: 0,
      returningCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`bus created → ${busId} (${route}, ${busNumber}, capacity ${capacity})`);
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
