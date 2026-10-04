import { useMemo, useState } from 'react';
import { ArrivalSection } from '../../components/ArrivalSection/ArrivalSection';
import { AttendanceExportDialog } from '../../components/AttendanceExportDialog/AttendanceExportDialog';
import { EmployeeList } from '../../components/EmployeeList/EmployeeList';
import { EmployeeManager } from '../../components/EmployeeManager/EmployeeManager';
import { Header } from '../../components/Header/Header';
import { Summary } from '../../components/Summary/Summary';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorBanner } from '../../components/common/ErrorBanner';
import { Spinner } from '../../components/common/Spinner';
import { useActiveTrip, useBuses, useBusEmployees } from '../../hooks/useBusData';
import { useStatusUpdater } from '../../hooks/useStatusUpdater';
import { fetchAttendance } from '../../services/attendanceService';
import { recordArrival, resetArrival, setActiveTripType } from '../../services/busTripService';
import type { AttendanceDay, Employee, StatusField, TripType } from '../../types';
import { todayKey } from '../../utils/date/format';
import { passengersFor } from '../../utils/passengers';
import { toAppError } from '../../utils/errors';

export function ManagerDashboard({ onLogout }: { onLogout: () => void }) {
  const buses = useBuses();
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const list = buses.data ?? [];
  const bus = list.find((b) => b.id === selectedBusId) ?? list[0] ?? null;

  const employees = useBusEmployees(bus?.id ?? null);
  const trip = useActiveTrip(bus);
  const updater = useStatusUpdater();

  const [actionError, setActionError] = useState<string | null>(null);
  const [tripBusy, setTripBusy] = useState(false);
  const [arrivalBusy, setArrivalBusy] = useState(false);
  /** The employee whose card button was pressed (while the record loads, then while the PDF is built). */
  const [exportingId, setExportingId] = useState<string | null>(null);
  /** The loaded record: opens the month picker. */
  const [monthly, setMonthly] = useState<{ employee: Employee; days: AttendanceDay[] } | null>(null);

  const all = employees.data ?? [];
  const main = useMemo(() => all.filter((e) => e.type === 'main'), [all]);
  const waiting = useMemo(() => all.filter((e) => e.type === 'waiting'), [all]);

  const tripType: TripType = bus?.activeTripType ?? 'going';
  const statusField: StatusField = tripType === 'going' ? 'goingStatus' : 'returningStatus';

  // Summary is derived, never edited by hand: everyone who is "in" for the active direction.
  const passengers: Employee[] = useMemo(() => passengersFor(all, statusField), [all, statusField]);

  async function run(setBusy: (v: boolean) => void, action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(toAppError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    if (!bus) return;
    setActionError(null);
    try {
      // jsPDF is loaded on demand so it does not slow down the first page load.
      const { generateSummaryPdf } = await import('../../utils/pdf/generateSummaryPdf');
      generateSummaryPdf({
        route: bus.route,
        busNumber: bus.busNumber,
        tripType,
        date: trip.data?.date ?? todayKey(),
        capacity: bus.capacity,
        passengers,
        arrivalTime: trip.data?.arrivalTime ? trip.data.arrivalTime.toDate() : null,
      });
    } catch (err) {
      setActionError(toAppError(err, 'pdf').message);
    }
  }

  /** Loads one employee's daily records and opens the month picker. */
  async function openMonthly(employee: Employee) {
    if (exportingId) return;
    setExportingId(employee.id);
    setActionError(null);
    try {
      const days = await fetchAttendance(employee.id);
      if (days.length === 0) {
        setActionError(
          `لا يوجد سجل IN لـ ${employee.name} حتى الآن. يبدأ التسجيل من أول تغيير للحالة أو من التصفير الليلي القادم.`,
        );
        return;
      }
      setMonthly({ employee, days });
    } catch (err) {
      setActionError(toAppError(err).message);
    } finally {
      setExportingId(null);
    }
  }

  /** Downloads the chosen month of the open record (every day of the month, Going + Returning) as a PDF. */
  async function downloadMonth(month: string) {
    if (!bus || !monthly || exportingId) return;
    setExportingId(monthly.employee.id);
    try {
      // jsPDF is loaded on demand so it does not slow down the first page load.
      const { generateAttendancePdf } = await import('../../utils/pdf/generateAttendancePdf');
      generateAttendancePdf({
        employeeName: monthly.employee.name,
        employeeType: monthly.employee.type,
        route: bus.route,
        busNumber: bus.busNumber,
        month,
        days: monthly.days,
      });
      setMonthly(null);
    } catch (err) {
      setMonthly(null);
      setActionError(toAppError(err, 'pdf').message);
    } finally {
      setExportingId(null);
    }
  }

  if (buses.loading) return <Spinner label="جارٍ تحميل بيانات الأتوبيس…" />;

  return (
    <div className="page">
      <ErrorBanner message={buses.error} />
      {!bus ? (
        <EmptyState>لا توجد رحلة نشطة.</EmptyState>
      ) : (
        <>
          <Header
            bus={bus}
            buses={list}
            onSelectBus={setSelectedBusId}
            tripBusy={tripBusy}
            onTripChange={(t) => void run(setTripBusy, () => setActiveTripType(bus.id, t))}
            onLogout={onLogout}
          />

          <ErrorBanner message={actionError ?? employees.error ?? trip.error} onDismiss={() => setActionError(null)} />
          <ErrorBanner message={updater.error} onDismiss={updater.clearError} />

          {employees.loading ? (
            <Spinner label="جارٍ تحميل الموظفين…" />
          ) : (
            <>
              <div className="twoCol">
                <EmployeeList
                  title="الأساسي"
                  variant="main"
                  employees={main}
                  pendingValue={updater.pendingValue}
                  onChange={updater.update}
                  onExportLog={(e) => void openMonthly(e)}
                  exportingId={exportingId}
                />
                <EmployeeList
                  title="الانتظار"
                  variant="waiting"
                  employees={waiting}
                  pendingValue={updater.pendingValue}
                  onChange={updater.update}
                  onExportLog={(e) => void openMonthly(e)}
                  exportingId={exportingId}
                />
              </div>
              <Summary
                tripType={tripType}
                capacity={bus.capacity}
                passengers={passengers}
                onExport={() => void exportPdf()}
              />
            </>
          )}

          <ArrivalSection
            trip={trip.data}
            loading={trip.loading && !trip.error}
            busy={arrivalBusy}
            onArrive={() => trip.data && void run(setArrivalBusy, () => recordArrival(trip.data!.id))}
            onReset={() => trip.data && void run(setArrivalBusy, () => resetArrival(trip.data!.id))}
          />

          <EmployeeManager employees={all} bus={bus} buses={list} />

          {monthly && (
            <AttendanceExportDialog
              employeeName={monthly.employee.name}
              days={monthly.days}
              today={todayKey()}
              busy={exportingId === monthly.employee.id}
              onExport={(month) => void downloadMonth(month)}
              onClose={() => setMonthly(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
