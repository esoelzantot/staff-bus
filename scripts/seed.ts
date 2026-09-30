/**
 * DEVELOPMENT seed data – never run this against a production project.
 *
 *   npm run seed
 *
 * (Re)creates one sample bus, employees EMP1001–EMP1005 and one sample manager (MGR001),
 * and resets all their statuses. Everyone signs in with the ID only.
 */
import { FieldValue, adminDb, projectId, setUserProfile, upsertAuthUser } from './lib/admin';

if (!process.argv.includes('--dev') || process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: run with "npm run seed" (adds --dev) and NODE_ENV != production.');
  process.exit(1);
}

const BUS_ID = 'bus-nozha-01';
const BUS = { route: 'النزهة', busNumber: 'أ ص 8381', capacity: 13 };

const EMPLOYEES = [
  { employeeId: 'EMP1001', name: 'Ahmed Mohamed', type: 'main' },
  { employeeId: 'EMP1002', name: 'Mohamed Ali', type: 'main' },
  { employeeId: 'EMP1003', name: 'Omar Khaled', type: 'main' },
  { employeeId: 'EMP1004', name: 'Sara Ahmed', type: 'waiting' },
  { employeeId: 'EMP1005', name: 'Youssef Ali', type: 'waiting' },
] as const;

const MANAGER_ID = 'MGR001';

async function main() {
  console.log(`Seeding DEVELOPMENT data into project "${projectId}" …`);

  await adminDb.collection('buses').doc(BUS_ID).set({
    ...BUS,
    activeTripType: 'going',
    goingCount: 0,
    returningCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  for (const e of EMPLOYEES) {
    const uid = await upsertAuthUser(e.employeeId, e.name);
    await adminDb.collection('employees').doc(e.employeeId).set({
      employeeId: e.employeeId,
      name: e.name,
      type: e.type,
      busId: BUS_ID,
      goingStatus: 'out',
      returningStatus: 'out',
      goingInCount: 0,
      returningInCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await setUserProfile(uid, { role: 'employee', employeeDocId: e.employeeId });
  }

  const managerUid = await upsertAuthUser(MANAGER_ID, 'Sample Manager');
  await setUserProfile(managerUid, { role: 'manager' });

  console.log('Done. Sign in with any of these IDs:');
  console.table([
    ...EMPLOYEES.map((e) => ({ id: e.employeeId, name: e.name, role: 'employee' })),
    { id: MANAGER_ID, name: 'Sample Manager', role: 'manager (full dashboard)' },
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
