import type { Db } from "./client.js";
import { loadCampaignApproval, loadClinicContext, loadContact, loadRecallRuleApproval } from "./send-context.js";
import { loadSendTarget } from "./send-target.js";
import { prepareSms, type Approval, type PrepareResult, type SendEvent } from "../send/pipeline.js";

/**
 * The database route to a PreparedSms: clinic, contact, approval, subject and names all come from
 * rows, so a caller supplies only which event and when. This is how automated sends are built.
 * Read-only; writing the sends row and calling the provider happen elsewhere.
 */
export interface PrepareFromDbArgs {
  clinicId: string;
  contactId: string;
  event: SendEvent;
  now: Date;
  stopUrl: string;
  stopLinkHost: string;
}

export type PrepareFromDbResult =
  | PrepareResult
  | { ok: false; reason: "clinic_not_found" | "unsupported_timezone" | "contact_not_found" | "event_not_found" | "asset_inactive" };

/** Reminders and feedback have no approval records yet, so they stay unapproved until they do. */
async function approvalFor(db: Db, clinicId: string, event: SendEvent, now: Date): Promise<Approval | null> {
  switch (event?.type) {
    case "campaign": return loadCampaignApproval(db, clinicId, event.campaignId, now);
    case "recall": return loadRecallRuleApproval(db, clinicId, event.ruleId);
    default: return null;
  }
}

export async function prepareFromDb(db: Db, a: PrepareFromDbArgs): Promise<PrepareFromDbResult> {
  const clinic = await loadClinicContext(db, a.clinicId, a.now);
  if (!clinic.ok) return clinic;
  const contact = await loadContact(db, a.clinicId, a.contactId);
  if (!contact.ok) return contact;
  const target = await loadSendTarget(db, a.clinicId, a.contactId, a.event);
  if (!target.ok) return target;
  return prepareSms({
    clinic: clinic.clinic.profile,
    contact: contact.contact,
    policy: clinic.clinic.policy,
    now: a.now,
    approval: await approvalFor(db, a.clinicId, a.event, a.now),
    event: a.event,
    subject: target.subject,
    sentEventKeys: contact.sentEventKeys,
    names: target.names,
    stopUrl: a.stopUrl,
    stopLinkHost: a.stopLinkHost,
  });
}
