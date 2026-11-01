import { isUuid, type Db } from "./client.js";
import { nextRecallStep } from "../domain/recall.js";
import { daysBetween, manilaDate } from "../domain/time.js";
import type { SendEvent } from "../send/pipeline.js";

/**
 * Today's recall steps for one rule: which contacts and assets are due a text, as send events.
 * Read-only. It proposes; every item still goes through prepareFromDb, which checks the step is
 * still due (checkRecallDue) and then runs the send gate (consent, mutes, caps, sync pause).
 * Inactive assets and contacts the clinic marked moved, deceased or do-not-contact are skipped.
 */
/**
 * Across cycles, for the same asset and service (G46, G50, R123): within this many days of a recall
 * text, no step at or before the furthest step already sent goes out (a corrected visit date never
 * walks the patient back from "due now" to "due soon").
 */
export const RECALL_STEP_COOLDOWN_DAYS = 30;
/** Across cycles, for the same asset and service: at least this many days between two recall texts. */
export const RECALL_MIN_GAP_DAYS = 7;

export type RecallEvent = Extract<SendEvent, { type: "recall" }>;

/**
 * The cycle a recall step was computed from. The send writer stores it on the sends row
 * (sends.cycle_visit_on, sends.service_category_id); the database checks it against the rule.
 */
export interface RecallCycle {
  visitOn: string;            // YYYY-MM-DD, the last visit the due date was counted from
  serviceCategoryId: string;  // the rule's service
}

export interface RecallItem {
  contactId: string;
  assetId: string;
  cycle: RecallCycle;
  event: RecallEvent;
}

export type RecallQueueResult =
  | { ok: true; items: RecallItem[] }
  | { ok: false; reason: "rule_not_found" | "rule_not_active" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface RuleRow { service_category_id: string; interval_days: number; step_offsets_days: (number | null)[]; active: boolean; approved_by: string | null }

async function loadRule(db: Db, clinicId: string, ruleId: string): Promise<RuleRow | "rule_not_found" | "rule_not_active"> {
  if (!isUuid(clinicId) || !isUuid(ruleId)) return "rule_not_found";
  const [r] = (await db.query<RuleRow>(
    `select service_category_id, interval_days, step_offsets_days, active, approved_by from recall_rules where clinic_id = $1 and id = $2`,
    [clinicId, ruleId])).rows;
  if (!r) return "rule_not_found";
  if (!r.active || !r.approved_by?.trim()) return "rule_not_active";
  return r;
}

/**
 * Works out the due step for each matching asset straight from the database. `assetId` narrows it to
 * one asset (the send-time recheck). Shared by the queue and the recheck so both always agree.
 */
async function dueSteps(db: Db, clinicId: string, ruleId: string, r: RuleRow, now: Date, assetId: string | null): Promise<RecallItem[]> {
  const today = manilaDate(now);
  // Last visit for the rule's service: a visit row, or a completed appointment for that service
  // (Manila date) that the next sync has not brought in yet. A booked or confirmed appointment for
  // ANY service on the asset from the start of today (Manila) onward stops the recall: a booking
  // earlier today that sync has not yet marked completed means the patient was just seen (R99).
  const assets = (await db.query<{ asset_id: string; contact_id: string; last_visit: string | null; booked: boolean }>(
    `select a.id as asset_id, a.contact_id,
            (select to_char(max(d), 'YYYY-MM-DD') from (
               select v.visited_on as d from visits v
                where v.clinic_id = $1 and v.asset_id = a.id and v.service_category_id = $2
               union all
               select (ap.starts_at at time zone 'Asia/Manila')::date from appointments ap
                where ap.clinic_id = $1 and ap.asset_id = a.id and ap.service_category_id = $2 and ap.status = 'completed'
             ) x) as last_visit,
            exists (select 1 from appointments ap
                     where ap.clinic_id = $1 and ap.asset_id = a.id and ap.status in ('booked', 'confirmed')
                       and (ap.starts_at at time zone 'Asia/Manila')::date >= $3::date) as booked
       from assets a join contacts c on c.clinic_id = a.clinic_id and c.id = a.contact_id
      where a.clinic_id = $1 and a.active and c.status = 'active' and ($4::uuid is null or a.id = $4::uuid)
      order by a.contact_id, a.id`,
    [clinicId, r.service_category_id, today, assetId])).rows;

  // Recall sends for this service on these assets, with the cycle each one recorded when it was
  // written (migration 006: the visit the step was computed from, and the rule's service, which can
  // never change). Sends under ANY rule for the service count, so a replaced rule never restarts a
  // sequence (R107). Failed sends count too, as in the gate.
  const sends = (await db.query<{ asset_id: string; step_offset_days: number; cycle_visit_on: string; sent_on: string }>(
    `select s.asset_id, s.step_offset_days, to_char(s.cycle_visit_on, 'YYYY-MM-DD') as cycle_visit_on,
            to_char(s.sent_at at time zone 'Asia/Manila', 'YYYY-MM-DD') as sent_on
       from sends s
      where s.clinic_id = $1 and s.kind = 'recall' and s.asset_id is not null and s.service_category_id = $2
        and ($3::uuid is null or s.asset_id = $3::uuid)`,
    [clinicId, r.service_category_id, assetId])).rows;

  // A NULL inside step_offsets_days would make an unloggable event; such entries are ignored (R103).
  // A step on or before the visit day itself (interval + offset <= 0) could never be counted as sent
  // in this cycle, so it is ignored (R109).
  const steps = r.step_offsets_days.filter((n): n is number => Number.isInteger(n) && r.interval_days + (n as number) > 0);
  const rule = { serviceCategory: r.service_category_id, intervalDays: r.interval_days, stepOffsetsDays: steps };
  const items: RecallItem[] = [];
  for (const a of assets) {
    if (!a.last_visit) continue;
    if (!ISO_DATE.test(a.last_visit)) throw new Error("Visit date is not YYYY-MM-DD");
    // A send belongs to this cycle only if it recorded this exact last visit (R106, R111, G44).
    // No date comparison: a late-synced visit, earlier or later than the old texts, starts a cycle
    // that none of the old texts belong to.
    const mine = sends.filter((s) => s.asset_id === a.asset_id);
    const sent = mine.filter((s) => s.cycle_visit_on === a.last_visit).map((s) => s.step_offset_days);
    const d = nextRecallStep({ rule, lastVisitOn: a.last_visit, hasUpcomingAppointment: a.booked, stepsAlreadySent: sent }, today);
    if (d.action !== "send") continue;
    // G46, G50, R123: a corrected visit date starts a new cycle, which could send a text right after
    // the one the patient just got, or step back from "due now" to "due soon". Whatever cycle the
    // recent texts belonged to: none within RECALL_MIN_GAP_DAYS, and within RECALL_STEP_COOLDOWN_DAYS
    // no step at or before the furthest one sent. Only ever fewer texts.
    const offset = d.stepOffsetDays;
    const ago = (s: { sent_on: string }) => daysBetween(s.sent_on, today);
    if (mine.some((s) => ago(s) < RECALL_MIN_GAP_DAYS)) continue;
    if (mine.some((s) => ago(s) < RECALL_STEP_COOLDOWN_DAYS && s.step_offset_days >= offset)) continue;
    items.push({
      contactId: a.contact_id, assetId: a.asset_id,
      cycle: { visitOn: a.last_visit, serviceCategoryId: r.service_category_id },
      event: { type: "recall", assetId: a.asset_id, ruleId, dueOn: d.dueOn, stepOffsetDays: d.stepOffsetDays },
    });
  }
  return items;
}

/** The queue and the send-time recheck share dueSteps and RECALL_GRACE_DAYS, so they always agree (R108, R115). */
export async function loadRecallQueue(db: Db, clinicId: string, ruleId: string, now: Date): Promise<RecallQueueResult> {
  const r = await loadRule(db, clinicId, ruleId);
  if (typeof r === "string") return { ok: false, reason: r };
  return { ok: true, items: await dueSteps(db, clinicId, ruleId, r, now, null) };
}

/**
 * Send-time recheck (R97, G37): a recall event is sendable only if the database, right now, gives
 * exactly this step for this asset and rule. A queued event that went stale (the patient booked, a
 * visit came in, the rule changed) or a hand-built one with another due date is refused.
 * Returns the cycle to store with the send, or null when the step is not due.
 */
export async function checkRecallDue(db: Db, clinicId: string, contactId: string, event: RecallEvent, now: Date): Promise<RecallCycle | null> {
  if (!isUuid(event?.assetId)) return null;
  const r = await loadRule(db, clinicId, event.ruleId);
  if (typeof r === "string") return null;
  const [due] = await dueSteps(db, clinicId, event.ruleId, r, now, event.assetId);
  const same = !!due && due.contactId === contactId && due.event.dueOn === event.dueOn && due.event.stepOffsetDays === event.stepOffsetDays;
  return same ? due.cycle : null;
}
