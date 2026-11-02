/** IN days of this month, e.g. "2 يوم" – next to "الذهاب" / "العودة" on a card. */
export function DaysChip({ count }: { count: number }) {
  const text = `أيام IN الشهر ده: ${count}`;
  return (
    <span className={`days${count === 0 ? ' days--zero' : ''}`} title={text} aria-label={text}>
      <bdi className="days__n">{count}</bdi> يوم
    </span>
  );
}
