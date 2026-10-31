import { isUuid, type Db } from "./client.js";
import type { SendEvent, Subject } from "../send/pipeline.js";

/**
 * Who a text is about, and the raw names it may carry, read from the database for one event.
 * The caller never supplies these (G16, G33): the subject comes from assets.kind of the event's
 * asset, the names from the contact and asset records. Read-only.
 */
export interface SendTarget {
  subject: Subject;
  /** Raw names for prepareSms, which cleans them. `asset` is set only for a pet. */
  names: { contact: string; asset: string | null };
}

export type SendTargetResult =
  | ({ ok: true } & SendTarget)
  | { ok: false; reason: "contact_not_found" | "event_not_found" | "asset_inactive" };

const KINDS: ReadonlySet<string> = new Set<Subject>(["self", "dependent", "pet", "package", "other"]);

interface AssetRow { kind: string; label: string; active: boolean }

export async function loadSendTarget(db: Db, clinicId: string, contactId: string, event: SendEvent): Promise<SendTargetResult> {
  if (!isUuid(clinicId) || !isUuid(contactId)) return { ok: false, reason: "contact_not_found" };
  const [c] = (await db.query<{ full_name: string }>(
    `select full_name from contacts where clinic_id = $1 and id = $2`, [clinicId, contactId])).rows;
  if (!c) return { ok: false, reason: "contact_not_found" };

  // Campaigns are announcements to the contact, not about one asset. A contact who brings in another
  // person (a child, a parent, a package that may be a child's) is treated as "other": strict rules,
  // so a broadcast can never read as a remark about that person's care. Inactive assets count too.
  if (event?.type === "campaign") {
    if (!isUuid(event.campaignId)) return { ok: false, reason: "event_not_found" };
    const [o] = (await db.query<{ n: number }>(
      `select count(*)::int as n from assets where clinic_id = $1 and contact_id = $2 and kind not in ('self', 'pet')`,
      [clinicId, contactId])).rows;
    return { ok: true, subject: (o?.n ?? 0) > 0 ? "other" : "self", names: { contact: c.full_name, asset: null } };
  }

  // Every other event names one asset, through the event's own row. The asset must belong to this
  // contact in this clinic, so an event can't borrow another contact's pet or another clinic's row.
  let rows: AssetRow[];
  switch (event?.type) {
    case "recall":
      if (!isUuid(event.assetId)) return { ok: false, reason: "event_not_found" };
      rows = (await db.query<AssetRow>(
        `select kind, label, active from assets where clinic_id = $1 and contact_id = $2 and id = $3`,
        [clinicId, contactId, event.assetId])).rows;
      break;
    case "reminder":
      if (!isUuid(event.appointmentId)) return { ok: false, reason: "event_not_found" };
      rows = (await db.query<AssetRow>(
        `select a.kind, a.label, a.active from appointments ap join assets a on a.clinic_id = ap.clinic_id and a.id = ap.asset_id
          where ap.clinic_id = $1 and a.contact_id = $2 and ap.id = $3`,
        [clinicId, contactId, event.appointmentId])).rows;
      break;
    case "feedback":
      if (!isUuid(event.visitId)) return { ok: false, reason: "event_not_found" };
      rows = (await db.query<AssetRow>(
        `select a.kind, a.label, a.active from visits v join assets a on a.clinic_id = v.clinic_id and a.id = v.asset_id
          where v.clinic_id = $1 and a.contact_id = $2 and v.id = $3`,
        [clinicId, contactId, event.visitId])).rows;
      break;
    default:
      return { ok: false, reason: "event_not_found" };
  }
  const a = rows[0];
  if (!a) return { ok: false, reason: "event_not_found" };
  // An inactive asset (a pet that died, a dependent the clinic no longer sees) gets no texts at all.
  if (!a.active) return { ok: false, reason: "asset_inactive" };
  // An unknown kind is "other": strict. Only a pet's label may fill {pet_name}; a dependent's name
  // never goes into a text sent to a family number.
  const subject: Subject = KINDS.has(a.kind) ? (a.kind as Subject) : "other";
  return { ok: true, subject, names: { contact: c.full_name, asset: subject === "pet" ? a.label : null } };
}
