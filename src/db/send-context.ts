import { asDate, isUuid, type Db } from "./client.js";
import { DEFAULT_POLICY, type ClinicPolicy, type ContactState, type SendKind } from "../domain/eligibility.js";
import { latestConsent, latestVisit } from "../domain/contact-state.js";
import { syncHealth, type SyncHealth } from "../sync/health.js";
import type { Approval, ClinicSendProfile } from "../send/pipeline.js";

/**
 * Reads everything the send pipeline needs from Postgres. Read-only: nothing here writes, sends
 * or changes state. Every query is bound to the clinic, so one clinic can never load another's data.
 */

export interface ClinicContext {
  clinicId: string;
  profile: ClinicSendProfile;
  policy: ClinicPolicy;
  sync: SyncHealth;
}

export type ClinicContextResult =
  | { ok: true; clinic: ClinicContext }
  | { ok: false; reason: "clinic_not_found" | "unsupported_timezone" };

interface ClinicRow {
  name: string;
  display_name_confirmed_by: string | null;
  vertical: ClinicSendProfile["vertical"];
  sender_name: string | null;
  sender_name_status: "none" | "pending" | "approved";
  reply_phone: string | null;
  reply_email: string | null;
  messenger_url: string | null;
  timezone: string;
  name_treatments_in_sms: boolean;
  marketing_cap_per_30d: number;
  sync_stale_after_hours: number;
}

/** Timestamps are read as epoch milliseconds, so their format never depends on the session's DateStyle. */
const ms = (col: string, as: string) => `(extract(epoch from ${col}) * 1000)::float8 as ${as}`;

/** The send gate does its time math in Asia/Manila only. */
const SUPPORTED_TIMEZONE = "Asia/Manila";
/** A clinic may tighten the staleness pause, never switch it off (locked decision 10). */
const MAX_STALE_HOURS = 72;

export async function loadClinicContext(db: Db, clinicId: string, now: Date): Promise<ClinicContextResult> {
  if (!isUuid(clinicId)) return { ok: false, reason: "clinic_not_found" };
  const [c] = (await db.query<ClinicRow>(
    `select name, display_name_confirmed_by, vertical, sender_name, sender_name_status, reply_phone, reply_email, messenger_url, timezone,
            name_treatments_in_sms, marketing_cap_per_30d, sync_stale_after_hours
       from clinics where id = $1`, [clinicId])).rows;
  if (!c) return { ok: false, reason: "clinic_not_found" };
  // A clinic in another time zone would get quiet hours and same-day rules on Manila's clock.
  if (c.timezone !== SUPPORTED_TIMEZONE) return { ok: false, reason: "unsupported_timezone" };

  const categories = (await db.query<{ name: string }>(
    `select name from service_categories where clinic_id = $1 order by name`, [clinicId])).rows;
  // syncHealth only needs the latest finished run and the latest good one. On a tie the failed run
  // counts as the latest, so a tie never reads as healthy.
  const runs = (await db.query<{ finished_at: number; ok: boolean | null }>(
    `(select ${ms("finished_at", "finished_at")}, ok from sync_runs where clinic_id = $1 and finished_at is not null order by finished_at desc, ok asc nulls first limit 1)
     union all
     (select ${ms("finished_at", "finished_at")}, ok from sync_runs where clinic_id = $1 and finished_at is not null and ok order by finished_at desc limit 1)`,
    [clinicId])).rows;
  const sync = syncHealth(runs.map((r) => ({ finishedAt: asDate(r.finished_at), ok: r.ok })), now,
    Math.min(Math.max(c.sync_stale_after_hours, 1), MAX_STALE_HOURS));

  return {
    ok: true,
    clinic: {
      clinicId,
      profile: {
        vertical: c.vertical,
        senderName: c.sender_name,
        senderNameApproved: c.sender_name_status === "approved",
        nameTreatmentsAllowed: c.name_treatments_in_sms,
        displayName: c.name,
        displayNameConfirmedBy: c.display_name_confirmed_by,
        replyPhone: c.reply_phone,
        replyEmail: c.reply_email,
        messengerUrl: c.messenger_url,
        serviceCategories: categories.map((r) => r.name),
      },
      policy: { ...DEFAULT_POLICY, marketingCapPer30d: c.marketing_cap_per_30d, syncHealthy: sync.healthy },
      sync,
    },
  };
}

export interface LoadedContact {
  contact: ContactState & { mobile: string | null; email: string | null };
  /** Every event key already logged for this contact; prepareSms refuses these. */
  sentEventKeys: Set<string>;
}

export type ContactResult = ({ ok: true } & LoadedContact) | { ok: false; reason: "contact_not_found" };

export async function loadContact(db: Db, clinicId: string, contactId: string): Promise<ContactResult> {
  if (!isUuid(clinicId) || !isUuid(contactId)) return { ok: false, reason: "contact_not_found" };
  const [c] = (await db.query<{ status: ContactState["status"]; mobile: string | null; email: string | null }>(
    `select status, mobile, email from contacts where clinic_id = $1 and id = $2`, [clinicId, contactId])).rows;
  if (!c) return { ok: false, reason: "contact_not_found" };

  // A mute on either the number or the email stops texts: reasons like "deceased" or "moved" are
  // about the person, and a stop click is read as "stop", not "stop this channel only".
  const muted = (await db.query(
    `select 1 from mutes where clinic_id = $1 and ((kind = 'mobile' and value = $2) or (kind = 'email' and value = $3)) limit 1`,
    [clinicId, c.mobile, c.email])).rows.length > 0;

  // Opt-outs left behind by an erased contact with the same number or email still count.
  const consentRows = (await db.query<{ purpose: "service" | "marketing"; granted: boolean; recorded_at: number; linked: boolean }>(
    `select purpose, granted, ${ms("recorded_at", "recorded_at")}, contact_id is not null as linked
       from consent_events
      where clinic_id = $1 and purpose in ('service', 'marketing')
        and (contact_id = $2
             or (contact_id is null and not granted and (mobile_snapshot = $3 or lower(email_snapshot) = $4)))`,
    [clinicId, contactId, c.mobile, c.email])).rows;

  // Visits by any of the contact's assets (self, pets, dependents) count, including inactive ones.
  // to_char, not ::text, so the date format never depends on the session's DateStyle.
  const [v] = (await db.query<{ last_visit: string | null; last_completed: number | null }>(
    `select (select to_char(max(v.visited_on), 'YYYY-MM-DD') from visits v join assets a on a.clinic_id = v.clinic_id and a.id = v.asset_id
              where v.clinic_id = $1 and a.contact_id = $2) as last_visit,
            (select ${ms("max(ap.starts_at)", "m")} from appointments ap join assets a on a.clinic_id = ap.clinic_id and a.id = ap.asset_id
              where ap.clinic_id = $1 and a.contact_id = $2 and ap.status = 'completed') as last_completed`,
    [clinicId, contactId])).rows;

  // Every logged send counts toward caps and same-day rules, failed ones too: a failed status
  // doesn't prove the text never arrived, so we err toward fewer texts.
  const sends = (await db.query<{ kind: SendKind; campaign_id: string | null; sent_at: number; event_key: string }>(
    `select kind, campaign_id, ${ms("sent_at", "sent_at")}, event_key from sends where clinic_id = $1 and contact_id = $2`,
    [clinicId, contactId])).rows;

  return {
    ok: true,
    contact: {
      status: c.status,
      muted,
      hasMobile: c.mobile !== null,
      mobile: c.mobile,
      email: c.email,
      consent: latestConsent(consentRows.map((r) => ({ purpose: r.purpose, granted: r.granted, recordedAt: asDate(r.recorded_at), linked: r.linked }))),
      lastVisitOn: latestVisit([v?.last_visit ?? null], [v?.last_completed == null ? null : asDate(v.last_completed)]),
      pastSends: sends.map((s) => ({ kind: s.kind, campaignId: s.campaign_id, sentAt: asDate(s.sent_at) })),
    },
    sentEventKeys: new Set(sends.map((s) => s.event_key)),
  };
}

/**
 * The approval for a campaign, built from the database row as the pipeline requires. Only a live
 * campaign, or a scheduled one whose time has come, is approved for sending. Never carries
 * `staleAcknowledgedBy`: only a person pressing send can add that.
 */
export async function loadCampaignApproval(db: Db, clinicId: string, campaignId: string, now: Date): Promise<Approval | null> {
  if (!isUuid(clinicId) || !isUuid(campaignId)) return null;
  const [c] = (await db.query<{ body: string; approved_by: string | null; status: string; scheduled_for: number | null }>(
    `select body, approved_by, status, ${ms("scheduled_for", "scheduled_for")} from campaigns where clinic_id = $1 and id = $2`,
    [clinicId, campaignId])).rows;
  if (!c || !c.approved_by?.trim()) return null;
  const due = c.status === "live" || (c.status === "scheduled" && c.scheduled_for !== null && asDate(c.scheduled_for) <= now);
  return due ? { type: "campaign", campaignId, approvedBy: c.approved_by, template: c.body } : null;
}

/** The automation approval for an active, approved recall rule. */
export async function loadRecallRuleApproval(db: Db, clinicId: string, ruleId: string): Promise<Approval | null> {
  if (!isUuid(clinicId) || !isUuid(ruleId)) return null;
  const [r] = (await db.query<{ template: string; approved_by: string | null; active: boolean }>(
    `select template, approved_by, active from recall_rules where clinic_id = $1 and id = $2`,
    [clinicId, ruleId])).rows;
  if (!r || !r.active || !r.approved_by?.trim()) return null;
  return { type: "automation", automationId: `recall-rule:${ruleId}`, approvedBy: r.approved_by, template: r.template };
}
