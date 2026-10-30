import { addDays, daysBetween, manilaDate, manilaHour, manilaInstant } from "./time.js";

export type SendKind = "reminder" | "recall" | "marketing" | "feedback";

export interface PastSend {
  kind: SendKind;
  campaignId: string | null;
  sentAt: Date;
}

export interface ContactState {
  status: "active" | "moved" | "deceased" | "do_not_contact";
  muted: boolean;
  hasMobile: boolean;
  /** Latest consent per purpose; undefined = never recorded. */
  consent: { service?: boolean; marketing?: boolean };
  lastVisitOn: string | null;
  pastSends: PastSend[];
}

export interface ClinicPolicy {
  marketingCapPer30d: number;        // default 2
  quietStartHour: number;            // default 20 (8pm)
  quietEndHour: number;              // default 8 (8am)
  syncHealthy: boolean;              // from sync health check
}

export interface SendRequest {
  kind: SendKind;
  campaignId: string | null;
  automated: boolean;                // true for automations and scheduled campaigns
  now: Date;
}

export type Eligibility =
  | { ok: true }
  | { ok: false; reason: BlockReason }
  | { ok: false; reason: "quiet_hours"; deferUntil: Date };

export type BlockReason =
  | "inactive_status" | "muted" | "no_mobile" | "service_opted_out" | "no_marketing_consent"
  | "duplicate_campaign" | "marketing_cap" | "recent_visit" | "same_day_collision" | "sync_stale";

export const DEFAULT_POLICY: Omit<ClinicPolicy, "syncHealthy"> = {
  marketingCapPer30d: 2,
  quietStartHour: 20,
  quietEndHour: 8,
};

/**
 * The single gate every outgoing text passes through. Order matters: hard blocks first,
 * then marketing rules, then timing. Quiet hours defer instead of block.
 */
export function checkEligibility(c: ContactState, p: ClinicPolicy, r: SendRequest): Eligibility {
  if (c.status !== "active") return { ok: false, reason: "inactive_status" };
  if (c.muted) return { ok: false, reason: "muted" };
  if (!c.hasMobile) return { ok: false, reason: "no_mobile" };
  if (r.automated && !p.syncHealthy) return { ok: false, reason: "sync_stale" };

  if (r.kind === "marketing") {
    if (c.consent.marketing !== true) return { ok: false, reason: "no_marketing_consent" };
  } else if (c.consent.service === false) {
    return { ok: false, reason: "service_opted_out" };
  }

  if (r.campaignId && c.pastSends.some((s) => s.campaignId === r.campaignId)) {
    return { ok: false, reason: "duplicate_campaign" };
  }

  const today = manilaDate(r.now);

  if (r.kind === "marketing") {
    const windowStart = addDays(today, -29);
    const recentMarketing = c.pastSends.filter(
      (s) => s.kind === "marketing" && manilaDate(s.sentAt) >= windowStart,
    ).length;
    if (recentMarketing >= p.marketingCapPer30d) return { ok: false, reason: "marketing_cap" };
    if (c.lastVisitOn && daysBetween(c.lastVisitOn, today) < 7) return { ok: false, reason: "recent_visit" };
  }

  // A recall and a marketing text never land on the same Manila day.
  if (r.kind === "marketing" || r.kind === "recall") {
    const other: SendKind = r.kind === "marketing" ? "recall" : "marketing";
    if (c.pastSends.some((s) => s.kind === other && manilaDate(s.sentAt) === today)) {
      return { ok: false, reason: "same_day_collision" };
    }
  }

  const hour = manilaHour(r.now);
  if (hour >= p.quietStartHour || hour < p.quietEndHour) {
    const deferDate = hour >= p.quietStartHour ? addDays(today, 1) : today;
    return { ok: false, reason: "quiet_hours", deferUntil: manilaInstant(deferDate, p.quietEndHour) };
  }
  return { ok: true };
}
