import { FiBriefcase, FiHome } from 'react-icons/fi';
import type { TripType } from '../../types';

/** Going = to work, Returning = home. */
export function TripIcon({ trip }: { trip: TripType }) {
  return trip === 'going' ? <FiBriefcase aria-hidden="true" /> : <FiHome aria-hidden="true" />;
}

export const TRIP_LABEL: Record<TripType, string> = { going: 'الذهاب', returning: 'العودة' };

/** The short form used on the compact read-only chips. */
export const TRIP_SHORT: Record<TripType, string> = { going: 'ذهاب', returning: 'عودة' };
