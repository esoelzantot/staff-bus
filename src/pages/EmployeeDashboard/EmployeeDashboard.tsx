import { useMemo, useState } from 'react';
import { FiLogOut } from 'react-icons/fi';
import { ArrivedFooter } from '../../components/ArrivedFooter/ArrivedFooter';
import { BusTracker } from '../../components/BusTracker/BusTracker';
import { EmployeeCard } from '../../components/EmployeeCard/EmployeeCard';
import { EmployeeList } from '../../components/EmployeeList/EmployeeList';
import { PassengerList } from '../../components/PassengerList/PassengerList';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorBanner } from '../../components/common/ErrorBanner';
import { Spinner } from '../../components/common/Spinner';
import { useBus, useBusEmployees, useEmployeeRecord, useToday, useTodayGoingTrip } from '../../hooks/useBusData';
import { useStatusUpdater } from '../../hooks/useStatusUpdater';
import { recordArrivalByEmployee, resetArrival } from '../../services/busTripService';
import type { TripType } from '../../types';
import { formatDayLabel, todayKey } from '../../utils/date/format';
import { toAppError } from '../../utils/errors';
import { passengersFor } from '../../utils/passengers';

interface Props {
  employeeId: string;
  onLogout: () => void;
}

/** Employees see everyone on their bus, but only their own record is editable. */
export function EmployeeDashboard({ employeeId, onLogout }: Props) {
  const record = useEmployeeRecord(employeeId);
  const me = record.data;
  const bus = useBus(me?.busId ?? null);
  const people = useBusEmployees(me?.busId ?? null);
  const updater = useStatusUpdater();
  const today = useToday();
  const trip = useTodayGoingTrip(bus.data);
  const [arriveBusy, setArriveBusy] = useState(false);
  const [arriveError, setArriveError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const all = people.data ?? [];
  const main = useMemo(() => all.filter((e) => e.type === 'main'), [all]);
  const waiting = useMemo(() => all.filter((e) => e.type === 'waiting'), [all]);
  const going = useMemo(() => passengersFor(all, 'goingStatus'), [all]);
  const returning = useMemo(() => passengersFor(all, 'returningStatus'), [all]);

  async function arrive() {
    if (!bus.data || !me) return;
    setArriveBusy(true);
    setArriveError(null);
    try {
      await recordArrivalByEmployee(bus.data, trip.date, me);
    } catch (err) {
      setArriveError(toAppError(err).message);
    } finally {
      setArriveBusy(false);
    }
  }

  async function cancelArrival() {
    if (!trip.data) return;
    setArriveBusy(true);
    setArriveError(null);
    try {
      await resetArrival(trip.data.id);
    } catch (err) {
      setArriveError(toAppError(err).message);
    } finally {
      setArriveBusy(false);
    }
  }

  async function exportList(tripType: TripType) {
    if (!bus.data) return;
    setExportError(null);
    try {
      // jsPDF is loaded on demand so it does not slow down the first page load.
      const { generateSummaryPdf } = await import('../../utils/pdf/generateSummaryPdf');
      generateSummaryPdf({
        route: bus.data.route,
        busNumber: bus.data.busNumber,
        tripType,
        date: todayKey(),
        capacity: bus.data.capacity,
        passengers: tripType === 'going' ? going : returning,
        arrivalTime: null,
      });
    } catch (err) {
      setExportError(toAppError(err, 'pdf').message);
    }
  }

  return (
    <main className="page">
      <div className="topbar">
        <h1>سجلي في الأتوبيس</h1>
        <button type="button" className="btn btn--ghost" onClick={onLogout}>
          <FiLogOut aria-hidden="true" /> تغيير الموظف
        </button>
      </div>

      <ErrorBanner message={record.error ?? bus.error ?? people.error ?? trip.error} />
      <ErrorBanner message={updater.error} onDismiss={updater.clearError} />
      <ErrorBanner message={exportError} onDismiss={() => setExportError(null)} />
      <ErrorBanner message={arriveError} onDismiss={() => setArriveError(null)} />

      {record.loading ? (
        <Spinner label="جارٍ تحميل بيانات الموظف…" />
      ) : !me ? (
        <EmptyState>لم يتم العثور على سجلك. تواصل مع المسؤول.</EmptyState>
      ) : (
        <>
          {bus.data && (
            <section className="busInfo" aria-label="بيانات الأتوبيس">
              <div className="busInfo__day">
                <span className="busInfo__caption">اليوم</span>
                <strong>{formatDayLabel(today)}</strong>
              </div>
              <div>
                <span className="busInfo__caption">المسار</span>
                <strong dir="auto">{bus.data.route}</strong>
              </div>
              <div>
                <span className="busInfo__caption">الأتوبيس</span>
                <strong dir="auto">{bus.data.busNumber}</strong>
              </div>
              <div>
                <span className="busInfo__caption">الذهاب</span>
                <strong>
                  <bdi className="num">
                    {bus.data.goingCount} / {bus.data.capacity}
                  </bdi>
                </strong>
              </div>
              <div>
                <span className="busInfo__caption">العودة</span>
                <strong>
                  <bdi className="num">
                    {bus.data.returningCount} / {bus.data.capacity}
                  </bdi>
                </strong>
              </div>
            </section>
          )}
          {bus.loading && <Spinner label="جارٍ تحميل بيانات الأتوبيس…" />}

          <EmployeeCard
            employee={me}
            size="large"
            isMe
            pendingValue={updater.pendingValue}
            onChange={updater.update}
          />

          {bus.data && <BusTracker bus={bus.data} me={me} arrived={Boolean(trip.data?.arrivalTime)} />}

          {people.loading ? (
            <Spinner label="جارٍ تحميل القوائم…" />
          ) : people.error ? (
            <EmptyState>تعذر تحميل قوائم الموظفين. تحقق من الاتصال أو من نشر قواعد Firestore الأحدث.</EmptyState>
          ) : (
            <>
              <div className="twoCol">
                <PassengerList
                  title="قائمة الذهاب"
                  capacity={bus.data?.capacity ?? 0}
                  passengers={going}
                  meId={me.id}
                  onExport={bus.data ? () => void exportList('going') : undefined}
                />
                <PassengerList
                  title="قائمة العودة"
                  capacity={bus.data?.capacity ?? 0}
                  passengers={returning}
                  meId={me.id}
                  onExport={bus.data ? () => void exportList('returning') : undefined}
                />
              </div>
              <div className="twoCol">
                <EmployeeList title="الأساسي" variant="main" employees={main} readOnly meId={me.id} />
                <EmployeeList title="الانتظار" variant="waiting" employees={waiting} readOnly meId={me.id} />
              </div>
            </>
          )}
        </>
      )}

      {/* "وصلنا" exists for the going direction only */}
      {me && bus.data?.activeTripType === 'going' && (
        <ArrivedFooter
          trip={trip.data}
          loading={trip.loading}
          busy={arriveBusy}
          canCancel={trip.data?.arrivedById === me.id}
          onArrive={() => void arrive()}
          onCancel={() => void cancelArrival()}
        />
      )}
    </main>
  );
}
