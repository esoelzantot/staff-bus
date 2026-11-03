import { useMemo, useState, type ReactNode } from 'react';
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiClock, FiDownload } from 'react-icons/fi';
import { useToday } from '../../hooks/useBusData';
import { useLiveData } from '../../hooks/useLiveData';
import { subscribeMonthArrivals } from '../../services/arrivalService';
import { buildArrivalMonth, formatMinutes, shiftMonth, type ArrivalRecord } from '../../utils/arrivals';
import { monthOf } from '../../utils/attendance';
import { formatDayLabel, formatMonth } from '../../utils/date/format';
import { toAppError } from '../../utils/errors';
import { ArrivalBadge } from '../common/ArrivalBadge';
import { ErrorBanner } from '../common/ErrorBanner';
import { Spinner } from '../common/Spinner';

interface Props {
  busId: string;
  /** Employee page: a collapsible section, closed at first (the page stays short). */
  collapsible?: boolean;
  /** Manager dashboard: shows "تصدير PDF" for the shown month; the route is printed on it. */
  exportRoute?: string;
}

const AR = 'ar-EG-u-nu-latn';

/** "سجل وصول الباص": the going-trip arrival time of every working day of a month, with average / earliest / latest. */
export function ArrivalHistory({ busId, collapsible = false, exportRoute }: Props) {
  const today = useToday();
  const current = monthOf(today);
  const [month, setMonth] = useState(current);
  const live = useLiveData<ArrivalRecord[]>((ok, err) => subscribeMonthArrivals(busId, month, ok, err), [busId, month]);
  const view = useMemo(() => buildArrivalMonth(live.data ?? [], month, today), [live.data, month, today]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportPdf() {
    if (exportRoute === undefined || !live.data) return;
    setExporting(true);
    setExportError(null);
    try {
      // jsPDF is loaded on demand so it does not slow down the first page load.
      const { generateArrivalPdf } = await import('../../utils/pdf/generateArrivalPdf');
      generateArrivalPdf({ route: exportRoute, month, records: live.data });
    } catch (err) {
      setExportError(toAppError(err, 'pdf').message);
    } finally {
      setExporting(false);
    }
  }

  const body = (
    <>
      <div className="arrivalHistory__nav">
        <button type="button" className="iconBtn" aria-label="الشهر اللي قبله" onClick={() => setMonth(shiftMonth(month, -1))}>
          <FiChevronRight aria-hidden="true" />
        </button>
        <strong aria-live="polite">{formatMonth(month, AR)}</strong>
        <button
          type="button"
          className="iconBtn"
          aria-label="الشهر اللي بعده"
          disabled={month >= current}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <FiChevronLeft aria-hidden="true" />
        </button>
      </div>

      <ErrorBanner message={live.error} />
      <ErrorBanner message={exportError} onDismiss={() => setExportError(null)} />

      {live.loading ? (
        <Spinner label="جارٍ تحميل سجل الوصول…" />
      ) : (
        <>
          <div className="arrivalStats">
            <Stat label="متوسط الوصول" value={view.average} />
            <Stat label="أبكر وصول" value={view.earliest} />
            <Stat label="أتأخر وصول" value={view.latest} />
            <div className="arrivalStats__item">
              <span>أيام اتسجّلت</span>
              <strong>
                <bdi dir="ltr">
                  {view.recorded} <small>/ {view.rows.length}</small>
                </bdi>
              </strong>
            </div>
          </div>

          {view.recorded > 0 && (
            <p className="arrivalHistory__split">
              <span className="arrivalBadge arrivalBadge--early">بدري</span> <bdi>{view.onTime}</bdi> يوم
              <span aria-hidden="true">·</span>
              <span className="arrivalBadge arrivalBadge--late">متأخر</span> <bdi>{view.late}</bdi> يوم
              <span className="arrivalHistory__rule">(الموعد لحد 9:00 الصبح)</span>
            </p>
          )}

          {view.rows.length === 0 ? (
            <p className="arrivalHistory__empty">الشهر ده لسه ما بدأش.</p>
          ) : (
            <ol className="arrivalList">
              {view.rows.map((r) => (
                <li key={r.date} className={`arrivalRow${r.minutes === null ? ' is-missing' : ''}${r.date === today ? ' is-today' : ''}`}>
                  <span className="arrivalRow__day">
                    {formatDayLabel(r.date)}
                    {r.date === today && <span className="meTag">النهارده</span>}
                  </span>
                  {r.minutes === null ? (
                    <span className="arrivalRow__time arrivalRow__time--none">لم يُسجَّل</span>
                  ) : (
                    <span className="arrivalRow__time">
                      <ArrivalBadge minutes={r.minutes} />
                      <FiClock aria-hidden="true" />
                      <bdi>{formatMinutes(r.minutes)}</bdi>
                    </span>
                  )}
                  {r.arrivedByName && (
                    <span className="arrivalRow__by">
                      سجّله <bdi dir="auto">{r.arrivedByName}</bdi>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </>
  );

  const title = 'سجل وصول الباص';
  if (collapsible) {
    return (
      <details className="section manage arrivalHistory">
        <summary className="manage__summary">
          <h2>{title}</h2>
          <FiChevronDown className="manage__chev" aria-hidden="true" />
        </summary>
        <div className="arrivalHistory__body">{body}</div>
      </details>
    );
  }
  return (
    <section className="section arrivalHistory" aria-labelledby="arrival-history-title">
      <div className="section__head">
        <h2 id="arrival-history-title">{title}</h2>
        {exportRoute !== undefined && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={exporting || live.loading || !live.data}
            onClick={() => void exportPdf()}
          >
            {exporting ? <span className="spinner spinner--sm" aria-hidden="true" /> : <FiDownload aria-hidden="true" />}
            {exporting ? 'جارٍ التجهيز…' : 'تصدير PDF'}
          </button>
        )}
      </div>
      {body}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | null }): ReactNode {
  return (
    <div className="arrivalStats__item">
      <span>{label}</span>
      <strong>
        <bdi>{value === null ? '—' : formatMinutes(value)}</bdi>
      </strong>
    </div>
  );
}
