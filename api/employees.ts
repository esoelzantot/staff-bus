/**
 * Vercel serverless function – employee management for managers (add / edit / delete).
 *
 * Why a server function: the Firestore rules (rightly) let only admins create or delete employees, and a
 * browser can neither create nor delete OTHER people's Firebase Auth accounts. This function runs with the
 * Admin SDK, but only after it has verified that the caller is signed in AND is a manager/admin (read from
 * users/{uid}), so the rules do not have to be loosened.
 *
 * POST /api/employees   Authorization: Bearer <Firebase ID token>
 *   { action: 'create', employeeId, name, type: 'main' | 'waiting', busId }
 *   { action: 'update', employeeId, name?, type?, busId? }       (the ID itself cannot change)
 *   { action: 'delete', employeeId }
 *
 * Environment (Vercel → Project → Settings → Environment Variables):
 *   FIREBASE_SERVICE_ACCOUNT          the service-account JSON (whole file content)
 *   VITE_EMPLOYEE_EMAIL_DOMAIN        must match the value the accounts were created with (also used by /api/login)
 */
import { FieldValue } from 'firebase-admin/firestore';
import { employeeEmail, getAdmin, HttpError, ID_PATTERN, randomPassword, type Admin } from './_lib/core.js';

export type { Admin };

// ── input validation ───────────────────────────────────────────────────────────────────────────
type EmployeeType = 'main' | 'waiting';
type Body = Record<string, unknown>;

const BUS_ID_PATTERN = /^[\w-]{1,64}$/;

function parseId(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!ID_PATTERN.test(id)) throw new HttpError(400, 'رقم الموظف غير صالح (من 3 إلى 32 حرفاً أو رقماً إنجليزياً، ويسمح بـ _ و -).');
  return id;
}

function parseName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 80) throw new HttpError(400, 'الاسم لازم يكون من حرفين إلى 80 حرفاً.');
  return name;
}

function parseType(raw: unknown): EmployeeType {
  if (raw !== 'main' && raw !== 'waiting') throw new HttpError(400, 'نوع الموظف غير صالح.');
  return raw;
}

function parseBusId(raw: unknown): string {
  const busId = typeof raw === 'string' ? raw.trim() : '';
  if (!BUS_ID_PATTERN.test(busId)) throw new HttpError(400, 'الأتوبيس غير محدد.');
  return busId;
}

// ── stored shapes (only the fields used here) ───────────────────────────────────────────────────
interface StoredEmployee {
  name: string;
  type: EmployeeType;
  busId: string;
  goingStatus: 'in' | 'out';
  returningStatus: 'in' | 'out';
}
interface StoredBus {
  capacity: number;
  goingCount: number;
  returningCount: number;
}

const inCount = (status: unknown) => (status === 'in' ? 1 : 0);

async function findUser(a: Admin, id: string) {
  try {
    return await a.auth.getUserByEmail(employeeEmail(id));
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') return null;
    throw err;
  }
}

// ── authorization ──────────────────────────────────────────────────────────────────────────────
async function requireManager(a: Admin, authorization: string | undefined): Promise<void> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'يجب تسجيل الدخول أولاً.');
  let uid: string;
  try {
    uid = (await a.auth.verifyIdToken(token)).uid;
  } catch {
    throw new HttpError(401, 'انتهت الجلسة. سجّل الدخول من جديد.');
  }
  const role = (await a.db.collection('users').doc(uid).get()).data()?.role;
  if (role !== 'manager' && role !== 'admin') throw new HttpError(403, 'هذا الإجراء للمديرين فقط.');
}

// ── Firestore + login-account helpers ──────────────────────────────────────────────────────────
/** Deletes the employee document and keeps the bus counters / shared location consistent. */
async function removeEmployeeRecord(a: Admin, id: string): Promise<boolean> {
  const empRef = a.db.collection('employees').doc(id);
  return a.db.runTransaction(async (tx) => {
    const empSnap = await tx.get(empRef);
    if (!empSnap.exists) return false;
    const emp = empSnap.data() as StoredEmployee;
    const busRef = a.db.collection('buses').doc(emp.busId);
    const locRef = a.db.collection('busLocations').doc(emp.busId);
    const busSnap = await tx.get(busRef);
    const locSnap = await tx.get(locRef);

    tx.delete(empRef);
    const dG = inCount(emp.goingStatus);
    const dR = inCount(emp.returningStatus);
    if (busSnap.exists && (dG || dR)) {
      const bus = busSnap.data() as StoredBus;
      tx.update(busRef, {
        goingCount: Math.max(0, bus.goingCount - dG),
        returningCount: Math.max(0, bus.returningCount - dR),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    // If the deleted employee was the one sharing the bus location, stop it.
    const loc = locSnap.data();
    if (locSnap.exists && loc?.active && loc.sharedById === id) {
      tx.update(locRef, { active: false, updatedAt: FieldValue.serverTimestamp() });
    }
    return true;
  });
}

/**
 * Creates (or refreshes) the Firebase Auth account + users/{uid} profile of an employee.
 * The account gets a random password nobody knows: employees sign in through /api/login (custom token).
 */
async function provisionLogin(a: Admin, id: string, name: string): Promise<void> {
  const password = randomPassword();
  const existing = await findUser(a, id);
  const uid = existing
    ? (await a.auth.updateUser(existing.uid, { password, displayName: name })).uid
    : (await a.auth.createUser({ email: employeeEmail(id), password, displayName: name, emailVerified: true })).uid;

  const profileRef = a.db.collection('users').doc(uid);
  const hadProfile = (await profileRef.get()).exists;
  await profileRef.set(
    {
      role: 'employee',
      employeeDocId: id,
      ...(hadProfile ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

// ── actions ────────────────────────────────────────────────────────────────────────────────────
async function createEmployee(a: Admin, body: Body): Promise<void> {
  const id = parseId(body.employeeId);
  const name = parseName(body.name);
  const type = parseType(body.type);
  const busId = parseBusId(body.busId);

  // Never take over an existing manager/admin account that happens to use the same ID.
  const existingUser = await findUser(a, id);
  if (existingUser) {
    const role = (await a.db.collection('users').doc(existingUser.uid).get()).data()?.role;
    if (role && role !== 'employee') throw new HttpError(409, 'هذا الرقم مستخدم لحساب مدير ولا يمكن استخدامه لموظف.');
  }

  const empRef = a.db.collection('employees').doc(id);
  const busRef = a.db.collection('buses').doc(busId);

  await a.db.runTransaction(async (tx) => {
    const empSnap = await tx.get(empRef);
    const busSnap = await tx.get(busRef);
    const peers = type === 'main' ? await tx.get(a.db.collection('employees').where('busId', '==', busId)) : null;

    if (empSnap.exists) throw new HttpError(409, 'رقم الموظف مستخدم بالفعل.');
    if (!busSnap.exists) throw new HttpError(404, 'الأتوبيس غير موجود.');
    const bus = busSnap.data() as StoredBus;

    if (type === 'main' && peers) {
      // Main employees start (and every new day restart) as IN for both directions, so they must fit the bus.
      const mains = peers.docs.filter((d) => d.data().type === 'main').length;
      if (mains >= bus.capacity) {
        throw new HttpError(409, `عدد الموظفين الأساسيين وصل لسعة الأتوبيس (${bus.capacity}). لا يمكن إضافة موظف أساسي آخر.`);
      }
      if (bus.goingCount >= bus.capacity || bus.returningCount >= bus.capacity) {
        throw new HttpError(409, 'الأتوبيس ممتلئ حالياً، والموظف الأساسي يبدأ IN دائماً. أخرج أحد الركاب أولاً أو أضفه كموظف انتظار.');
      }
    }

    const initial = type === 'main' ? 'in' : 'out';
    tx.create(empRef, {
      employeeId: id,
      name,
      type,
      busId,
      goingStatus: initial,
      returningStatus: initial,
      goingInCount: 0,
      returningInCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (type === 'main') {
      tx.update(busRef, {
        goingCount: bus.goingCount + 1,
        returningCount: bus.returningCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  try {
    await provisionLogin(a, id, name);
  } catch (err) {
    console.error(err);
    await removeEmployeeRecord(a, id).catch(() => undefined); // roll the record back
    throw new HttpError(500, 'تعذر إنشاء حساب الدخول للموظف، لم تتم الإضافة. حاول مرة أخرى.');
  }
}

async function updateEmployee(a: Admin, body: Body): Promise<void> {
  const id = parseId(body.employeeId);
  const empRef = a.db.collection('employees').doc(id);
  let nameChanged = false;
  let newName = '';

  await a.db.runTransaction(async (tx) => {
    const empSnap = await tx.get(empRef);
    if (!empSnap.exists) throw new HttpError(404, 'الموظف غير موجود.');
    const emp = empSnap.data() as StoredEmployee;

    const name = body.name !== undefined ? parseName(body.name) : emp.name;
    const type = body.type !== undefined ? parseType(body.type) : emp.type;
    const busId = body.busId !== undefined ? parseBusId(body.busId) : emp.busId;
    const busChanged = busId !== emp.busId;
    const becomesMain = type === 'main' && (emp.type !== 'main' || busChanged);
    nameChanged = name !== emp.name;
    newName = name;

    // all reads first
    const newBusRef = a.db.collection('buses').doc(busId);
    const oldBusRef = a.db.collection('buses').doc(emp.busId);
    const newBusSnap = await tx.get(newBusRef);
    const oldBusSnap = busChanged ? await tx.get(oldBusRef) : null;
    const peers = becomesMain ? await tx.get(a.db.collection('employees').where('busId', '==', busId)) : null;

    if (!newBusSnap.exists) throw new HttpError(404, 'الأتوبيس غير موجود.');
    const newBus = newBusSnap.data() as StoredBus;
    const dG = inCount(emp.goingStatus);
    const dR = inCount(emp.returningStatus);

    if (busChanged && (newBus.goingCount + dG > newBus.capacity || newBus.returningCount + dR > newBus.capacity)) {
      throw new HttpError(409, 'الأتوبيس الجديد ممتلئ.');
    }
    if (becomesMain && peers) {
      const mains = peers.docs.filter((d) => d.id !== id && d.data().type === 'main').length;
      if (mains >= newBus.capacity) {
        throw new HttpError(409, `عدد الموظفين الأساسيين وصل لسعة الأتوبيس (${newBus.capacity}).`);
      }
    }

    // writes
    tx.update(empRef, { name, type, busId, updatedAt: FieldValue.serverTimestamp() });
    if (busChanged && (dG || dR)) {
      if (oldBusSnap?.exists) {
        const oldBus = oldBusSnap.data() as StoredBus;
        tx.update(oldBusRef, {
          goingCount: Math.max(0, oldBus.goingCount - dG),
          returningCount: Math.max(0, oldBus.returningCount - dR),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(newBusRef, {
        goingCount: newBus.goingCount + dG,
        returningCount: newBus.returningCount + dR,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  if (nameChanged) {
    const user = await findUser(a, id);
    if (user) await a.auth.updateUser(user.uid, { displayName: newName }).catch(() => undefined);
  }
}

async function deleteEmployee(a: Admin, body: Body): Promise<void> {
  const id = parseId(body.employeeId);
  if (!(await removeEmployeeRecord(a, id))) throw new HttpError(404, 'الموظف غير موجود.');

  // Remove the login account too (never touch a manager/admin account).
  const user = await findUser(a, id);
  if (!user) return;
  const profileRef = a.db.collection('users').doc(user.uid);
  const role = (await profileRef.get()).data()?.role;
  if (role && role !== 'employee') return;
  await profileRef.delete();
  await a.auth.deleteUser(user.uid);
}

/** Core entry point (exported so it can be tested without HTTP). */
export async function handleEmployees(a: Admin, authorization: string | undefined, rawBody: unknown): Promise<void> {
  await requireManager(a, authorization);
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Body;
  switch (body.action) {
    case 'create':
      return createEmployee(a, body);
    case 'update':
      return updateEmployee(a, body);
    case 'delete':
      return deleteEmployee(a, body);
    default:
      throw new HttpError(400, 'إجراء غير معروف.');
  }
}

// ── HTTP wrapper (Vercel Node.js function) ─────────────────────────────────────────────────────
interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      throw new HttpError(405, 'الطريقة غير مدعومة.');
    }
    const header = req.headers.authorization;
    const authorization = Array.isArray(header) ? header[0] : header;
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        throw new HttpError(400, 'بيانات غير صالحة.');
      }
    }
    await handleEmployees(getAdmin(), authorization, body);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ في الخادم. حاول مرة أخرى.' });
  }
}
