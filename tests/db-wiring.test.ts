import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { loadCampaignApproval, loadClinicContext, loadContact, loadRecallRuleApproval } from "../src/db/send-context.js";
import { prepareSms } from "../src/send/pipeline.js";

// Loads send-gate inputs from the real migration on an embedded Postgres, then feeds them to the
// pipeline, so the rules hold on database rows and not only on hand-built objects.
const db = new PGlite();
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;
const id = async (sql: string, params: unknown[] = []) => (await one<{ id: string }>(sql, params)).id;

const now = new Date("2026-10-30T02:00:00Z");   // 10:00 in Manila
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
const MISSING = "00000000-0000-4000-8000-000000000000";
const recallTemplate = "Hi {first_name}, {pet_name} is due for a visit.";

let clinicA: string, clinicB: string, ana: string, bantay: string, rule: string;

beforeAll(async () => {
  await db.exec(readFileSync(new URL("../db/migrations/001_init.sql", import.meta.url), "utf8"));
  clinicA = await id(`insert into clinics (name, vertical, sender_name, sender_name_status, reply_phone, marketing_cap_per_30d, sync_stale_after_hours)
                      values ('Paw Care', 'vet', 'PAWCARE', 'approved', '0917 555 0000', 3, 24) returning id`);
  clinicB = await id(`insert into clinics (name, vertical, sender_name, sender_name_status) values ('Smile', 'dental', 'SMILE', 'pending') returning id`);
  const rabies = await id(`insert into service_categories (clinic_id, name) values ($1, 'Rabies vaccine') returning id`, [clinicA]);
  await db.query(`insert into service_categories (clinic_id, name) values ($1, 'Deworming')`, [clinicA]);
  await db.query(`insert into sync_runs (clinic_id, source, finished_at, ok) values ($1, 'csv', $2, true)`, [clinicA, hoursAgo(2)]);

  ana = await id(`insert into contacts (clinic_id, full_name, mobile, email) values ($1, 'Ana Cruz', '639171234567', 'ana@example.com') returning id`, [clinicA]);
  bantay = await id(`insert into assets (clinic_id, contact_id, kind, label, species) values ($1, $2, 'pet', 'Bantay', 'dog') returning id`, [clinicA, ana]);
  const mingming = await id(`insert into assets (clinic_id, contact_id, kind, label, species, active) values ($1, $2, 'pet', 'Mingming', 'cat', false) returning id`, [clinicA, ana]);
  await db.query(`insert into visits (clinic_id, asset_id, service_category_id, visited_on) values ($1, $2, $3, '2026-09-01'), ($1, $4, $3, '2026-10-20')`, [clinicA, bantay, rabies, mingming]);
  await db.query(`insert into appointments (clinic_id, asset_id, service_category_id, starts_at, status)
                  values ($1, $2, $3, '2026-10-25T01:00:00Z', 'completed'), ($1, $2, $3, '2026-10-28T01:00:00Z', 'no_show')`, [clinicA, bantay, rabies]);
  await db.query(`insert into consent_events (clinic_id, contact_id, purpose, granted, channel, text_version, captured_by, recorded_at)
                  values ($1, $2, 'marketing', true, 'qr', 'v1', 'patient', '2026-06-01T00:00:00Z'),
                         ($1, $2, 'service', true, 'intake_form', 'v1', 'patient', '2026-06-01T00:00:00Z')`, [clinicA, ana]);
  rule = await id(`insert into recall_rules (clinic_id, service_category_id, interval_days, template, active, approved_by)
                   values ($1, $2, 365, $3, true, 'admin') returning id`, [clinicA, rabies, recallTemplate]);
});

const clinicCtx = async (clinicId: string) => {
  const r = await loadClinicContext(db, clinicId, now);
  if (!r.ok) throw new Error(r.reason);
  return r.clinic;
};
const contactOf = async (clinicId: string, contactId: string) => {
  const r = await loadContact(db, clinicId, contactId);
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe("loading a clinic", () => {
  it("reads the send profile, the clinic's own cap and default quiet hours", async () => {
    const c = await clinicCtx(clinicA);
    expect(c.profile).toEqual({
      vertical: "vet", senderName: "PAWCARE", senderNameApproved: true, nameTreatmentsAllowed: false,
      replyPhone: "0917 555 0000", replyEmail: null, messengerUrl: null, serviceCategories: ["Deworming", "Rabies vaccine"],
    });
    expect(c.policy).toEqual({ marketingCapPer30d: 3, quietStartHour: 20, quietEndHour: 8, syncHealthy: true });
  });

  it("a sender name counts only once it is registered", async () => {
    expect((await clinicCtx(clinicB)).profile.senderNameApproved).toBe(false);
  });

  it("sync health follows the latest run and the clinic's own threshold", async () => {
    const c = await id(`insert into clinics (name, vertical, sync_stale_after_hours) values ('Sync', 'vet', 24) returning id`);
    expect((await clinicCtx(c)).sync).toMatchObject({ healthy: false, reason: "never_synced" });
    await db.query(`insert into sync_runs (clinic_id, source, finished_at, ok) values ($1, 'csv', $2, true)`, [c, hoursAgo(30)]);
    expect((await clinicCtx(c)).sync).toMatchObject({ healthy: false, reason: "stale" });
    await db.query(`insert into sync_runs (clinic_id, source, finished_at, ok) values ($1, 'csv', $2, true)`, [c, hoursAgo(3)]);
    expect((await clinicCtx(c)).policy.syncHealthy).toBe(true);
    // A run still in progress changes nothing; a failed one pauses sends.
    await db.query(`insert into sync_runs (clinic_id, source) values ($1, 'google_sheet')`, [c]);
    expect((await clinicCtx(c)).policy.syncHealthy).toBe(true);
    await db.query(`insert into sync_runs (clinic_id, source, finished_at, ok, error_code) values ($1, 'google_sheet', $2, false, 'sheet_unreachable')`, [c, hoursAgo(1)]);
    const after = await clinicCtx(c);
    expect(after.sync).toMatchObject({ healthy: false, reason: "last_run_failed" });
    expect(after.policy.syncHealthy).toBe(false);
  });

  it("one clinic's sync runs never count for another", async () => {
    expect((await clinicCtx(clinicB)).sync).toMatchObject({ healthy: false, reason: "never_synced" });
  });

  it("refuses unknown, malformed and non-Manila clinics", async () => {
    expect(await loadClinicContext(db, MISSING, now)).toEqual({ ok: false, reason: "clinic_not_found" });
    expect(await loadClinicContext(db, "1; drop table clinics", now)).toEqual({ ok: false, reason: "clinic_not_found" });
    const sg = await id(`insert into clinics (name, vertical, timezone) values ('SG', 'vet', 'Asia/Singapore') returning id`);
    expect(await loadClinicContext(db, sg, now)).toEqual({ ok: false, reason: "unsupported_timezone" });
  });
});

describe("loading a contact", () => {
  it("builds the gate inputs from consent, visits across every pet, and completed appointments", async () => {
    const r = await contactOf(clinicA, ana);
    expect(r.contact).toMatchObject({
      status: "active", muted: false, hasMobile: true, mobile: "639171234567", email: "ana@example.com",
      consent: { service: true, marketing: true },
      // Visits Sep 1 (Bantay) and Oct 20 (Mingming, inactive); completed appointment Oct 25 wins; the no-show doesn't count.
      lastVisitOn: "2026-10-25",
      pastSends: [],
    });
    expect(r.sentEventKeys.size).toBe(0);
  });

  it("the clinic's status for the contact flows through", async () => {
    const c = await id(`insert into contacts (clinic_id, full_name, mobile, status) values ($1, 'Dina', '639170000009', 'deceased') returning id`, [clinicA]);
    expect((await contactOf(clinicA, c)).contact.status).toBe("deceased");
  });

  it("a mute on the number or on the email stops texts", async () => {
    const ben = await id(`insert into contacts (clinic_id, full_name, mobile, email) values ($1, 'Ben', '639170000001', 'ben@example.com') returning id`, [clinicA]);
    expect((await contactOf(clinicA, ben)).contact.muted).toBe(false);
    await db.query(`insert into mutes (clinic_id, kind, value, reason) values ($1, 'email', 'ben@example.com', 'stop_link')`, [clinicA]);
    expect((await contactOf(clinicA, ben)).contact.muted).toBe(true);
    const cora = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Cora', '639170000002') returning id`, [clinicA]);
    await db.query(`insert into mutes (clinic_id, kind, value, reason) values ($1, 'mobile', '639170000002', 'staff')`, [clinicA]);
    expect((await contactOf(clinicA, cora)).contact).toMatchObject({ muted: true, hasMobile: true });
  });

  it("an opt-out survives erasure and re-import; an opt-in does not carry over", async () => {
    const mobile = "639170000003";
    const old = await id(`insert into contacts (clinic_id, full_name, mobile, email) values ($1, 'Eli', $2, 'eli@example.com') returning id`, [clinicA, mobile]);
    await db.query(`insert into consent_events (clinic_id, contact_id, mobile_snapshot, email_snapshot, purpose, granted, channel, text_version, captured_by)
                    values ($1, $2, $3, 'Eli@Example.com', 'marketing', true, 'qr', 'v1', 'patient'),
                           ($1, $2, $3, 'Eli@Example.com', 'service', false, 'staff', 'v1', 'staff:1')`, [clinicA, old, mobile]);
    await db.query(`delete from contacts where id = $1`, [old]);
    const again = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Eli', $2) returning id`, [clinicA, mobile]);
    expect((await contactOf(clinicA, again)).contact.consent).toEqual({ service: false });
    // Matched on email too, whatever its case in the snapshot.
    const byEmail = await id(`insert into contacts (clinic_id, full_name, email) values ($1, 'Eli', 'eli@example.com') returning id`, [clinicA]);
    expect((await contactOf(clinicA, byEmail)).contact).toMatchObject({ consent: { service: false }, hasMobile: false, mobile: null });
  });

  it("failed sends still count toward caps, and every logged key blocks a resend", async () => {
    const fe = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Fe', '639170000004') returning id`, [clinicA]);
    const camp = await id(`insert into campaigns (clinic_id, name, body, announcement_type, status, approved_by) values ($1, 'News', 'Open Saturdays', 'clinic_news', 'live', 'admin') returning id`, [clinicA]);
    await db.query(`insert into sends (clinic_id, contact_id, event_key, kind, campaign_id, channel, approved_by, status, sent_at)
                    values ($1, $2, $3, 'marketing', $4, 'sms', 'admin', 'failed', $5)`, [clinicA, fe, `campaign:${camp}`, camp, hoursAgo(5)]);
    const r = await contactOf(clinicA, fe);
    expect(r.contact.pastSends).toEqual([{ kind: "marketing", campaignId: camp, sentAt: new Date(hoursAgo(5)) }]);
    expect([...r.sentEventKeys]).toEqual([`campaign:${camp}`]);
  });

  it("never loads another clinic's contact, consent or mutes", async () => {
    expect(await loadContact(db, clinicB, ana)).toEqual({ ok: false, reason: "contact_not_found" });
    expect(await loadContact(db, clinicA, MISSING)).toEqual({ ok: false, reason: "contact_not_found" });
    expect(await loadContact(db, clinicA, "not-a-uuid")).toEqual({ ok: false, reason: "contact_not_found" });
    await db.query(`insert into consent_events (clinic_id, mobile_snapshot, purpose, granted, channel, text_version, captured_by)
                    values ($1, '639171234567', 'service', false, 'staff', 'v1', 'staff:9')`, [clinicB]);
    await db.query(`insert into mutes (clinic_id, kind, value, reason) values ($1, 'mobile', '639171234567', 'stop_link')`, [clinicB]);
    expect((await contactOf(clinicA, ana)).contact).toMatchObject({ muted: false, consent: { service: true, marketing: true } });
  });
});

describe("loading approvals", () => {
  const campaign = (status: string, over: { approvedBy?: string | null; scheduledFor?: string | null } = {}) =>
    id(`insert into campaigns (clinic_id, name, body, announcement_type, status, approved_by, scheduled_for)
        values ($1, 'News', 'We now open on Saturdays.', 'clinic_news', $2, $3, $4) returning id`,
      [clinicA, status, over.approvedBy === undefined ? "admin" : over.approvedBy, over.scheduledFor ?? null]);

  it("only a live campaign, or a scheduled one whose time has come, is approved", async () => {
    const live = await campaign("live");
    expect(await loadCampaignApproval(db, clinicA, live, now)).toEqual({ type: "campaign", campaignId: live, approvedBy: "admin", template: "We now open on Saturdays." });
    expect(await loadCampaignApproval(db, clinicA, await campaign("scheduled", { scheduledFor: hoursAgo(1) }), now)).toMatchObject({ type: "campaign" });
    expect(await loadCampaignApproval(db, clinicA, await campaign("scheduled", { scheduledFor: hoursAgo(-24) }), now)).toBeNull();
    expect(await loadCampaignApproval(db, clinicA, await campaign("scheduled"), now)).toBeNull();
    for (const status of ["draft", "pending_approval", "paused", "ended"]) {
      expect(await loadCampaignApproval(db, clinicA, await campaign(status), now)).toBeNull();
    }
    expect(await loadCampaignApproval(db, clinicA, await campaign("draft", { approvedBy: null }), now)).toBeNull();
  });

  it("never carries a stale-sync acknowledgement; only a person pressing send can add one", async () => {
    const a = await loadCampaignApproval(db, clinicA, await campaign("live"), now);
    expect(a && "staleAcknowledgedBy" in a).toBe(false);
  });

  it("editing a live campaign's wording withdraws its approval", async () => {
    const c = await campaign("live");
    await db.query(`update campaigns set body = 'New wording' where id = $1`, [c]);
    expect(await loadCampaignApproval(db, clinicA, c, now)).toBeNull();
  });

  it("an approval never crosses clinics", async () => {
    expect(await loadCampaignApproval(db, clinicB, await campaign("live"), now)).toBeNull();
    expect(await loadRecallRuleApproval(db, clinicB, rule)).toBeNull();
    expect(await loadCampaignApproval(db, clinicA, "x", now)).toBeNull();
  });

  it("a recall rule is approved only while active, and only for its own wording", async () => {
    expect(await loadRecallRuleApproval(db, clinicA, rule)).toEqual({ type: "automation", automationId: `recall-rule:${rule}`, approvedBy: "admin", template: recallTemplate });
    const svc = await id(`select id from service_categories where clinic_id = $1 and name = 'Deworming'`, [clinicA]);
    const other = await id(`insert into recall_rules (clinic_id, service_category_id, interval_days, template, active, approved_by)
                            values ($1, $2, 90, 'Hi {first_name}, {pet_name} is due.', true, 'admin') returning id`, [clinicA, svc]);
    await db.query(`update recall_rules set template = 'Changed wording' where id = $1`, [other]);
    expect(await loadRecallRuleApproval(db, clinicA, other)).toBeNull();
    await db.query(`update recall_rules set template = 'Hi {first_name}.', active = false, approved_by = 'admin' where id = $1`, [other]);
    expect(await loadRecallRuleApproval(db, clinicA, other)).toBeNull();
  });
});

describe("database rows drive the send pipeline", () => {
  const prepare = async (contactId: string, event: Parameters<typeof prepareSms>[0]["event"], approval: Parameters<typeof prepareSms>[0]["approval"]) => {
    const clinic = await clinicCtx(clinicA);
    const c = await contactOf(clinicA, contactId);
    return prepareSms({
      clinic: clinic.profile, contact: c.contact, policy: clinic.policy, now, approval, event,
      sentEventKeys: c.sentEventKeys, vars: { first_name: "Ana", pet_name: "Bantay" },
      stopUrl: "https://revisit.example/s/x1", stopLinkHost: "revisit.example",
    });
  };
  const recallEvent = () => ({ type: "recall" as const, assetId: bantay, ruleId: rule, dueOn: "2026-10-30", stepOffsetDays: 0 });

  it("a loaded recall goes out once, with the approved wording and the footer", async () => {
    const r = await prepare(ana, recallEvent(), await loadRecallRuleApproval(db, clinicA, rule));
    expect(r.ok && r.sms.body).toBe("Hi Ana, Bantay is due for a visit.\nReply: 0917 555 0000\nStop msgs: https://revisit.example/s/x1");
    await db.query(`insert into sends (clinic_id, contact_id, event_key, kind, asset_id, recall_rule_id, cycle_due_on, step_offset_days, channel, approved_by, status, sent_at)
                    values ($1, $2, $3, 'recall', $4, $5, '2026-10-30', 0, 'sms', 'admin', 'sent', $6)`,
      [clinicA, ana, r.ok ? r.sms.eventKey : "", bantay, rule, now.toISOString()]);
    expect(await prepare(ana, recallEvent(), await loadRecallRuleApproval(db, clinicA, rule))).toMatchObject({ ok: false, reason: "already_sent" });
  });

  it("a completed appointment in the database blocks marketing for 7 days", async () => {
    const c = await id(`insert into campaigns (clinic_id, name, body, announcement_type, status, approved_by) values ($1, 'Tip', 'Keep fresh water out on hot days.', 'care_tip', 'live', 'admin') returning id`, [clinicA]);
    const r = await prepare(ana, { type: "campaign", campaignId: c }, await loadCampaignApproval(db, clinicA, c, now));
    expect(r).toMatchObject({ ok: false, reason: "recent_visit" });
  });

  it("a stop-link mute in the database stops the next text", async () => {
    await db.query(`insert into mutes (clinic_id, kind, value, reason) values ($1, 'mobile', '639171234567', 'stop_link')`, [clinicA]);
    const next = { ...recallEvent(), stepOffsetDays: 14 };
    expect(await prepare(ana, next, await loadRecallRuleApproval(db, clinicA, rule))).toMatchObject({ ok: false, reason: "muted" });
  });
});
