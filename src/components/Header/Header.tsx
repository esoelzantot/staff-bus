import { FiLogOut } from 'react-icons/fi';
import { useToday } from '../../hooks/useBusData';
import type { Bus, TripType } from '../../types';
import { formatDayLabel } from '../../utils/date/format';

interface Props {
  bus: Bus;
  buses: Bus[];
  onSelectBus: (busId: string) => void;
  onTripChange: (tripType: TripType) => void;
  tripBusy: boolean;
  onLogout: () => void;
}

export function Header({ bus, buses, onSelectBus, onTripChange, tripBusy, onLogout }: Props) {
  const today = useToday();
  return (
    <header className="board">
      <div className="board__sign">
        <div className="board__route">
          <span className="board__caption">المسار</span>
          <strong dir="auto">{bus.route}</strong>
        </div>
        <div className="board__day">
          <span className="board__caption">اليوم</span>
          <strong>{formatDayLabel(today)}</strong>
        </div>
        <div className="board__plate">
          <span className="board__caption">الأتوبيس</span>
          <strong dir="auto">{bus.busNumber}</strong>
        </div>
      </div>

      <div className="board__controls">
        <div className="segmented" role="group" aria-label="الرحلة الحالية">
          {(['going', 'returning'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`segmented__btn${bus.activeTripType === t ? ' is-active' : ''}`}
              aria-pressed={bus.activeTripType === t}
              disabled={tripBusy}
              onClick={() => bus.activeTripType !== t && onTripChange(t)}
            >
              {t === 'going' ? 'الذهاب' : 'العودة'}
            </button>
          ))}
        </div>

        {buses.length > 1 && (
          <select className="select" value={bus.id} onChange={(e) => onSelectBus(e.target.value)} aria-label="اختيار الأتوبيس">
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.route} – {b.busNumber}
              </option>
            ))}
          </select>
        )}

        <button type="button" className="btn btn--ghost btn--onDark" onClick={onLogout}>
          <FiLogOut aria-hidden="true" /> تسجيل الخروج
        </button>
      </div>
    </header>
  );
}
