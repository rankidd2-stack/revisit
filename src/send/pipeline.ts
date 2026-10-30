import { checkEligibility, type ClinicPolicy, type ContactState, type SendRequest, type BlockReason } from "../domain/eligibility.js";
import { buildFooter, checkContent, measureSms, type ContentIssue } from "../domain/sms.js";

/**
 * The only way to produce a text that can be sent. A PreparedSms has passed the eligibility gate,
 * the content checks and has the footer (reply path + stop link) appended. SemaphoreClient accepts
 * nothing else, so no code path can skip these checks.
 */
const issued = new WeakSet<object>();

export interface PreparedSms {
  readonly mobile: string;
  readonly body: string;          // includes footer
  readonly senderName: string;
  readonly segments: number;
}

export function isPrepared(sms: PreparedSms): boolean {
  return issued.has(sms);
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
  | { ok: false; reason: "sender_not_approved" | "no_reply_path" }
  | { ok: false; reason: BlockReason | "quiet_hours"; deferUntil?: Date }
  | { ok: false; reason: "content"; issues: ContentIssue[] };

export interface PrepareArgs {
  clinic: ClinicSendProfile;
  contact: ContactState & { mobile: string | null };
  policy: ClinicPolicy;
  request: SendRequest;
  body: string;                   // message without footer
  stopUrl: string;                // per-contact one-tap opt-out link
}

export function prepareSms(a: PrepareArgs): PrepareResult {
  const { clinic } = a;
  if (!clinic.senderName || !clinic.senderNameApproved) return { ok: false, reason: "sender_not_approved" };

  const gate = checkEligibility(a.contact, a.policy, a.request);
  if (!gate.ok) return gate.reason === "quiet_hours" ? { ok: false, reason: "quiet_hours", deferUntil: gate.deferUntil } : { ok: false, reason: gate.reason };
  if (!a.contact.mobile) return { ok: false, reason: "no_mobile" };

  const human = clinic.vertical !== "vet";
  const issues = checkContent(a.body, {
    kind: a.request.kind,
    vertical: clinic.vertical,
    nameTreatmentsAllowed: clinic.nameTreatmentsAllowed,
    sensitiveTerms: human ? clinic.serviceCategories : [],
  });
  if (issues.length) return { ok: false, reason: "content", issues };

  let footer: string;
  try {
    footer = buildFooter({ replyPhone: clinic.replyPhone, replyEmail: clinic.replyEmail, messengerUrl: clinic.messengerUrl, stopUrl: a.stopUrl });
  } catch {
    return { ok: false, reason: "no_reply_path" };
  }
  const body = `${a.body.trim()}${footer}`;
  const sms: PreparedSms = Object.freeze({ mobile: a.contact.mobile, body, senderName: clinic.senderName, segments: measureSms(body).segments });
  issued.add(sms);
  return { ok: true, sms };
}
