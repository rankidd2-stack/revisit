import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { loadSendTarget } from "../src/db/send-target.js";
import { loadRecallQueue } from "../src/db/recall-queue.js";
import { prepareFromDb } from "../src/db/prepare.js";
import type { SendEvent } from "../src/send/pipeline.js";

// Database wiring 2 (G33): who a text is about comes from assets.kind of the event's own asset,
// and recall skips inactive assets. Runs on the real migrations in an embedded Postgres.
const db = new PGlite();
const id = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params)).rows[0]!.id;

const now = new Date("2026-10-30T02:00:00Z");   // 10:00 in Manila
const MISSING = "00000000-0000-4000-8000-000000000000";
const stop = { stopUrl: "https://revisit.example/s/x1", stopLinkHost: "revisit.example" };

let vet: string, dental: string, otherClinic: string;
let rabies: string, grooming: string, cleaning: string;
let ana: string, bantay: string, mingming: string;
let ben: string, benSelf: string, mika: string;
let carl: string, carlSelf: string;
let vetRule: string, dentalRule: string, inactiveRule: string, foreignRule: string;
let mikaVisit: string, mingmingAppt: string, bantayAppt: string;

const recall = (assetId: string, ruleId: string, dueOn = "2026-10-30", stepOffsetDays = 0): SendEvent =>
  ({ type: "recall", assetId, ruleId, dueOn, stepOffsetDays });

beforeAll(async () => {
  const dir = new URL("../db/migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));

  vet = await id(`insert into clinics (name, vertical, sender_name, sender_name_status, reply_phone) values ('Paw Care', 'vet', 'PAWCARE', 'approved', '0917 555 0000') returning id`);
  // The dental clinic opted in to naming treatments, so only the subject decides whether "braces" may go out.
  dental = await id(`insert into clinics (name, vertical, sender_name, sender_name_status, reply_phone, name_treatments_in_sms)
                     values ('Smile', 'dental', 'SMILE', 'approved', '0917 555 0001', true) returning id`);
  otherClinic = await id(`insert into clinics (name, vertical) values ('Elsewhere', 'vet') returning id`);
  for (const c of [vet, dental]) await db.query(`insert into sync_runs (clinic_id, source, finished_at, ok) values ($1, 'csv', $2, true)`, [c, "2026-10-30T01:00:00Z"]);

  rabies = await id(`insert into service_categories (clinic_id, name) values ($1, 'Rabies vaccine') returning id`, [vet]);
  grooming = await id(`insert into service_categories (clinic_id, name) values ($1, 'Grooming') returning id`, [vet]);
  cleaning = await id(`insert into service_categories (clinic_id, name) values ($1, 'Cleaning') returning id`, [dental]);
  const elsewhereSvc = await id(`insert into service_categories (clinic_id, name) values ($1, 'Rabies vaccine') returning id`, [otherClinic]);

  vetRule = await id(`insert into recall_rules (clinic_id, service_category_id, interval_days, template, active, approved_by)
                      values ($1, $2, 365, 'Hi {first_name}, {pet_name} is due for a visit.', true, 'admin') returning id`, [vet, rabies]);
  inactiveRule = await id(`insert into recall_rules (clinic_id, service_category_id, interval_days, template, active, approved_by)
                           values ($1, $2, 365, 'Hi {first_name}.', false, 'admin') returning id`, [vet, grooming]);
  dentalRule = await id(`insert into recall_rules (clinic_id, service_category_id, interval_days, template, active, approved_by)
                         values ($1, $2, 180, 'Hi {first_name}, time for your braces adjustment.', true, 'admin') returning id`, [dental, cleaning]);
  foreignRule = await id(`insert into recall_rules (clinic_id, service_category_id, interval_days, template, active, approved_by)
                          values ($1, $2, 365, 'Hi.', true, 'admin') returning id`, [otherClinic, elsewhereSvc]);

  // Vet: Ana with an active dog and an inactive cat (both due).
  ana = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Ana Cruz (braces)', '639171234567') returning id`, [vet]);
  bantay = await id(`insert into assets (clinic_id, contact_id, kind, label, species) values ($1, $2, 'pet', 'Bantay', 'dog') returning id`, [vet, ana]);
  mingming = await id(`insert into assets (clinic_id, contact_id, kind, label, species, active) values ($1, $2, 'pet', 'Mingming', 'cat', false) returning id`, [vet, ana]);
  await db.query(`insert into visits (clinic_id, asset_id, service_category_id, visited_on) values ($1, $2, $3, '2025-10-30'), ($1, $4, $3, '2025-10-30')`, [vet, bantay, rabies, mingming]);
  mingmingAppt = await id(`insert into appointments (clinic_id, asset_id, service_category_id, starts_at, status) values ($1, $2, $3, '2026-11-02T01:00:00Z', 'booked') returning id`, [vet, mingming, rabies]);
  bantayAppt = await id(`insert into appointments (clinic_id, asset_id, service_category_id, starts_at, status) values ($1, $2, $3, '2025-10-30T01:00:00Z', 'completed') returning id`, [vet, bantay, rabies]);

  // Dental: Ben (himself a patient) brings his daughter Mika. Carl comes only for himself.
  ben = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Ben Reyes', '639170000001') returning id`, [dental]);
  benSelf = await id(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'self', 'Self') returning id`, [dental, ben]);
  mika = await id(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'dependent', 'Mika Reyes') returning id`, [dental, ben]);
  carl = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Carl Lim', '639170000002') returning id`, [dental]);
  carlSelf = await id(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'self', 'Self') returning id`, [dental, carl]);
  mikaVisit = await id(`insert into visits (clinic_id, asset_id, service_category_id, visited_on) values ($1, $2, $3, '2026-05-03') returning id`, [dental, mika, cleaning]);
  await db.query(`insert into visits (clinic_id, asset_id, service_category_id, visited_on) values ($1, $2, $3, '2026-05-03'), ($1, $4, $3, '2026-05-03')`, [dental, benSelf, cleaning, carlSelf]);
});

describe("the subject comes from the event's own asset (G16, G33)", () => {
  it("a recall about a pet is 'pet' and carries the pet's label", async () => {
    expect(await loadSendTarget(db, vet, ana, recall(bantay, vetRule))).toEqual({ ok: true, subject: "pet", names: { contact: "Ana Cruz (braces)", asset: "Bantay" } });
  });

  it("a recall about a dependent is 'dependent' and never carries the dependent's name", async () => {
    expect(await loadSendTarget(db, dental, ben, recall(mika, dentalRule))).toEqual({ ok: true, subject: "dependent", names: { contact: "Ben Reyes", asset: null } });
  });

  it("a recall about the contact themself is 'self'", async () => {
    expect(await loadSendTarget(db, dental, carl, recall(carlSelf, dentalRule))).toMatchObject({ ok: true, subject: "self", names: { asset: null } });
  });

  it("package and other assets keep their own kinds (both strict in the pipeline)", async () => {
    const pkg = await id(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'package', 'Braces package') returning id`, [dental, carl]);
    const oth = await id(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'other', 'Lola') returning id`, [dental, carl]);
    expect(await loadSendTarget(db, dental, carl, recall(pkg, dentalRule))).toMatchObject({ ok: true, subject: "package", names: { asset: null } });
    expect(await loadSendTarget(db, dental, carl, recall(oth, dentalRule))).toMatchObject({ ok: true, subject: "other", names: { asset: null } });
    await db.query(`delete from assets where id in ($1, $2)`, [pkg, oth]);
  });

  it("a reminder takes the subject from its appointment's asset, feedback from its visit's asset", async () => {
    expect(await loadSendTarget(db, vet, ana, { type: "reminder", appointmentId: bantayAppt, slot: "24h" })).toMatchObject({ ok: true, subject: "pet", names: { asset: "Bantay" } });
    expect(await loadSendTarget(db, dental, ben, { type: "feedback", visitId: mikaVisit })).toMatchObject({ ok: true, subject: "dependent" });
  });

  it("an inactive asset gets nothing, for recall, reminder and feedback alike", async () => {
    expect(await loadSendTarget(db, vet, ana, recall(mingming, vetRule))).toEqual({ ok: false, reason: "asset_inactive" });
    expect(await loadSendTarget(db, vet, ana, { type: "reminder", appointmentId: mingmingAppt, slot: "24h" })).toEqual({ ok: false, reason: "asset_inactive" });
    const v = await id(`select id from visits where asset_id = $1`, [mingming]);
    expect(await loadSendTarget(db, vet, ana, { type: "feedback", visitId: v })).toEqual({ ok: false, reason: "asset_inactive" });
  });

  it("an event can't borrow another contact's asset or another clinic's row", async () => {
    expect(await loadSendTarget(db, dental, carl, recall(mika, dentalRule))).toEqual({ ok: false, reason: "event_not_found" });
    expect(await loadSendTarget(db, dental, carl, { type: "feedback", visitId: mikaVisit })).toEqual({ ok: false, reason: "event_not_found" });
    expect(await loadSendTarget(db, otherClinic, ana, recall(bantay, vetRule))).toEqual({ ok: false, reason: "contact_not_found" });
    expect(await loadSendTarget(db, vet, ana, { type: "reminder", appointmentId: MISSING, slot: "2h" })).toEqual({ ok: false, reason: "event_not_found" });
  });

  it("malformed ids and unknown event types are not found, never a database error", async () => {
    expect(await loadSendTarget(db, vet, "nope", recall(bantay, vetRule))).toEqual({ ok: false, reason: "contact_not_found" });
    expect(await loadSendTarget(db, vet, ana, recall("x'; drop table assets; --", vetRule))).toEqual({ ok: false, reason: "event_not_found" });
    expect(await loadSendTarget(db, vet, ana, { type: "campaign", campaignId: "nope" })).toEqual({ ok: false, reason: "event_not_found" });
    expect(await loadSendTarget(db, vet, ana, { type: "survey" } as unknown as SendEvent)).toEqual({ ok: false, reason: "event_not_found" });
  });

  it("a campaign is 'self' for a contact with only themself or pets, 'other' once they bring in another person", async () => {
    const c = MISSING;
    expect(await loadSendTarget(db, vet, ana, { type: "campaign", campaignId: c })).toMatchObject({ ok: true, subject: "self", names: { asset: null } });
    expect(await loadSendTarget(db, dental, carl, { type: "campaign", campaignId: c })).toMatchObject({ ok: true, subject: "self" });
    expect(await loadSendTarget(db, dental, ben, { type: "campaign", campaignId: c })).toMatchObject({ ok: true, subject: "other" });
  });

  it("an inactive dependent still makes a campaign strict", async () => {
    const dan = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Dan Uy', '639170000003') returning id`, [dental]);
    await db.query(`insert into assets (clinic_id, contact_id, kind, label, active) values ($1, $2, 'dependent', 'Lolo', false)`, [dental, dan]);
    expect(await loadSendTarget(db, dental, dan, { type: "campaign", campaignId: MISSING })).toMatchObject({ ok: true, subject: "other" });
  });
});

describe("the recall queue (G25, G33)", () => {
  it("lists the active pet that is due and skips the inactive one", async () => {
    const q = await loadRecallQueue(db, vet, vetRule, now);
    expect(q).toEqual({ ok: true, items: [{ contactId: ana, assetId: bantay, event: recall(bantay, vetRule) }] });
  });

  it("skips an inactive asset that has no booking either (G25)", async () => {
    const jo = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Jo', '639170000023') returning id`, [vet]);
    const gone = await id(`insert into assets (clinic_id, contact_id, kind, label, active) values ($1, $2, 'pet', 'Puti', false) returning id`, [vet, jo]);
    await db.query(`insert into visits (clinic_id, asset_id, service_category_id, visited_on) values ($1, $2, $3, '2025-10-30')`, [vet, gone, rabies]);
    const q = await loadRecallQueue(db, vet, vetRule, now);
    expect(q.ok && q.items.map((i) => i.assetId)).not.toContain(gone);
    await db.query(`update assets set active = true where id = $1`, [gone]);
    const back = await loadRecallQueue(db, vet, vetRule, now);
    expect(back.ok && back.items.map((i) => i.assetId)).toContain(gone);
    await db.query(`delete from contacts where id = $1`, [jo]);
  });

  it("a cancelled or no-show future appointment does not stop the recall", async () => {
    const jo = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Jo', '639170000024') returning id`, [vet]);
    const p = await id(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'pet', 'Puti') returning id`, [vet, jo]);
    await db.query(`insert into visits (clinic_id, asset_id, service_category_id, visited_on) values ($1, $2, $3, '2025-10-30')`, [vet, p, rabies]);
    await db.query(`insert into appointments (clinic_id, asset_id, service_category_id, starts_at, status)
                    values ($1, $2, $3, '2026-11-05T01:00:00Z', 'cancelled'), ($1, $2, $3, '2026-11-06T01:00:00Z', 'no_show')`, [vet, p, rabies]);
    const q = await loadRecallQueue(db, vet, vetRule, now);
    expect(q.ok && q.items.map((i) => i.assetId)).toContain(p);
    await db.query(`delete from contacts where id = $1`, [jo]);
  });

  it("counts a completed appointment for the rule's service as a visit", async () => {
    const lee = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Lee', '639170000020') returning id`, [vet]);
    const choco = await id(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'pet', 'Choco') returning id`, [vet, lee]);
    // 2025-10-29 at 17:00 UTC is 2025-10-30 in Manila, so the due date is 2026-10-30.
    await db.query(`insert into appointments (clinic_id, asset_id, service_category_id, starts_at, status) values ($1, $2, $3, '2025-10-29T17:00:00Z', 'completed')`, [vet, choco, rabies]);
    const q = await loadRecallQueue(db, vet, vetRule, now);
    expect(q.ok && q.items.find((i) => i.assetId === choco)?.event).toEqual(recall(choco, vetRule, "2026-10-30", 0));
    await db.query(`delete from contacts where id = $1`, [lee]);
  });

  it("ignores visits for other services, and a booking for any service stops the recall", async () => {
    const mo = await id(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Mo', '639170000021') returning id`, [vet]);
    const a = await id(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'pet', 'Max') returning id`, [vet, mo]);
    const b = await id(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'pet', 'Rex') returning id`, [vet, mo]);
    await db.query(`insert into visits (clinic_id, asset_id, service_category_id, visited_on) values ($1, $2, $3, '2025-10-30'), ($1, $4, $5, '2025-10-30')`, [vet, a, grooming, b, rabies]);
    await db.query(`insert into appointments (clinic_id, asset_id, service_category_id, starts_at, status) values ($1, $2, $3, '2026-11-05T01:00:00Z', 'confirmed')`, [vet, b, grooming]);
    const q = await loadRecallQueue(db, vet, vetRule, now);
    expect(q.ok && q.items.map((i) => i.assetId)).not.toContain(a);
    expect(q.ok && q.items.map((i) => i.assetId)).not.toContain(b);
    await db.query(`delete from contacts where id = $1`, [mo]);
  });

  it("skips contacts the clinic marked moved, deceased or do-not-contact", async () => {
    const kim = await id(`insert into contacts (clinic_id, full_name, mobile, status) values ($1, 'Kim', '639170000022', 'moved') returning id`, [vet]);
    const p = await id(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'pet', 'Brownie') returning id`, [vet, kim]);
    await db.query(`insert into visits (clinic_id, asset_id, service_category_id, visited_on) values ($1, $2, $3, '2025-10-30')`, [vet, p, rabies]);
    const q = await loadRecallQueue(db, vet, vetRule, now);
    expect(q.ok && q.items.map((i) => i.assetId)).not.toContain(p);
    await db.query(`delete from contacts where id = $1`, [kim]);
  });

  it("refuses an inactive rule and another clinic's rule", async () => {
    expect(await loadRecallQueue(db, vet, inactiveRule, now)).toEqual({ ok: false, reason: "rule_not_active" });
    expect(await loadRecallQueue(db, vet, foreignRule, now)).toEqual({ ok: false, reason: "rule_not_found" });
    expect(await loadRecallQueue(db, vet, "nope", now)).toEqual({ ok: false, reason: "rule_not_found" });
  });
});

describe("prepareFromDb: the subject is never the caller's (G33)", () => {
  const prep = (clinicId: string, contactId: string, event: SendEvent, at = now) => prepareFromDb(db, { clinicId, contactId, event, now: at, ...stop });

  it("a queued recall goes out with the pet's name and the derived first name, then is logged once", async () => {
    const q = await loadRecallQueue(db, vet, vetRule, now);
    if (!q.ok) throw new Error(q.reason);
    const item = q.items.find((i) => i.assetId === bantay)!;
    const r = await prep(vet, item.contactId, item.event);
    expect(r.ok && r.sms.body).toBe("Hi Ana, Bantay is due for a visit.\nReply: 0917 555 0000\nStop msgs: https://revisit.example/s/x1");
    await db.query(`insert into sends (clinic_id, contact_id, event_key, kind, asset_id, recall_rule_id, cycle_due_on, step_offset_days, channel, approved_by, status, sent_at)
                    values ($1, $2, $3, 'recall', $4, $5, '2026-10-30', 0, 'sms', 'admin', 'sent', $6)`,
      [vet, ana, r.ok ? r.sms.eventKey : "", bantay, vetRule, now.toISOString()]);
    expect(await prep(vet, item.contactId, item.event)).toMatchObject({ ok: false, reason: "already_sent" });
    // The queue no longer offers the step already sent, and offers the next one when it comes.
    const again = await loadRecallQueue(db, vet, vetRule, now);
    expect(again.ok && again.items.map((i) => i.assetId)).not.toContain(bantay);
    const later = await loadRecallQueue(db, vet, vetRule, new Date("2026-11-13T02:00:00Z"));
    expect(later.ok && later.items.find((i) => i.assetId === bantay)?.event).toEqual(recall(bantay, vetRule, "2026-10-30", 14));
  });

  it("an inactive pet's recall is refused even when the caller builds the event by hand", async () => {
    expect(await prep(vet, ana, recall(mingming, vetRule))).toEqual({ ok: false, reason: "asset_inactive" });
  });

  it("treatment wording the clinic opted in to goes to a patient about themself, never about a dependent", async () => {
    const self = await prep(dental, carl, recall(carlSelf, dentalRule));
    expect(self.ok && self.sms.body.startsWith("Hi Carl, time for your braces adjustment.")).toBe(true);
    expect(await prep(dental, ben, recall(mika, dentalRule))).toMatchObject({ ok: false, reason: "content" });
  });

  it("{pet_name} never fills with a dependent's name: the send is refused", async () => {
    const r2 = await id(`insert into recall_rules (clinic_id, service_category_id, interval_days, template, active, approved_by)
                         values ($1, $2, 180, 'Hi {first_name}, {pet_name} is due for a visit.', true, 'admin') returning id`, [dental, cleaning]);
    expect(await prep(dental, ben, recall(mika, r2))).toEqual({ ok: false, reason: "missing_variable" });
  });

  it("reminders and feedback stay unapproved until they have approval records", async () => {
    expect(await prep(vet, ana, { type: "reminder", appointmentId: bantayAppt, slot: "24h" })).toEqual({ ok: false, reason: "not_approved" });
    expect(await prep(dental, ben, { type: "feedback", visitId: mikaVisit })).toEqual({ ok: false, reason: "not_approved" });
  });

  it("passes through loader refusals", async () => {
    expect(await prep(MISSING, ana, recall(bantay, vetRule))).toEqual({ ok: false, reason: "clinic_not_found" });
    expect(await prep(vet, MISSING, recall(bantay, vetRule))).toEqual({ ok: false, reason: "contact_not_found" });
    expect(await prep(vet, ana, recall(MISSING, vetRule))).toEqual({ ok: false, reason: "event_not_found" });
  });
});
