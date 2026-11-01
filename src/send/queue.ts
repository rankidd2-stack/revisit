import type { ClinicPolicy, ContactState, PastSend } from "../domain/eligibility.js";
import { nextRecallStep, type RecallRule } from "../domain/recall.js";
import { addDays, manilaDate } from "../domain/time.js";
import { smsCostCentavos } from "../domain/sms.js";
import { prepareSms, type ClinicSendProfile, type PrepareResult, type PreparedSms, type Subject } from "./pipeline.js";

/**
 * The daily autopilot queue: every recall step due today, run through the real send pipeline, so
 * the clinic sees exactly what would go out and exactly why anything is held back. Nothing here
 * sends; approving the queue is a separate, human step (locked decision 12).
 */

export interface QueueRule extends RecallRule {
  id: string;
  template: string;      // approved wording
  approvedBy: string;    // who approved the rule; an unapproved rule proposes nothing
}

export interface QueueAsset {
  id: string;
  kind: Subject;                          // assets.kind
  label: string;                          // "Self", "Bantay", "Mika (daughter)"
  active: boolean;
  visits: { serviceCategory: string; on: string }[];
  upcomingAppointment: boolean;
  /** Recall steps already sent per rule id and cycle due date: `${ruleId}:${dueOn}` -> offsets. */
  stepsSent: Record<string, number[]>;
}

export interface QueueContact {
  id: string;
  fullName: string;
  mobile: string | null;
  status: ContactState["status"];
  muted: boolean;
  consent: ContactState["consent"];
  pastSends: PastSend[];
  sentEventKeys: string[];
  assets: QueueAsset[];
}

export interface QueueInput {
  clinic: ClinicSendProfile;
  policy: ClinicPolicy;
  rules: QueueRule[];
  contacts: QueueContact[];
  stopLinkHost: string;
  stopUrl: (contactId: string) => string;
  centavosPerSegment?: number;
}

export type QueueStatus = "ready" | "later_today" | "next_day" | "held";

export interface QueueItem {
  contactId: string;
  contactName: string;
  assetId: string;
  assetLabel: string;
  subject: Subject;
  ruleId: string;
  serviceCategory: string;
  dueOn: string;
  stepOffsetDays: number;
  stepIndex: number;
  status: QueueStatus;
  sms: PreparedSms | null;      // set when ready
  /** Why it is not ready: a pipeline reason, or "one_recall_per_day" for a second asset of the same contact. */
  heldReason: HeldReason | null;
  deferUntil: Date | null;
  costCentavos: number;
}

export interface DailyQueue {
  date: string;                  // Manila date
  items: QueueItem[];            // ready first, then later today, next day, held
  ready: number;
  segments: number;              // across ready texts
  costCentavos: number;          // across ready texts
}

const ORDER: Record<QueueStatus, number> = { ready: 0, later_today: 1, next_day: 2, held: 3 };

function lastVisit(asset: QueueAsset, serviceCategory: string): string | null {
  const key = serviceCategory.toLowerCase();
  let latest: string | null = null;
  for (const v of asset.visits) if (v.serviceCategory.toLowerCase() === key && (!latest || v.on > latest)) latest = v.on;
  return latest;
}

/** The contact's last visit of any kind, for the 7-day marketing rule the gate reads. */
function anyLastVisit(c: QueueContact): string | null {
  let latest: string | null = null;
  for (const a of c.assets) for (const v of a.visits) if (!latest || v.on > latest) latest = v.on;
  return latest;
}

interface Candidate { base: Omit<QueueItem, "status" | "sms" | "heldReason" | "deferUntil" | "costCentavos">; result: PrepareResult; slot: string; stepOn: string }

/**
 * Queue texts are previews. A `PreparedSms` here reflects the moment the queue was built; the send
 * step must prepare every text again at send time, so mutes, sync and quiet hours are current.
 */
export function proposeDailyQueue(input: QueueInput, now: Date): DailyQueue {
  const today = manilaDate(now);
  const rules = input.rules.filter((r) => r.approvedBy.trim() !== "");
  const candidates: Candidate[] = [];

  for (const c of input.contacts) {
    const state = {
      status: c.status, muted: c.muted, hasMobile: !!c.mobile, consent: c.consent,
      lastVisitOn: anyLastVisit(c), pastSends: c.pastSends, mobile: c.mobile,
    };
    for (const asset of c.assets) {
      if (!asset.active) continue;
      for (const rule of rules) {
        const last = lastVisit(asset, rule.serviceCategory);
        if (!last) continue;
        const decision = nextRecallStep({
          rule, lastVisitOn: last, hasUpcomingAppointment: asset.upcomingAppointment,
          stepsAlreadySent: asset.stepsSent[`${rule.id}:${addDays(last, rule.intervalDays)}`] ?? [],
        }, today);
        if (decision.action !== "send") continue;

        const prepare = (at: Date) => prepareSms({
          clinic: input.clinic, contact: state, policy: input.policy, now: at,
          approval: { type: "automation", automationId: `recall-rule:${rule.id}`, approvedBy: rule.approvedBy, template: rule.template },
          event: { type: "recall", assetId: asset.id, ruleId: rule.id, dueOn: decision.dueOn, stepOffsetDays: decision.stepOffsetDays },
          subject: asset.kind,
          sentEventKeys: new Set(c.sentEventKeys),
          names: { contact: c.fullName, asset: asset.kind === "self" ? null : asset.label },
          stopUrl: input.stopUrl(c.id), stopLinkHost: input.stopLinkHost,
        });
        let result = prepare(now);
        // The gate checks quiet hours before the rest, so look again at the time the text would go:
        // a text that will be refused then is held now, not promised for later.
        if (!result.ok && result.reason === "quiet_hours" && result.deferUntil) {
          const later = prepare(result.deferUntil);
          if (!later.ok) result = later;
        }
        candidates.push({
          base: {
            contactId: c.id, contactName: c.fullName, assetId: asset.id, assetLabel: asset.label, subject: asset.kind,
            ruleId: rule.id, serviceCategory: rule.serviceCategory, dueOn: decision.dueOn,
            stepOffsetDays: decision.stepOffsetDays, stepIndex: decision.stepIndex,
          },
          result,
          slot: c.mobile ?? `contact:${c.id}`,
          stepOn: addDays(decision.dueOn, decision.stepOffsetDays),
        });
      }
    }
  }

  // One recall text per mobile per day. The slot goes to the step that has waited longest (closest to
  // dropping out of the grace window); the others wait for tomorrow's queue.
  const goes = (r: PrepareResult) => r.ok || r.reason === "quiet_hours";
  const order = [...candidates].sort((a, b) => a.stepOn.localeCompare(b.stepOn) || a.base.contactId.localeCompare(b.base.contactId)
    || a.base.assetId.localeCompare(b.base.assetId) || a.base.ruleId.localeCompare(b.base.ruleId));
  const taken = new Set<string>();
  const items: QueueItem[] = [];
  for (const { base, result, slot } of order) {
    if (goes(result) && taken.has(slot)) {
      items.push({ ...base, status: "next_day", sms: null, heldReason: "one_recall_per_day", deferUntil: null, costCentavos: 0 });
      continue;
    }
    if (result.ok) {
      taken.add(slot);
      items.push({ ...base, status: "ready", sms: result.sms, heldReason: null, deferUntil: null,
        costCentavos: smsCostCentavos(result.sms.body, input.centavosPerSegment) });
    } else if (result.reason === "quiet_hours") {
      taken.add(slot);
      const later = result.deferUntil && manilaDate(result.deferUntil) === today;
      items.push({ ...base, status: later ? "later_today" : "next_day", sms: null, heldReason: "quiet_hours",
        deferUntil: result.deferUntil ?? null, costCentavos: 0 });
    } else {
      items.push({ ...base, status: "held", sms: null, heldReason: result.reason, deferUntil: null, costCentavos: 0 });
    }
  }

  items.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.dueOn.localeCompare(b.dueOn) || a.contactName.localeCompare(b.contactName));
  const ready = items.filter((i) => i.status === "ready");
  return {
    date: today,
    items,
    ready: ready.length,
    segments: ready.reduce((n, i) => n + (i.sms?.segments ?? 0), 0),
    costCentavos: ready.reduce((n, i) => n + i.costCentavos, 0),
  };
}

export type HeldReason = Extract<PrepareResult, { ok: false }>["reason"] | "one_recall_per_day";

/** Plain words for every reason a text is held back, for the console. Typed so a new reason can't go unexplained. */
export const HELD_REASON_TEXT: Record<HeldReason, string> = {
  one_recall_per_day: "One recall text per person per day. This one goes tomorrow.",
  quiet_hours: "Quiet hours. Waits until the morning.",
  inactive_status: "Marked moved, deceased or do not contact.",
  muted: "Asked to stop texts.",
  no_mobile: "No mobile number on file.",
  bad_mobile: "Mobile number is not a valid PH mobile.",
  service_opted_out: "Opted out of reminders.",
  no_marketing_consent: "No marketing opt-in.",
  duplicate_campaign: "Already got this campaign.",
  marketing_cap: "Reached 2 marketing texts in 30 days.",
  recent_visit: "Visited in the last 7 days.",
  same_day_collision: "Already got a marketing text today.",
  daily_recall_cap: "Already got a recall text today.",
  sync_stale: "Patient list is out of date. Texts pause until it syncs.",
  already_sent: "Already sent.",
  not_approved: "Recall wording not approved yet.",
  sender_not_approved: "Sender name not approved yet.",
  no_reply_path: "Add a reply number, Messenger link or email first.",
  bad_stop_link: "Stop link is not set up.",
  missing_variable: "A name is missing for this text.",
  bad_template: "The wording uses an unknown placeholder.",
  clinic_name_unconfirmed: "Clinic name needs a one-time confirmation.",
  clinic_name_about_dependent: "Clinic name can't go in a text about a family member.",
  content: "Wording names a treatment or breaks a texting rule.",
};
