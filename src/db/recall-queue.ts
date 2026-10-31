import { isUuid, type Db } from "./client.js";
import { nextRecallStep } from "../domain/recall.js";
import { addDays, manilaDate } from "../domain/time.js";
import type { SendEvent } from "../send/pipeline.js";

/**
 * Today's recall steps for one rule: which contacts and assets are due a text, as send events.
 * Read-only. It proposes; every item still goes through prepareSms (consent, mutes, caps, sync pause).
 * Inactive assets and contacts the clinic marked moved, deceased or do-not-contact are skipped here.
 */
export interface RecallItem {
  contactId: string;
  assetId: string;
  event: Extract<SendEvent, { type: "recall" }>;
}

export type RecallQueueResult =
  | { ok: true; items: RecallItem[] }
  | { ok: false; reason: "rule_not_found" | "rule_not_active" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function loadRecallQueue(db: Db, clinicId: string, ruleId: string, now: Date, graceDays?: number): Promise<RecallQueueResult> {
  if (!isUuid(clinicId) || !isUuid(ruleId)) return { ok: false, reason: "rule_not_found" };
  const [r] = (await db.query<{ service_category_id: string; interval_days: number; step_offsets_days: number[]; active: boolean; approved_by: string | null }>(
    `select service_category_id, interval_days, step_offsets_days, active, approved_by from recall_rules where clinic_id = $1 and id = $2`,
    [clinicId, ruleId])).rows;
  if (!r) return { ok: false, reason: "rule_not_found" };
  if (!r.active || !r.approved_by?.trim()) return { ok: false, reason: "rule_not_active" };

  // Last visit for the rule's service: a visit row, or a completed appointment for that service
  // (Manila date) that the next sync has not brought in yet. An upcoming booking for ANY service on
  // the asset stops the recall: the clinic sees the patient soon anyway, and it errs toward fewer texts.
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
                     where ap.clinic_id = $1 and ap.asset_id = a.id and ap.status in ('booked', 'confirmed') and ap.starts_at > $3) as booked
       from assets a join contacts c on c.clinic_id = a.clinic_id and c.id = a.contact_id
      where a.clinic_id = $1 and a.active and c.status = 'active'
      order by a.contact_id, a.id`,
    [clinicId, r.service_category_id, now.toISOString()])).rows;

  // Steps already logged for this rule, from the event keys the sends table keeps unique:
  // recall:<asset>:<rule>:<dueOn>:<offset>. Failed sends count too (the gate does the same).
  const sent = new Map<string, number[]>();
  const keys = (await db.query<{ event_key: string }>(
    `select event_key from sends where clinic_id = $1 and kind = 'recall' and split_part(event_key, ':', 3) = $2`,
    [clinicId, ruleId])).rows;
  for (const { event_key } of keys) {
    const [, assetId, , dueOn, offset] = event_key.split(":");
    const n = Number(offset);
    if (!assetId || !dueOn || !Number.isInteger(n)) continue;
    const k = `${assetId}|${dueOn}`;
    sent.set(k, [...(sent.get(k) ?? []), n]);
  }

  const today = manilaDate(now);
  const rule = { serviceCategory: r.service_category_id, intervalDays: r.interval_days, stepOffsetsDays: r.step_offsets_days };
  const items: RecallItem[] = [];
  for (const a of assets) {
    if (!a.last_visit) continue;
    if (!ISO_DATE.test(a.last_visit)) throw new Error("Visit date is not YYYY-MM-DD");
    const dueOn = addDays(a.last_visit, r.interval_days);
    const d = nextRecallStep({
      rule, lastVisitOn: a.last_visit, hasUpcomingAppointment: a.booked,
      stepsAlreadySent: sent.get(`${a.asset_id}|${dueOn}`) ?? [], graceDays,
    }, today);
    if (d.action !== "send") continue;
    items.push({
      contactId: a.contact_id, assetId: a.asset_id,
      event: { type: "recall", assetId: a.asset_id, ruleId, dueOn: d.dueOn, stepOffsetDays: d.stepOffsetDays },
    });
  }
  return { ok: true, items };
}
