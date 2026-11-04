import { FiLogOut } from 'react-icons/fi';
import { useServiceDay, useToday } from '../../hooks/useBusData';
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
  const day = useServiceDay();
  return (
    <header className="board">
      <span className="speedLines speedLines--board" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <div className="board__sign">
        <div className="board__route">
          <span className="board__caption">المسار</span>
          <strong dir="auto">{bus.route}</strong>
        </div>
        <div className="board__day">
          <span className="board__caption">{day === today ? 'اليوم' : 'اليوم الجاي'}</span>
          <strong>{formatDayLabel(day)}</strong>
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
          <select className="select" value={bus.id} onChange={(e) => onSelectBus(e.target.value)} aria-label="اختيار الباص">
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.busNumber ? `${b.route} – ${b.busNumber}` : b.route}
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
