import { manilaDate } from "./time.js";

export interface ConsentRecord {
  purpose: "service" | "marketing" | "testimonial";
  granted: boolean;
  recordedAt: Date;
  /** false = left behind by an erased contact and matched on the same number or email. */
  linked: boolean;
}

/**
 * Latest consent per purpose, as the send gate needs it. The ledger is append-only, so the newest
 * row wins, and on a tie the opt-out wins. Rows left behind by an erased contact can only take
 * consent away: an opt-out survives erasure and re-import, an opt-in never passes to a new contact.
 */
export function latestConsent(records: ConsentRecord[]): { service?: boolean; marketing?: boolean } {
  const out: { service?: boolean; marketing?: boolean } = {};
  const at: { service?: number; marketing?: number } = {};
  for (const r of records) {
    if (r.purpose === "testimonial" || (!r.linked && r.granted)) continue;
    const t = r.recordedAt.getTime();
    if (Number.isNaN(t)) throw new Error("Consent record without a valid time");
    const prev = at[r.purpose];
    if (prev === undefined || t > prev || (t === prev && !r.granted)) {
      at[r.purpose] = t;
      out[r.purpose] = r.granted;
    }
  }
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Latest visit as a Manila date. A completed appointment counts as a visit, so "no marketing within
 * 7 days after a visit" holds before the next sync brings the visit row in.
 */
export function latestVisit(visitDates: (string | null)[], completedAppointments: (Date | null)[]): string | null {
  const dates = [...visitDates, ...completedAppointments.map((d) => (d ? manilaDate(d) : null))]
    .filter((d): d is string => !!d);
  // A date in another format would compare wrongly as text and turn the 7-day rule into NaN.
  if (dates.some((d) => !ISO_DATE.test(d))) throw new Error("Visit date is not YYYY-MM-DD");
  return dates.length ? dates.reduce((a, b) => (b > a ? b : a)) : null;
}
