import { importCsv, type ImportResult } from "../import/csv.js";

/** The one thing sync needs from a database; PGlite, pg and Supabase wrappers all fit. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export type SyncSource = "csv" | "google_sheet" | "webhook";

export interface SyncOutcome {
  ok: boolean;
  runId: string;
  errorCode: string | null;
  contactsAdded: number;
  contactsUpdated: number;
  contactsSkippedInactive: number;
  visitsAdded: number;
  result: ImportResult | null;
}

const today = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Reads a clinic file and writes it to the database, logging a sync run either way. The run is
 * what `syncHealth` reads, so a failed run pauses automated sends (locked decision 10).
 *
 * Clinics own patient status: an existing contact that is not active (moved, deceased, do not
 * contact) is never revived or changed by a sync. Muted numbers never get in (the import skips them).
 * Existing names are kept; a sync only fills in a missing email and adds visits.
 * Error codes are fixed words, never file content.
 */
export async function applySync(db: Db, clinicId: string, text: string, source: SyncSource, now = new Date()): Promise<SyncOutcome> {
  const run = (await db.query<{ id: string }>(
    `insert into sync_runs (clinic_id, source) values ($1, $2) returning id`, [clinicId, source])).rows[0]!;
  const out: SyncOutcome = { ok: false, runId: run.id, errorCode: null, contactsAdded: 0, contactsUpdated: 0, contactsSkippedInactive: 0, visitsAdded: 0, result: null };
  const finish = (rowsIn: number | null, rejected: number | null) => db.query(
    `update sync_runs set finished_at = now(), ok = $2, rows_in = $3, rows_rejected = $4, error_code = $5 where id = $1`,
    [run.id, out.ok, rowsIn, rejected, out.errorCode]);

  try {
    const clinic = (await db.query<{ vertical: "dental" | "vet" | "aesthetic" | "other" }>(`select vertical from clinics where id = $1`, [clinicId])).rows[0];
    if (!clinic) throw new SyncError("clinic_not_found");
    const mutes = (await db.query<{ kind: string; value: string }>(`select kind, value from mutes where clinic_id = $1`, [clinicId])).rows;
    const cats = (await db.query<{ id: string; name: string }>(`select id, name from service_categories where clinic_id = $1`, [clinicId])).rows;
    let result: ImportResult;
    try {
      result = importCsv(text, {
        muted: {
          mobiles: new Set(mutes.filter((m) => m.kind === "mobile").map((m) => m.value)),
          emails: new Set(mutes.filter((m) => m.kind === "email").map((m) => m.value)),
        },
        serviceCategories: cats.map((c) => c.name),
        dateBounds: { min: "2000-01-01", max: today(now) },
        vertical: clinic.vertical,
      });
    } catch {
      throw new SyncError("unreadable_file");
    }
    out.result = result;
    const catId = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));

    await db.query("begin");
    try {
      for (const row of result.rows) {
        const found = (await db.query<{ id: string; status: string; email: string | null }>(
          `select id, status, email from contacts where clinic_id = $1 and (($2::text is not null and mobile = $2) or ($3::text is not null and email = $3)) order by (mobile = $2) desc nulls last limit 1`,
          [clinicId, row.mobile, row.email])).rows[0];
        let contactId: string;
        if (found) {
          if (found.status !== "active") { out.contactsSkippedInactive++; continue; }
          contactId = found.id;
          if (!found.email && row.email) {
            const taken = (await db.query(`select 1 from contacts where clinic_id = $1 and email = $2`, [clinicId, row.email])).rows.length;
            if (!taken) { await db.query(`update contacts set email = $2 where id = $1`, [contactId, row.email]); out.contactsUpdated++; }
          }
        } else {
          contactId = (await db.query<{ id: string }>(
            `insert into contacts (clinic_id, full_name, mobile, email, external_ref) values ($1, $2, $3, $4, $5) returning id`,
            [clinicId, row.fullName, row.mobile, row.email, row.externalRef])).rows[0]!.id;
          out.contactsAdded++;
        }
        const label = row.assetKind === "self" ? "Self" : row.assetLabel ?? "Other";
        const kind = row.assetKind;
        let assetId = (await db.query<{ id: string }>(
          `select id from assets where clinic_id = $1 and contact_id = $2 and kind = $3 and lower(label) = lower($4)`,
          [clinicId, contactId, kind, label])).rows[0]?.id;
        if (!assetId) {
          assetId = (await db.query<{ id: string }>(
            `insert into assets (clinic_id, contact_id, kind, label, species) values ($1, $2, $3, $4, $5) returning id`,
            [clinicId, contactId, kind, label, row.species])).rows[0]!.id;
        }
        const svc = row.serviceCategory ? catId.get(row.serviceCategory.toLowerCase()) : undefined;
        if (svc && row.lastVisitOn) {
          const added = (await db.query(
            `insert into visits (clinic_id, asset_id, service_category_id, visited_on, source)
             select $1, $2, $3, $4, $5 where not exists
               (select 1 from visits where asset_id = $2 and service_category_id = $3 and visited_on = $4) returning id`,
            [clinicId, assetId, svc, row.lastVisitOn, source])).rows.length;
          out.visitsAdded += added;
        }
      }
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
    out.ok = true;
    await finish(result.rows.length, result.rejected.length);
  } catch (e) {
    out.ok = false;
    out.errorCode = e instanceof SyncError ? e.code : "apply_failed";
    await finish(out.result?.rows.length ?? null, out.result?.rejected.length ?? null);
  }
  return out;
}

class SyncError extends Error {
  constructor(public code: string) { super(code); }
}
