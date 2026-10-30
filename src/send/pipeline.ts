import { checkEligibility, type ClinicPolicy, type ContactState, type SendKind, type BlockReason } from "../domain/eligibility.js";
import { buildFooter, checkContent, measureSms, normalizeForSms, type ContentIssue } from "../domain/sms.js";

/**
 * The only way to produce a text that can be sent. A PreparedSms has passed the eligibility gate,
 * the content checks, carries an approval and an event key, and has the footer (reply path +
 * stop link) appended. SemaphoreClient accepts nothing else, so no code path can skip these checks.
 */
const issued = new WeakSet<object>();

export interface PreparedSms {
  readonly kind: SendKind;        // derived from the event; write this to sends.kind
  readonly mobile: string;
  readonly body: string;          // includes footer
  readonly senderName: string;
  readonly segments: number;
  readonly eventKey: string;      // unique per (clinic, contact) in the sends table
}

export function isPrepared(sms: PreparedSms): boolean {
  return issued.has(sms);
}

/**
 * Locked decision 12: nothing reaches a patient without a human-approved campaign or automation.
 * An approval only covers the event it was given for (see requiredApproval).
 *  - campaign approval: one approved campaign. `sendingNow` = a person pressed send just now,
 *    which is the only case allowed to proceed while sync is stale.
 *  - automation approval: "recall-rule:<ruleId>", "reminders" or "feedback".
 */
export type Approval =
  | { type: "campaign"; campaignId: string; approvedBy: string; sendingNow?: boolean }
  | { type: "automation"; automationId: string; approvedBy: string };

/** What a send is about. Becomes the event key that the sends table keeps unique. */
export type SendEvent =
  | { type: "campaign"; campaignId: string }
  | { type: "recall"; assetId: string; ruleId: string; dueOn: string; stepOffsetDays: number }
  | { type: "reminder"; appointmentId: string; slot: "24h" | "2h" }
  | { type: "feedback"; visitId: string };

/**
 * The send kind comes from the event, never from the caller. Campaigns are always marketing
 * (core marketing = announcements). This is what makes consent, caps and the discount check
 * impossible to skip by mislabelling a send.
 */
export function kindOf(e: SendEvent): SendKind {
  switch (e.type) {
    case "campaign": return "marketing";
    case "recall": return "recall";
    case "reminder": return "reminder";
    case "feedback": return "feedback";
  }
}

/** The automation id an approval must carry for this event. */
export function requiredAutomation(e: SendEvent): string | null {
  switch (e.type) {
    case "campaign": return null;
    case "recall": return `recall-rule:${e.ruleId}`;
    case "reminder": return "reminders";
    case "feedback": return "feedback";
  }
}

function approvalCovers(a: Approval | null, e: SendEvent): boolean {
  if (!a || !a.approvedBy.trim()) return false;
  if (e.type === "campaign") return a.type === "campaign" && a.campaignId === e.campaignId;
  return a.type === "automation" && a.automationId === requiredAutomation(e);
}

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
  now: Date;
  approval: Approval | null;
  event: SendEvent;
  sentEventKeys: Set<string>;     // event keys already in the sends table for this contact
  body: string;                   // message without footer
  stopUrl: string;                // per-contact one-tap opt-out link
  stopLinkHost: string;           // our own domain
}

export function prepareSms(a: PrepareArgs): PrepareResult {
  const { clinic } = a;
  if (!approvalCovers(a.approval, a.event)) return { ok: false, reason: "not_approved" };
  const kind = kindOf(a.event);
  const manual = a.approval?.type === "campaign" && a.approval.sendingNow === true;
  const request = { kind, campaignId: a.event.type === "campaign" ? a.event.campaignId : null, automated: !manual, now: a.now };
  if (!clinic.senderName || !clinic.senderNameApproved) return { ok: false, reason: "sender_not_approved" };

  const key = eventKey(a.event);
  if (a.sentEventKeys.has(key)) return { ok: false, reason: "already_sent" };

  const gate = checkEligibility(a.contact, a.policy, request);
  if (!gate.ok) return gate.reason === "quiet_hours" ? { ok: false, reason: "quiet_hours", deferUntil: gate.deferUntil } : { ok: false, reason: gate.reason };
  if (!a.contact.mobile) return { ok: false, reason: "no_mobile" };

  const text = normalizeForSms(a.body).trim();
  const human = clinic.vertical !== "vet";
  const issues = checkContent(text, {
    kind,
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
  // The footer carries clinic-entered links (Messenger), so it gets the shortener check too.
  const footerIssues = checkContent(footer, { kind: "reminder", nameTreatmentsAllowed: true }).filter((i) => i.code === "url_shortener");
  if (footerIssues.length) return { ok: false, reason: "content", issues: footerIssues };
  const body = `${text}${footer}`;
  const sms: PreparedSms = Object.freeze({ kind, mobile: a.contact.mobile, body, senderName: clinic.senderName, segments: measureSms(body).segments, eventKey: key });
  issued.add(sms);
  return { ok: true, sms };
}
