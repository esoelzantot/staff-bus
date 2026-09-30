import { EmployeeIdDialog } from '../../components/EmployeeIdDialog/EmployeeIdDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { Spinner } from '../../components/common/Spinner';
import { useAuth } from '../../context/AuthContext';
import { EmployeeDashboard } from '../EmployeeDashboard/EmployeeDashboard';
import { ManagerDashboard } from '../ManagerDashboard/ManagerDashboard';

/** One entry point: sign in with the Employee ID, then the account's role decides the screen. */
export function Home() {
  const { state, error, logout } = useAuth();
  const signOut = () => void logout();

  if (state.status === 'loading') return <Spinner label="جارٍ التحميل…" />;
  if (state.status === 'signedOut') return <EmployeeIdDialog initialError={error} />;

  const { user } = state;
  if (user.role === 'employee') {
    if (!user.employeeId) {
      return (
        <main className="page page--narrow">
          <EmptyState>هذا الحساب غير مرتبط بسجل موظف. تواصل مع المسؤول.</EmptyState>
          <div className="center">
            <button type="button" className="btn btn--primary" onClick={signOut}>
              تسجيل الخروج
            </button>
          </div>
        </main>
      );
    }
    return <EmployeeDashboard employeeId={user.employeeId} onLogout={signOut} />;
  }
  return <ManagerDashboard onLogout={signOut} />;
}
