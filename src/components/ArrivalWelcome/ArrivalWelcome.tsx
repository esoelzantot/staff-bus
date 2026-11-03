import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BusTrip } from '../../types';
import { cairoMinutes, formatMinutes, isLate } from '../../utils/arrivals';
import { ArrivalBadge } from '../common/ArrivalBadge';
import { Modal } from '../common/Modal';

interface Props {
  /** Today's going trip (live). */
  trip: BusTrip | null;
  loading: boolean;
  /** The signed-in employee's name. */
  name: string;
}

/** A device shows the welcome once per trip – also after a reload in the same minute. */
const seenKey = (tripId: string) => `arrival-welcome:${tripId}`;

function alreadySeen(tripId: string): boolean {
  try {
    return localStorage.getItem(seenKey(tripId)) !== null;
  } catch {
    return false;
  }
}

function markSeen(tripId: string): void {
  try {
    localStorage.setItem(seenKey(tripId), '1');
  } catch {
    /* private mode – showing it twice is harmless */
  }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const PIECES = 14;

/**
 * "وصلنا! 🎉" – shown to everyone who has the app open at the moment somebody records the arrival (the trip goes from
 * "not arrived" to "arrived" while watching). Not shown when the app is opened after the arrival.
 */
export function ArrivalWelcome({ trip, loading, name }: Props) {
  const [shown, setShown] = useState<BusTrip | null>(null);
  /** What this screen saw before: 'unknown' until the first data, so an arrival from before never pops up. */
  const before = useRef<{ tripId: string | null; arrived: boolean } | null>(null);
  const arrived = Boolean(trip?.arrivalTime);
  const tripId = trip?.id ?? null;

  useEffect(() => {
    if (loading) return;
    const prev = before.current;
    // A trip that did not exist yet (null) and then is created already "arrived" counts as a change too.
    const sameDay = prev !== null && (prev.tripId === tripId || prev.tripId === null);
    if (trip && arrived && sameDay && !prev.arrived && !alreadySeen(trip.id)) {
      markSeen(trip.id);
      setShown(trip);
    }
    before.current = { tripId, arrived };
  }, [loading, tripId, arrived, trip]);

  if (!shown?.arrivalTime) return null;
  const minutes = cairoMinutes(shown.arrivalTime.toDate());
  const time = formatMinutes(minutes);
  const close = () => setShown(null);

  return (
    <Modal onClose={close}>
      <div className="dialog welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div className="welcome__confetti" aria-hidden="true">
          {Array.from({ length: PIECES }, (_, i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <img className="welcome__rabbit" src="/brand/rabbit.png" alt="" aria-hidden="true" width={287} height={398} />
        <h1 id="welcome-title">وصلنا! 🎉</h1>
        <p className="welcome__text">
          صباح الخير يا <bdi dir="auto">{firstName(name)}</bdi>، الباص وصل الساعة{' '}
          <strong className={`welcome__time${isLate(minutes) ? ' welcome__time--late' : ''}`}>
            <bdi>{time}</bdi>
          </strong>{' '}
          <ArrivalBadge minutes={minutes} />
        </p>
        {shown.arrivedByName && (
          <p className="welcome__by">
            سجّل الوصول: <bdi dir="auto">{shown.arrivedByName}</bdi>
          </p>
        )}
        <p className="welcome__wish">يوم سعيد وشغل موفّق 💪</p>
        <button type="button" className="btn btn--primary btn--xl" onClick={close} autoFocus>
          يلا بينا
        </button>
      </div>
    </Modal>
  );
}
