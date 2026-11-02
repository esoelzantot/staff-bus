interface Props {
  /** "الذهاب" / "العودة" – shown above the seats. */
  label: string;
  capacity: number;
  /** Seats taken (employees IN for that direction). */
  taken: number;
  size?: 'regular' | 'small';
}

/** Seats per row, as in the bus: 2 | aisle | 2. */
const PER_ROW = 4;

/**
 * The bus seen from above: every seat drawn, the taken ones in J&T red. Shows at a glance how many seats are free
 * – the same number as "13 / 14", but readable without reading. Screen readers get one sentence instead of 14 seats.
 */
export function SeatMap({ label, capacity, taken, size = 'regular' }: Props) {
  const seats = Math.max(0, capacity);
  const filled = Math.min(Math.max(0, taken), seats);
  const free = seats - filled;
  const rows = Math.ceil(seats / PER_ROW);

  return (
    <figure
      className={`seatMap seatMap--${size}${free === 0 ? ' is-full' : ''}`}
      role="img"
      aria-label={`${label}: ${filled} من ${seats} مقعد مشغول${free === 0 ? '، الباص ممتلئ' : `، متبقي ${free}`}`}
    >
      <figcaption className="seatMap__head" aria-hidden="true">
        <span className="seatMap__label">{label}</span>
        <bdi className="seatMap__count" dir="ltr">
          {filled}
          <span className="seatMap__of">/ {seats}</span>
        </bdi>
      </figcaption>
      <div className="seatMap__bus" aria-hidden="true">
        <span className="seatMap__front" />
        {Array.from({ length: rows }, (_, r) => (
          <div className="seatMap__row" key={r}>
            {Array.from({ length: PER_ROW }, (_, c) => {
              const i = r * PER_ROW + c;
              if (i >= seats) return <span className="seatMap__gap" key={c} />;
              return <span key={c} className={`seat${i < filled ? ' is-taken' : ''}`} />;
            })}
          </div>
        ))}
      </div>
      <span className="seatMap__note" aria-hidden="true">
        {free === 0 ? 'ممتلئ' : `متبقي ${free}`}
      </span>
    </figure>
  );
}
