import { useMemo, useState } from 'react';
import { ArrivalSection } from '../../components/ArrivalSection/ArrivalSection';
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
import type { Employee, StatusField, TripType } from '../../types';
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
  const [exportingId, setExportingId] = useState<string | null>(null);

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

  /** Downloads one employee's daily IN record (every recorded day: Going + Returning) as a PDF. */
  async function exportAttendance(employee: Employee) {
    if (!bus || exportingId) return;
    setExportingId(employee.id);
    setActionError(null);
    try {
      const days = await fetchAttendance(employee.id);
      if (days.length === 0) {
        setActionError(`لا يوجد سجل IN لـ ${employee.name} حتى الآن. يبدأ التسجيل من أول تغيير للحالة أو من التصفير الليلي القادم.`);
        return;
      }
      // jsPDF is loaded on demand so it does not slow down the first page load.
      const { generateAttendancePdf } = await import('../../utils/pdf/generateAttendancePdf');
      generateAttendancePdf({
        employeeName: employee.name,
        employeeType: employee.type,
        route: bus.route,
        busNumber: bus.busNumber,
        days,
      });
    } catch (err) {
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
                onExportLog={(e) => void exportAttendance(e)}
                exportingId={exportingId}
              />
              <EmployeeList
                title="الانتظار"
                variant="waiting"
                employees={waiting}
                pendingValue={updater.pendingValue}
                onChange={updater.update}
                onExportLog={(e) => void exportAttendance(e)}
                exportingId={exportingId}
              />
              </div>
              <Summary tripType={tripType} capacity={bus.capacity} passengers={passengers} onExport={() => void exportPdf()} />
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
        </>
      )}
    </div>
  );
}

