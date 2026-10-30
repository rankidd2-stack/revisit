import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Runs the real migration on an embedded Postgres and checks that the rules the app relies on
// are enforced by the database itself, not just by app code.
const db = new PGlite();
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;

let clinicA: string, clinicB: string, contact: string, asset: string, svc: string, rule: string;

beforeAll(async () => {
  await db.exec(readFileSync(new URL("../db/migrations/001_init.sql", import.meta.url), "utf8"));
  clinicA = (await one<{ id: string }>(`insert into clinics (name, vertical) values ('Paw Care', 'vet') returning id`)).id;
  clinicB = (await one<{ id: string }>(`insert into clinics (name, vertical) values ('Smile', 'dental') returning id`)).id;
  contact = (await one<{ id: string }>(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Ana Cruz', '639171234567') returning id`, [clinicA])).id;
  asset = (await one<{ id: string }>(`insert into assets (clinic_id, contact_id, kind, label, species) values ($1, $2, 'pet', 'Bantay', 'dog') returning id`, [clinicA, contact])).id;
  svc = (await one<{ id: string }>(`insert into service_categories (clinic_id, name) values ($1, 'Rabies vaccine') returning id`, [clinicA])).id;
  rule = (await one<{ id: string }>(`insert into recall_rules (clinic_id, service_category_id, interval_days, approved_by) values ($1, $2, 365, 'admin') returning id`, [clinicA, svc])).id;
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
    const ins = `insert into sends (clinic_id, contact_id, event_key, kind, asset_id, recall_rule_id, cycle_due_on, step_offset_days, channel, approved_by)
                 values ($1, $2, $3, 'recall', $4, $5, '2026-11-01', 0, 'sms', 'automation:1')`;
    const key = `recall:${asset}:${rule}:2026-11-01:0`;
    await db.query(ins, [clinicA, contact, key, asset, rule]);
    await rejects(ins, [clinicA, contact, key, asset, rule]);
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

  it("sender names are at most 11 characters", async () => {
    await rejects(`update clinics set sender_name = 'PAWCAREVETCLINIC' where id = $1`, [clinicA]);
  });
});
