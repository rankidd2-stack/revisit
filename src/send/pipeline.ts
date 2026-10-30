import { checkEligibility, type ClinicPolicy, type ContactState, type SendRequest, type BlockReason } from "../domain/eligibility.js";
import { buildFooter, checkContent, measureSms, normalizeForSms, type ContentIssue } from "../domain/sms.js";

/**
 * The only way to produce a text that can be sent. A PreparedSms has passed the eligibility gate,
 * the content checks, carries an approval and an event key, and has the footer (reply path +
 * stop link) appended. SemaphoreClient accepts nothing else, so no code path can skip these checks.
 */
const issued = new WeakSet<object>();

export interface PreparedSms {
  readonly mobile: string;
  readonly body: string;          // includes footer
  readonly senderName: string;
  readonly segments: number;
  readonly eventKey: string;      // unique per (clinic, contact) in the sends table
}

export function isPrepared(sms: PreparedSms): boolean {
  return issued.has(sms);
}

/** Locked decision 12: nothing reaches a patient without a human-approved campaign or automation. */
export type Approval =
  | { type: "campaign"; campaignId: string; approvedBy: string }
  | { type: "automation"; automationId: string; approvedBy: string };

/** What a send is about. Becomes the event key that the sends table keeps unique. */
export type SendEvent =
  | { type: "campaign"; campaignId: string }
  | { type: "recall"; assetId: string; ruleId: string; dueOn: string; stepOffsetDays: number }
  | { type: "reminder"; appointmentId: string; slot: "24h" | "2h" }
  | { type: "feedback"; visitId: string };

export function eventKey(e: SendEvent): string {
  switch (e.type) {
    case "campaign": return `campaign:${e.campaignId}`;
    case "recall": return `recall:${e.assetId}:${e.ruleId}:${e.dueOn}:${e.stepOffsetDays}`;
    case "reminder": return `reminder:${e.appointmentId}:${e.slot}`;
    case "feedback": return `feedback:${e.visitId}`;
  }
}

export interface ClinicSendProfile {
  vertical: "dental" | "vet" | "aesthetic" | "other";
  senderName: string | null;
  senderNameApproved: boolean;
  nameTreatmentsAllowed: boolean;
  replyPhone?: string | null;
  replyEmail?: string | null;
  messengerUrl?: string | null;
  serviceCategories: string[];
}

export type PrepareResult =
  | { ok: true; sms: PreparedSms }
  | { ok: false; reason: "not_approved" | "sender_not_approved" | "no_reply_path" | "bad_stop_link" | "already_sent" }
  | { ok: false; reason: BlockReason | "quiet_hours"; deferUntil?: Date }
  | { ok: false; reason: "content"; issues: ContentIssue[] };

export interface PrepareArgs {
  clinic: ClinicSendProfile;
  contact: ContactState & { mobile: string | null };
  policy: ClinicPolicy;
  request: SendRequest;
  approval: Approval | null;
  event: SendEvent;
  sentEventKeys: Set<string>;     // event keys already in the sends table for this contact
  body: string;                   // message without footer
  stopUrl: string;                // per-contact one-tap opt-out link
  stopLinkHost: string;           // our own domain
}

export function prepareSms(a: PrepareArgs): PrepareResult {
  const { clinic } = a;
  if (!a.approval || !a.approval.approvedBy.trim()) return { ok: false, reason: "not_approved" };
  if (a.event.type === "campaign" && (a.approval.type !== "campaign" || a.approval.campaignId !== a.event.campaignId)) {
    return { ok: false, reason: "not_approved" };
  }
  if (!clinic.senderName || !clinic.senderNameApproved) return { ok: false, reason: "sender_not_approved" };

  const key = eventKey(a.event);
  if (a.sentEventKeys.has(key)) return { ok: false, reason: "already_sent" };

  const gate = checkEligibility(a.contact, a.policy, a.request);
  if (!gate.ok) return gate.reason === "quiet_hours" ? { ok: false, reason: "quiet_hours", deferUntil: gate.deferUntil } : { ok: false, reason: gate.reason };
  if (!a.contact.mobile) return { ok: false, reason: "no_mobile" };

  const text = normalizeForSms(a.body).trim();
  const human = clinic.vertical !== "vet";
  const issues = checkContent(text, {
    kind: a.request.kind,
    vertical: clinic.vertical,
    nameTreatmentsAllowed: clinic.nameTreatmentsAllowed,
    sensitiveTerms: human ? clinic.serviceCategories : [],
  });
  if (issues.length) return { ok: false, reason: "content", issues };

  let footer: string;
  try {
    footer = buildFooter({ replyPhone: clinic.replyPhone, replyEmail: clinic.replyEmail, messengerUrl: clinic.messengerUrl, stopUrl: a.stopUrl, stopLinkHost: a.stopLinkHost });
  } catch (e) {
    return { ok: false, reason: String((e as Error).message).startsWith("Stop link") ? "bad_stop_link" : "no_reply_path" };
  }
  const body = `${text}${footer}`;
  const sms: PreparedSms = Object.freeze({ mobile: a.contact.mobile, body, senderName: clinic.senderName, segments: measureSms(body).segments, eventKey: key });
  issued.add(sms);
  return { ok: true, sms };
}
