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
  readonly staleAcknowledgedBy: string | null;  // write to sends.stale_ack_by
}

export function isPrepared(sms: PreparedSms): boolean {
  return issued.has(sms);
}

/**
 * Locked decision 12: nothing reaches a patient without a human-approved campaign or automation.
 * An approval covers one event AND the exact template the person approved. The pipeline renders
 * the text itself from that template, so the words a patient gets are the words someone approved.
 *  - campaign approval: one approved campaign. `staleAcknowledgedBy` = a named person pressed send
 *    after seeing that sync is stale; the only way to send while sync is stale. Never set by a scheduler.
 *  - automation approval: "recall-rule:<ruleId>", "reminders" or "feedback".
 * Build approvals only from database rows (campaigns.body / recall_rules.template + approved_by).
 */
export type Approval =
  | { type: "campaign"; campaignId: string; approvedBy: string; template: string; staleAcknowledgedBy?: string }
  | { type: "automation"; automationId: string; approvedBy: string; template: string };

/** What a send is about. Becomes the event key that the sends table keeps unique. */
export type SendEvent =
  | { type: "campaign"; campaignId: string }
  | { type: "recall"; assetId: string; ruleId: string; dueOn: string; stepOffsetDays: number }
  | { type: "reminder"; appointmentId: string; slot: "24h" | "2h" }
  | { type: "feedback"; visitId: string };

/** Who the text is about. Texts about a dependent never name a treatment (DPA s.13). */
export type Subject = "self" | "dependent" | "pet" | "package" | "other";

const unknownEvent = (e: never): never => { throw new Error(`Unknown send event type: ${String((e as { type?: unknown })?.type)}`); };

/**
 * The send kind comes from the event, never from the caller. Campaigns are always marketing
 * (core marketing = announcements). Unknown event types throw (queue payloads are untyped JSON).
 */
export function kindOf(e: SendEvent): SendKind {
  switch (e?.type) {
    case "campaign": return "marketing";
    case "recall": return "recall";
    case "reminder": return "reminder";
    case "feedback": return "feedback";
    default: return unknownEvent(e);
  }
}

/** The automation id an approval must carry for this event. */
export function requiredAutomation(e: SendEvent): string | null {
  switch (e?.type) {
    case "campaign": return null;
    case "recall": return `recall-rule:${e.ruleId}`;
    case "reminder": return "reminders";
    case "feedback": return "feedback";
    default: return unknownEvent(e);
  }
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function approvalCovers(a: Approval | null, e: SendEvent): boolean {
  if (!a || !nonEmpty(a.approvedBy) || !nonEmpty(a.template)) return false;
  if (e.type === "campaign") return a.type === "campaign" && nonEmpty(a.campaignId) && a.campaignId === e.campaignId;
  const need = requiredAutomation(e);
  return a.type === "automation" && nonEmpty(a.automationId) && a.automationId === need;
}

export function eventKey(e: SendEvent): string {
  switch (e?.type) {
    case "campaign": return `campaign:${e.campaignId}`;
    case "recall": return `recall:${e.assetId}:${e.ruleId}:${e.dueOn}:${e.stepOffsetDays}`;
    case "reminder": return `reminder:${e.appointmentId}:${e.slot}`;
    case "feedback": return `feedback:${e.visitId}`;
    default: return unknownEvent(e);
  }
}

/** Fills {first_name}, {pet_name}, {clinic} and similar. Values are single-line and short, and an
 *  unknown or missing placeholder refuses the send rather than going out with a gap. */
export function renderTemplate(template: string, vars: Record<string, string>): string | null {
  let missing = false;
  const out = template.replace(/\{([a-z_]+)\}/g, (_, name: string) => {
    const v = vars[name];
    if (typeof v !== "string" || !v.trim()) { missing = true; return ""; }
    return v.replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);
  });
  return missing ? null : out;
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
  | { ok: false; reason: "not_approved" | "sender_not_approved" | "no_reply_path" | "bad_stop_link" | "already_sent" | "bad_mobile" | "missing_variable" }
  | { ok: false; reason: BlockReason | "quiet_hours"; deferUntil?: Date }
  | { ok: false; reason: "content"; issues: ContentIssue[] };

export interface PrepareArgs {
  clinic: ClinicSendProfile;
  contact: ContactState & { mobile: string | null };
  policy: ClinicPolicy;
  now: Date;
  approval: Approval | null;
  event: SendEvent;
  subject?: Subject;              // who the text is about; default "self"
  sentEventKeys: Set<string>;     // event keys already in the sends table for this contact
  vars: Record<string, string>;   // values for the approved template's placeholders
  stopUrl: string;                // per-contact one-tap opt-out link
  stopLinkHost: string;           // our own domain
}

const MOBILE_RE = /^639\d{9}$/;

export function prepareSms(a: PrepareArgs): PrepareResult {
  const { clinic } = a;
  if (!approvalCovers(a.approval, a.event)) return { ok: false, reason: "not_approved" };
  const approval = a.approval!;
  const kind = kindOf(a.event);
  const staleAck = approval.type === "campaign" && nonEmpty(approval.staleAcknowledgedBy);
  const request = { kind, campaignId: a.event.type === "campaign" ? a.event.campaignId : null, automated: !staleAck, now: a.now };
  if (!clinic.senderName || !clinic.senderNameApproved) return { ok: false, reason: "sender_not_approved" };

  const key = eventKey(a.event);
  if (a.sentEventKeys.has(key)) return { ok: false, reason: "already_sent" };

  const gate = checkEligibility(a.contact, a.policy, request);
  if (!gate.ok) return gate.reason === "quiet_hours" ? { ok: false, reason: "quiet_hours", deferUntil: gate.deferUntil } : { ok: false, reason: gate.reason };
  if (!a.contact.mobile) return { ok: false, reason: "no_mobile" };
  if (!MOBILE_RE.test(a.contact.mobile)) return { ok: false, reason: "bad_mobile" };

  const rendered = renderTemplate(approval.template, a.vars);
  if (rendered === null) return { ok: false, reason: "missing_variable" };
  const text = normalizeForSms(rendered).trim();
  const human = clinic.vertical !== "vet";
  const aboutSomeoneElse = (a.subject ?? "self") === "dependent";
  const issues = checkContent(text, {
    kind,
    vertical: clinic.vertical,
    nameTreatmentsAllowed: clinic.nameTreatmentsAllowed && !aboutSomeoneElse,
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
  const sms: PreparedSms = Object.freeze({
    kind, mobile: a.contact.mobile, body, senderName: clinic.senderName, segments: measureSms(body).segments, eventKey: key,
    staleAcknowledgedBy: staleAck ? (approval as { staleAcknowledgedBy: string }).staleAcknowledgedBy : null,
  });
  issued.add(sms);
  return { ok: true, sms };
}
