import { auth } from '../firebase';
import type { EmployeeType } from '../types';
import { makeError, toAppError } from '../utils/errors';

type Payload =
  | { action: 'create'; employeeId: string; name: string; type: EmployeeType; busId: string }
  | { action: 'update'; employeeId: string; name?: string; type?: EmployeeType; busId?: string }
  | { action: 'delete'; employeeId: string };

/**
 * Employees are managed by the server function /api/employees (Admin SDK): it verifies that the caller is a
 * manager from the Firebase ID token, creates/deletes the login account and keeps the bus counters in sync.
 */
async function call(payload: Payload): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw makeError('permission-denied');
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) return;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 404 && !data?.error) {
      throw makeError('unknown', 'خدمة إدارة الموظفين غير متاحة في هذه البيئة (تعمل على Vercel فقط).');
    }
    throw makeError('unknown', data?.error ?? 'تعذر تنفيذ العملية. حاول مرة أخرى.');
  } catch (err) {
    throw toAppError(err);
  }
}

export const createEmployee = (input: { employeeId: string; name: string; type: EmployeeType; busId: string }) =>
  call({ action: 'create', ...input });

export const updateEmployee = (input: { employeeId: string; name: string; type: EmployeeType; busId: string }) =>
  call({ action: 'update', ...input });

export const deleteEmployee = (employeeId: string) => call({ action: 'delete', employeeId });
