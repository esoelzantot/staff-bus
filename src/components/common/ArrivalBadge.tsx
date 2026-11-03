import { isLate } from '../../utils/arrivals';

/** "بدري" (arrived by 9:00) or "متأخر" (after 9:00) next to an arrival time. */
export function ArrivalBadge({ minutes }: { minutes: number }) {
  const late = isLate(minutes);
  return (
    <span
      className={`arrivalBadge arrivalBadge--${late ? 'late' : 'early'}`}
      title={late ? 'وصل بعد الساعة 9:00 الصبح' : 'وصل قبل الساعة 9:00 الصبح'}
    >
      {late ? 'متأخر' : 'بدري'}
    </span>
  );
}
