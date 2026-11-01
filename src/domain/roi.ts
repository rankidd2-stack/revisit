import { addDays, manilaDate } from "./time.js";

export interface SentText { contactId: string; sentAt: Date; kind: "reminder" | "recall" | "marketing" | "feedback" }
export interface Booking { contactId: string; on: string; valueCentavos: number }   // on = YYYY-MM-DD, Manila

export interface Recovered { bookings: number; valueCentavos: number }

/**
 * The money number: bookings this Manila month that followed a recall or marketing text to the same
 * person within `windowDays` (default 30). Reminders and feedback texts never count: they follow a
 * booking, they don't win one. A booking counts once, however many texts came before it. Bookings are
 * dates, so one on the day of the text counts; one on an earlier day never does.
 */
export function recoveredInMonth(texts: SentText[], bookings: Booking[], month: string, windowDays = 30): Recovered {
  const byContact = new Map<string, string[]>();
  for (const t of texts) {
    if (t.kind !== "recall" && t.kind !== "marketing") continue;
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
