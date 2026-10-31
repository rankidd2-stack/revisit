import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { applySync } from "../src/sync/apply.js";
import { syncHealth } from "../src/sync/health.js";
import { fetchSheetCsv, sheetCsvUrl, sheetIdFromLink, syncSheet } from "../src/sync/sheet.js";

const now = new Date("2026-10-30T02:00:00Z");
let db: PGlite, clinic: string;
const count = async (t: string) => Number((await db.query<{ n: string }>(`select count(*) n from ${t}`)).rows[0]!.n);

beforeEach(async () => {
  db = new PGlite();
  const dir = new URL("../db/migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));
  clinic = (await db.query<{ id: string }>(`insert into clinics (name, vertical) values ('Paw Care', 'vet') returning id`)).rows[0]!.id;
  await db.query(`insert into service_categories (clinic_id, name) values ($1, 'Rabies vaccine')`, [clinic]);
});

const FILE = "Owner,Mobile,Pet,Species,Service,Last visit\nAna Cruz,09171234567,Bantay,dog,Rabies vaccine,2026-06-01\n";

describe("applySync", () => {
  it("writes contacts, pets and visits and logs an ok run", async () => {
    const o = await applySync(db, clinic, FILE, "csv", now);
    expect(o).toMatchObject({ ok: true, contactsAdded: 1, visitsAdded: 1 });
    expect(await count("contacts")).toBe(1);
    expect(await count("assets")).toBe(1);
    const run = (await db.query<{ ok: boolean; rows_in: number }>(`select ok, rows_in from sync_runs`)).rows[0]!;
    expect(run).toMatchObject({ ok: true, rows_in: 1 });
  });

  it("is idempotent: syncing the same file twice adds nothing", async () => {
    await applySync(db, clinic, FILE, "csv", now);
    const o = await applySync(db, clinic, FILE, "csv", now);
    expect(o).toMatchObject({ ok: true, contactsAdded: 0, visitsAdded: 0 });
    expect(await count("contacts")).toBe(1);
    expect(await count("assets")).toBe(1);
    expect(await count("visits")).toBe(1);
  });

  it("never re-adds a muted number", async () => {
    await db.query(`insert into mutes (clinic_id, kind, value, reason) values ($1, 'mobile', '639171234567', 'stop_link')`, [clinic]);
    const o = await applySync(db, clinic, FILE, "csv", now);
    expect(o.result!.skippedMuted).toBe(1);
    expect(await count("contacts")).toBe(0);
  });

  it("leaves clinic-owned status alone: a do_not_contact contact is not revived or given visits", async () => {
    await db.query(`insert into contacts (clinic_id, full_name, mobile, status) values ($1, 'Ana Cruz', '639171234567', 'do_not_contact')`, [clinic]);
    const o = await applySync(db, clinic, FILE, "csv", now);
    expect(o.contactsSkippedInactive).toBe(1);
    expect((await db.query<{ status: string }>(`select status from contacts`)).rows[0]!.status).toBe("do_not_contact");
    expect(await count("visits")).toBe(0);
  });

  it("keeps the clinic's name for an existing contact and fills a missing email", async () => {
    await db.query(`insert into contacts (clinic_id, full_name, mobile) values ($1, 'Ana C.', '639171234567')`, [clinic]);
    await applySync(db, clinic, "Owner,Mobile,Email,Pet,Service,Last visit\nAna Cruz,09171234567,ana@x.com,Bantay,Rabies vaccine,2026-06-01\n", "csv", now);
    const c = (await db.query<{ full_name: string; email: string }>(`select full_name, email from contacts`)).rows[0]!;
    expect(c).toEqual({ full_name: "Ana C.", email: "ana@x.com" });
  });

  it("logs a failed run with a fixed code and no file content when the file is unreadable", async () => {
    const o = await applySync(db, clinic, 'Owner,Mobile\n"Ana,0917', "csv", now);
    expect(o).toMatchObject({ ok: false, errorCode: "unreadable_file" });
    const run = (await db.query<{ ok: boolean; error_code: string }>(`select ok, error_code from sync_runs`)).rows[0]!;
    expect(run).toEqual({ ok: false, error_code: "unreadable_file" });
    expect(await count("contacts")).toBe(0);
  });

  it("a failed sync pauses automated sends via syncHealth, a later good one resumes them", async () => {
    const runs = async () => (await db.query<{ finished_at: Date; ok: boolean }>(`select finished_at, ok from sync_runs`)).rows
      .map((r) => ({ finishedAt: new Date(r.finished_at), ok: r.ok }));
    await applySync(db, clinic, "garbage with no name column\n1\n", "csv", new Date());
    expect(syncHealth(await runs(), new Date())).toMatchObject({ healthy: false });
    await new Promise((r) => setTimeout(r, 5));
    await applySync(db, clinic, FILE, "csv", new Date());
    expect(syncHealth(await runs(), new Date())).toMatchObject({ healthy: true });
  });

  it("rolls back everything if a write fails midway", async () => {
    // force a failure after the contact and pet rows are written
    await db.exec(`alter table visits rename to visits_x`);
    const o = await applySync(db, clinic, FILE, "csv", now);
    expect(o).toMatchObject({ ok: false, errorCode: "apply_failed" });
    expect(await count("contacts")).toBe(0);
    expect(await count("assets")).toBe(0);
  });
});

describe("data hygiene and sheet sync", () => {
  it("keeps notes out of names and refs, and ignores note/diagnosis columns", async () => {
    await applySync(db, clinic, "Owner,Mobile,Id,Diagnosis,Notes\nAna Cruz (HIV+),09171234567,has a long ref with spaces,rabies,biter\n", "csv", now);
    const c = (await db.query<{ full_name: string; external_ref: string | null }>(`select full_name, external_ref from contacts`)).rows[0]!;
    expect(c).toEqual({ full_name: "Ana Cruz", external_ref: null });
    expect(JSON.stringify((await db.query(`select * from contacts`)).rows)).not.toMatch(/rabies|biter/);
  });
  it("treats a file with no usable rows as a failed run", async () => {
    expect(await applySync(db, clinic, "Owner,Mobile\n", "csv", now)).toMatchObject({ ok: false, errorCode: "no_usable_rows" });
  });
  it("never inserts a muted email, including email-only rows", async () => {
    await db.query(`insert into mutes (clinic_id, kind, value, reason) values ($1, 'email', 'ana@x.com', 'stop_link')`, [clinic]);
    const o = await applySync(db, clinic, "Owner,Email,Pet,Service,Last visit\nAna Cruz,ana@x.com,Bantay,Rabies vaccine,2026-06-01\nBen Lim,ben@x.com,Rex,Rabies vaccine,2026-06-01\n", "csv", now);
    expect(o.contactsAdded).toBe(1);
    expect(await count("contacts")).toBe(1);
  });
  it("a failed sheet fetch logs a failed run, so syncHealth pauses sends", async () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    const bad = async () => ({ ok: false, status: 500, text: async () => "" });
    expect(await syncSheet(db, clinic, bad, id, "0", now)).toMatchObject({ ok: false, errorCode: "sheet_http_500" });
    const r = (await db.query<{ finished_at: Date; ok: boolean; error_code: string }>(`select finished_at, ok, error_code from sync_runs`)).rows;
    expect(r[0]).toMatchObject({ ok: false, error_code: "sheet_http_500" });
    expect(syncHealth(r.map((x) => ({ finishedAt: new Date(x.finished_at), ok: x.ok })), new Date())).toMatchObject({ healthy: false, reason: "never_synced" });
  });
  it("accepts visits dated today in Manila when it is still yesterday in UTC", async () => {
    const o = await applySync(db, clinic, FILE.replace("2026-06-01", "2026-10-31"), "csv", new Date("2026-10-30T17:00:00Z"));
    expect(o).toMatchObject({ ok: true, visitsAdded: 1 });
  });
  it("leaves moved and deceased contacts untouched and reports email conflicts", async () => {
    await db.query(`insert into contacts (clinic_id, full_name, mobile, status) values ($1, 'A', '639171234567', 'deceased')`, [clinic]);
    await db.query(`insert into contacts (clinic_id, full_name, mobile, email) values ($1, 'B', '639181111111', 'b@x.com')`, [clinic]);
    const o = await applySync(db, clinic, "Owner,Mobile,Email,Pet,Service,Last visit\nAna,09171234567,,Bantay,Rabies vaccine,2026-06-01\nBea,09192222222,b@x.com,Rex,Rabies vaccine,2026-06-01\n", "csv", now);
    expect(o).toMatchObject({ contactsSkippedInactive: 1, conflicts: 1, visitsAdded: 0 });
  });
  it("adds a new visit and a new pet for an existing contact", async () => {
    await applySync(db, clinic, FILE, "csv", now);
    await applySync(db, clinic, FILE.replace("2026-06-01", "2026-09-01") + "Ana Cruz,09171234567,Mimi,cat,Rabies vaccine,2026-09-02\n", "csv", now);
    expect(await count("contacts")).toBe(1);
    expect(await count("assets")).toBe(2);
    expect(await count("visits")).toBe(3);
  });
  it("keeps two clinics' contacts apart", async () => {
    const other = (await db.query<{ id: string }>(`insert into clinics (name, vertical) values ('Other', 'vet') returning id`)).rows[0]!.id;
    await applySync(db, clinic, FILE, "csv", now);
    expect(await applySync(db, other, FILE, "csv", now)).toMatchObject({ ok: true, contactsAdded: 1 });
    expect(await count("contacts")).toBe(2);
  });
  it("keeps a patient ID only when it looks like a code", async () => {
    await applySync(db, clinic, "Owner,Mobile,Id\nAna,09171234567,P-0042\nBen,09181234567,allergic-penicillin\nCy,09191234567,HIV+\n", "csv", now);
    const refs = (await db.query<{ external_ref: string | null }>(`select external_ref from contacts order by full_name`)).rows.map((r) => r.external_ref);
    expect(refs).toEqual(["P-0042", null, null]);
  });
  it("adds the contact but no visit when the service is not one of the clinic's", async () => {
    const o = await applySync(db, clinic, FILE.replace("Rabies vaccine", "Grooming"), "csv", now);
    expect(o).toMatchObject({ ok: true, contactsAdded: 1, visitsAdded: 0 });
    expect(await count("visits")).toBe(0);
  });
  it("the database refuses a second visit for the same pet, service and day", async () => {
    await applySync(db, clinic, FILE, "csv", now);
    const v = (await db.query<{ clinic_id: string; asset_id: string; service_category_id: string; visited_on: string }>(`select clinic_id, asset_id, service_category_id, visited_on from visits`)).rows[0]!;
    await expect(db.query(`insert into visits (clinic_id, asset_id, service_category_id, visited_on, source) values ($1, $2, $3, $4, 'csv')`,
      [v.clinic_id, v.asset_id, v.service_category_id, v.visited_on])).rejects.toThrow();
  });
  it("stores a fetcher error that is not a fixed code as sheet_fetch_failed", async () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    const boom = async (): Promise<never> => { throw new Error("connect ECONNREFUSED 10.0.0.1:443 for Ana Cruz"); };
    expect(await syncSheet(db, clinic, boom, id, "0", now)).toMatchObject({ ok: false, errorCode: "sheet_fetch_failed" });
    expect((await db.query<{ error_code: string }>(`select error_code from sync_runs`)).rows[0]!.error_code).toBe("sheet_fetch_failed");
  });
  it("applies a good sheet", async () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    const good = async () => ({ ok: true, status: 200, text: async () => FILE });
    expect(await syncSheet(db, clinic, good, id, "0", now)).toMatchObject({ ok: true, contactsAdded: 1 });
  });
});

describe("google sheet fetch", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
  it("builds an export url only for well-formed ids and tabs", () => {
    expect(sheetCsvUrl(id)).toBe(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=0`);
    expect(() => sheetCsvUrl("../../evil")).toThrow("bad_sheet_id");
    expect(() => sheetCsvUrl(id, "0&x=1")).toThrow("bad_sheet_tab");
  });
  it("pulls the id from a pasted link", () => {
    expect(sheetIdFromLink(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toEqual({ id, gid: "0" });
    expect(sheetIdFromLink(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=123`)).toEqual({ id, gid: "123" });
    expect(sheetIdFromLink(id)).toEqual({ id, gid: "0" });
    expect(sheetIdFromLink("nope")).toBeNull();
  });
  it("reports private sheets, http errors and oversize files as codes", async () => {
    const f = (ok: boolean, status: number, body: string) => async () => ({ ok, status, text: async () => body });
    await expect(fetchSheetCsv(f(true, 200, "<!DOCTYPE html><html>sign in"), id)).rejects.toThrow("sheet_not_shared");
    await expect(fetchSheetCsv(f(false, 404, ""), id)).rejects.toThrow("sheet_http_404");
    await expect(fetchSheetCsv(f(true, 200, "a".repeat(5_000_001)), id)).rejects.toThrow("sheet_too_large");
    await expect(fetchSheetCsv(f(true, 200, "Name\nAna"), id)).resolves.toBe("Name\nAna");
  });
});
