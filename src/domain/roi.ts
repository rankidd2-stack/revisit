import { addDays, manilaDate } from "./time.js";

export interface SentText { contactId: string; sentAt: Date }
export interface Booking { contactId: string; on: string; valueCentavos: number }   // on = YYYY-MM-DD, Manila

export interface Recovered { bookings: number; valueCentavos: number }

/**
 * The money number: bookings this Manila month that followed a text to the same person within
 * `windowDays` (default 30). A booking counts once, however many texts came before it. A booking
 * on the day of the text counts; one before the text never does.
 */
export function recoveredInMonth(texts: SentText[], bookings: Booking[], month: string, windowDays = 30): Recovered {
  const byContact = new Map<string, string[]>();
  for (const t of texts) {
    const day = manilaDate(t.sentAt);
    byContact.set(t.contactId, [...(byContact.get(t.contactId) ?? []), day]);
  }
  let count = 0;
  let value = 0;
  for (const b of bookings) {
    if (b.on.slice(0, 7) !== month) continue;
    const days = byContact.get(b.contactId) ?? [];
    if (days.some((d) => d <= b.on && b.on <= addDays(d, windowDays))) {
      count++;
      value += b.valueCentavos;
    }
  }
  return { bookings: count, valueCentavos: value };
}
