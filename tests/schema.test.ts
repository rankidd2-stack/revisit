import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";

// Runs the real migration on an embedded Postgres and checks that the rules the app relies on
// are enforced by the database itself, not just by app code.
const db = new PGlite();
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;

let clinicA: string, clinicB: string, contact: string, asset: string, svc: string, rule: string;

beforeAll(async () => {
  const dir = new URL("../db/migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));
  clinicA = (await one<{ id: string }>(`insert into clinics (name, vertical) values ('Paw Care', 'vet') returning id`)).id;
  clinicB = (await one<{ id: string }>(`insert into clinics (name, vertical) values ('Smile', 'dental') returning id`)).id;
  contact = (await one<{ id: string }>(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Ana Cruz', '639171234567') returning id`, [clinicA])).id;
  asset = (await one<{ id: string }>(`insert into assets (clinic_id, contact_id, kind, label, species) values ($1, $2, 'pet', 'Bantay', 'dog') returning id`, [clinicA, contact])).id;
  svc = (await one<{ id: string }>(`insert into service_categories (clinic_id, name) values ($1, 'Rabies vaccine') returning id`, [clinicA])).id;
  rule = (await one<{ id: string }>(`insert into recall_rules (clinic_id, service_category_id, interval_days, template, active, approved_by) values ($1, $2, 365, 'Hi {first_name}, {pet_name} is due.', true, 'admin') returning id`, [clinicA, svc])).id;
});

const rejects = (sql: string, params: unknown[] = []) => expect(db.query(sql, params)).rejects.toThrow();

describe("schema guarantees", () => {
  it("stores mobiles only as 639XXXXXXXXX, so dedupe and mutes always match", async () => {
    await rejects(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'X', '09171234567')`, [clinicA]);
    await rejects(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Dup', '639171234567')`, [clinicA]);
    await rejects(`insert into mutes (clinic_id, kind, value, reason) values ($1, 'mobile', '09171234567', 'staff')`, [clinicA]);
    await rejects(`insert into mutes (clinic_id, kind, value, reason) values ($1, 'email', 'Ana@X.com', 'staff')`, [clinicA]);
  });

  it("keeps clinics' data apart", async () => {
    await rejects(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'pet', 'X')`, [clinicB, contact]);
  });

  it("logs each recall step once per contact", async () => {
    const ins = `insert into sends (clinic_id, contact_id, event_key, kind, asset_id, recall_rule_id, cycle_due_on, step_offset_days, channel, approved_by, cycle_visit_on, service_category_id)
                 values ($1, $2, $3, 'recall', $4, $5, '2026-11-01', 0, 'sms', 'automation:1', '2025-11-01', $6)`;
    const key = `recall:${asset}:${rule}:2026-11-01:0`;
    await db.query(ins, [clinicA, contact, key, asset, rule, svc]);
    await rejects(ins, [clinicA, contact, key, asset, rule, svc]);
  });

  it("refuses a recall send without its event details or approval", async () => {
    await rejects(`insert into sends (clinic_id, contact_id, event_key, kind, channel, approved_by) values ($1, $2, 'recall:x', 'recall', 'sms', 'a')`, [clinicA, contact]);
    await rejects(`insert into sends (clinic_id, contact_id, event_key, kind, channel) values ($1, $2, 'campaign:x', 'marketing', 'sms')`, [clinicA, contact]);
  });

  it("consent rows cannot be edited, but survive a contact erasure", async () => {
    const c = (await one<{ id: string }>(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Ben', '639181112222') returning id`, [clinicA])).id;
    const ev = (await one<{ id: string }>(
      `insert into consent_events (clinic_id, contact_id, mobile_snapshot, purpose, granted, channel, text_version, captured_by)
       values ($1, $2, '639181112222', 'marketing', true, 'qr', 'v1', 'patient') returning id`, [clinicA, c])).id;
    await rejects(`update consent_events set granted = false where id = $1`, [ev]);
    await rejects(`delete from consent_events where id = $1`, [ev]);
    await db.query(`delete from contacts where id = $1`, [c]);
    const row = await one<{ contact_id: string | null; mobile_snapshot: string }>(`select contact_id, mobile_snapshot from consent_events where id = $1`, [ev]);
    expect(row).toEqual({ contact_id: null, mobile_snapshot: "639181112222" });
  });

  it("blocks dental testimonials, promo-shaped marketing and unapproved live campaigns", async () => {
    await rejects(`update clinics set testimonials_enabled = true where id = $1`, [clinicB]);
    await rejects(`insert into campaigns (clinic_id, kind, name, body) values ($1, 'marketing', 'X', 'Y')`, [clinicA]);
    await rejects(`insert into campaigns (clinic_id, kind, name, body, announcement_type, status) values ($1, 'marketing', 'X', 'Y', 'spotlight', 'live')`, [clinicA]);
  });

  it("a send's kind must match its event, and approval can't be blank", async () => {
    const camp = (await one<{ id: string }>(`insert into campaigns (clinic_id, name, body, announcement_type) values ($1, 'News', 'Y', 'clinic_news') returning id`, [clinicA])).id;
    await rejects(`insert into sends (clinic_id, contact_id, event_key, kind, campaign_id, channel, approved_by) values ($1, $2, $3, 'reminder', $4, 'sms', 'x')`, [clinicA, contact, `campaign:${camp}`, camp]);
    await rejects(`insert into sends (clinic_id, contact_id, event_key, kind, campaign_id, channel, approved_by) values ($1, $2, $3, 'marketing', $4, 'sms', '  ')`, [clinicA, contact, `campaign:${camp}`, camp]);
    await rejects(`insert into campaigns (clinic_id, kind, name, body, announcement_type) values ($1, 'reminder', 'X', 'Y', 'clinic_news')`, [clinicA]);
    await rejects(`insert into sends (clinic_id, contact_id, event_key, kind, recall_rule_id, cycle_due_on, step_offset_days, channel, approved_by) values ($1, $2, 'recall:x', 'recall', $3, '2026-11-01', 0, 'sms', 'a')`, [clinicA, contact, rule]);
  });

  it("a pet with recall history can still be deleted", async () => {
    await db.query(`delete from assets where id = $1`, [asset]);
    const row = await one<{ asset_id: string | null }>(`select asset_id from sends where event_key like 'recall:%' limit 1`);
    expect(row.asset_id).toBeNull();
  });

  it("consent rows can't point at another clinic's contact or be truncated", async () => {
    await rejects(`insert into consent_events (clinic_id, contact_id, purpose, granted, channel, text_version, captured_by) values ($1, $2, 'marketing', true, 'qr', 'v1', 'patient')`, [clinicB, contact]);
    await rejects(`truncate consent_events`);
  });

  it("reviewer pass 3: approvals follow the wording, keys follow the columns", async () => {
    // Editing an approved campaign's text withdraws its approval and takes it off air.
    const c = (await one<{ id: string }>(`insert into campaigns (clinic_id, name, body, announcement_type, status, approved_by) values ($1, 'N', 'Open Saturdays', 'clinic_news', 'live', 'admin') returning id`, [clinicA])).id;
    await db.query(`update campaigns set body = 'Big SALE' where id = $1`, [c]);
    expect(await one(`select status, approved_by from campaigns where id = $1`, [c])).toEqual({ status: "draft", approved_by: null });
    await rejects(`update campaigns set approved_by = '  ' where id = $1`, [c]);
    // Same for recall rules; an active rule always has an approval.
    await db.query(`update recall_rules set template = 'Changed' where id = $1`, [rule]);
    expect(await one(`select active, approved_by from recall_rules where id = $1`, [rule])).toEqual({ active: false, approved_by: null });
    await rejects(`update recall_rules set active = true where id = $1`, [rule]);
    await db.query(`update recall_rules set active = true, approved_by = 'admin' where id = $1`, [rule]);
    // A second "send" for the same campaign under a different key is refused.
    await rejects(`insert into sends (clinic_id, contact_id, event_key, kind, campaign_id, channel, approved_by) values ($1, $2, $3, 'marketing', $4, 'sms', 'x')`, [clinicA, contact, `campaign:${c}-again`, c]);
  });

  it("reviewer pass 3: sends can't be relabelled or point at someone else's pet", async () => {
    const ben = (await one<{ id: string }>(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Ben', '639190001111') returning id`, [clinicA])).id;
    const pet = (await one<{ id: string }>(`insert into assets (clinic_id, contact_id, kind, label) values ($1, $2, 'pet', 'Choco') returning id`, [clinicA, contact])).id;
    await rejects(`insert into sends (clinic_id, contact_id, event_key, kind, asset_id, recall_rule_id, cycle_due_on, step_offset_days, channel, approved_by)
                   values ($1, $2, $3, 'recall', $4, $5, '2026-12-01', 0, 'sms', 'a')`, [clinicA, ben, `recall:${pet}:${rule}:2026-12-01:0`, pet, rule]);
    const s = (await one<{ id: string }>(`insert into sends (clinic_id, contact_id, event_key, kind, channel, approved_by) values ($1, $2, 'reminder:appt1:24h', 'reminder', 'sms', 'a') returning id`, [clinicA, contact])).id;
    await rejects(`update sends set kind = 'recall' where id = $1`, [s]);
  });

  it("reviewer pass 3: an opt-out can't be unlinked from a living contact", async () => {
    const ev = (await one<{ id: string }>(`insert into consent_events (clinic_id, contact_id, mobile_snapshot, purpose, granted, channel, text_version, captured_by) values ($1, $2, '639171234567', 'service', false, 'stop_link', 'v1', 'patient') returning id`, [clinicA, contact])).id;
    await rejects(`update consent_events set contact_id = null where id = $1`, [ev]);
  });

  it("editing a registered sender name sends it back to pending", async () => {
    await db.query(`update clinics set sender_name = 'PAWCARE', sender_name_status = 'approved' where id = $1`, [clinicA]);
    await db.query(`update clinics set sender_name = 'PAWCARE2' where id = $1`, [clinicA]);
    expect(await one(`select sender_name_status from clinics where id = $1`, [clinicA])).toEqual({ sender_name_status: "pending" });
  });

  it("sender names are at most 11 characters", async () => {
    await rejects(`update clinics set sender_name = 'PAWCAREVETCLINIC' where id = $1`, [clinicA]);
  });
});

describe("migration 002 on a database that already holds data (R57)", () => {
  it("trims old emails, keeps old ledger rows, and still checks new ones", async () => {
    const old = new PGlite();
    const dir = new URL("../db/migrations/", import.meta.url);
    await old.exec(readFileSync(new URL("001_init.sql", dir), "utf8"));
    const c = (await old.query<{ id: string }>(`insert into clinics (name, vertical) values ('Smile', 'dental') returning id`)).rows[0]!.id;
    const p = (await old.query<{ id: string }>(`insert into contacts (clinic_id, full_name, email) values ($1, 'Ana', ' ana@x.com ') returning id`, [c])).rows[0]!.id;
    await old.query(`insert into mutes (clinic_id, kind, value, reason) values ($1, 'email', 'bo@x.com ', 'staff')`, [c]);
    await old.query(`insert into consent_events (clinic_id, contact_id, purpose, granted, channel, text_version, captured_by, email_snapshot) values ($1, $2, 'marketing', false, 'staff', 'v1', 'admin', ' ana@x.com ')`, [c, p]);
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql") && f !== "001_init.sql").sort()) await old.exec(readFileSync(new URL(f, dir), "utf8"));
    expect((await old.query<{ email: string }>(`select email from contacts`)).rows[0]!.email).toBe("ana@x.com");
    expect((await old.query<{ value: string }>(`select value from mutes`)).rows[0]!.value).toBe("bo@x.com");
    expect((await old.query(`select 1 from consent_events`)).rows).toHaveLength(1);
    await expect(old.query(`insert into consent_events (clinic_id, contact_id, purpose, granted, channel, text_version, captured_by, email_snapshot) values ($1, $2, 'marketing', false, 'staff', 'v1', 'admin', ' ana@x.com ')`, [c, p])).rejects.toThrow();
  });
});
