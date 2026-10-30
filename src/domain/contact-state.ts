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
    const prev = at[r.purpose];
    if (prev === undefined || t > prev || (t === prev && !r.granted)) {
      at[r.purpose] = t;
      out[r.purpose] = r.granted;
    }
  }
  return out;
}

/**
 * Latest visit as a Manila date. A completed appointment counts as a visit, so "no marketing within
 * 7 days after a visit" holds before the next sync brings the visit row in.
 */
export function latestVisit(visitDates: (string | null)[], completedAppointments: (Date | null)[]): string | null {
  const dates = [...visitDates, ...completedAppointments.map((d) => (d ? manilaDate(d) : null))]
    .filter((d): d is string => !!d);
  return dates.length ? dates.reduce((a, b) => (b > a ? b : a)) : null;
}
