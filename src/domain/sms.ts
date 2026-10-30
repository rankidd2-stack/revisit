// SMS sizing, footer and content checks. Pure functions.

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€\f";

export interface SmsSize {
  encoding: "GSM-7" | "UCS-2";
  units: number;          // septets (GSM-7) or UTF-16 code units (UCS-2)
  segments: number;
  perSegment: number;
}

/**
 * Packs characters into segments greedily, never splitting a GSM escape pair or a UTF-16
 * surrogate pair across a segment boundary (which is what real handsets and gateways do).
 */
function pack(sizes: number[], single: number, multi: number): number {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  if (total <= single) return 1;
  let segments = 1;
  let used = 0;
  for (const s of sizes) {
    if (used + s > multi) { segments++; used = 0; }
    used += s;
  }
  return segments;
}

export function measureSms(text: string): SmsSize {
  const chars = [...text];
  const gsm = chars.every((ch) => GSM7_BASIC.includes(ch) || GSM7_EXTENDED.includes(ch));
  if (gsm) {
    const sizes = chars.map((ch) => (GSM7_EXTENDED.includes(ch) ? 2 : 1));
    const units = sizes.reduce((a, b) => a + b, 0);
    return { encoding: "GSM-7", units, segments: pack(sizes, 160, 153), perSegment: units <= 160 ? 160 : 153 };
  }
  const sizes = chars.map((ch) => ch.length); // emoji and other astral chars are 2 code units
  const units = sizes.reduce((a, b) => a + b, 0);
  return { encoding: "UCS-2", units, segments: pack(sizes, 70, 67), perSegment: units <= 70 ? 70 : 67 };
}

/**
 * Replaces characters that silently force UCS-2 (and roughly triple the cost) with GSM-7
 * equivalents. AI drafts are full of curly quotes and long dashes.
 */
export function normalizeForSms(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ");
}

/** Cost in PHP centavos for one recipient. Default Semaphore rate P0.56 per segment, ex VAT. */
export function smsCostCentavos(text: string, centavosPerSegment = 56): number {
  return measureSms(text).segments * centavosPerSegment;
}

export interface FooterInput {
  replyPhone?: string | null;
  replyEmail?: string | null;
  messengerUrl?: string | null;
  stopUrl: string;
  stopLinkHost: string;   // our own domain; stop links never point anywhere else
}

const present = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Every text ends with a reply path and a stop link on our own domain (locked decision 2). */
export function buildFooter(f: FooterInput): string {
  const reply = present(f.replyPhone) ?? present(f.messengerUrl) ?? present(f.replyEmail);
  if (!reply) throw new Error("Clinic has no reply path (phone, Messenger or email)");
  let url: URL;
  try { url = new URL(f.stopUrl); } catch { throw new Error("Stop link is not a valid URL"); }
  if (url.protocol !== "https:" || url.hostname !== f.stopLinkHost || url.pathname.length < 3) {
    throw new Error(`Stop link must be an https link on ${f.stopLinkHost}`);
  }
  return `\nReply: ${reply}\nStop msgs: ${url.toString()}`;
}

const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "s.id", "tiny.cc", "rebrand.ly", "t.ly", "buff.ly"]);
const DISCOUNT_WORDS = [
  /%\s*off/i, /\bsale\b/i, /\bpromo\b/i, /\bdiscount/i, /\bfree with\b/i, /\bbuy\s*1\b/i, /\bless\s+\d/i,
  /\bcodes?\b/i, /\bvouchers?\b/i, /\brewards?\b/i, /\bpoints\b/i, /\bstamps?\b/i, /\braffle/i, /\bcashback\b/i,
  /(?:p|php|₱)\s?\d[\d,]*\s*off/i, /\bbawas\b/i, /\blibre\s+(?:ang|na|sa)\b/i,
];
const CLAIM_WORDS = [
  /\bpainless\b/i, /\bpain[- ]free\b/i, /\bno pain\b/i, /\bwalang sakit\b/i, /\bguarantee/i, /\bcure[sd]?\b/i,
  /100\s*%/i, /\bpermanent results?\b/i, /\bbefore[- ]and[- ]after\b/i, /\binstant results?\b/i, /\b(?:totally|completely|100%) safe\b/i,
];

/** Hostnames of every URL-like token, tolerant of trailing punctuation and wrapping brackets. */
function hostnames(body: string): string[] {
  const out: string[] = [];
  const re = /(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?![a-z0-9-])/gi;
  for (const m of body.matchAll(re)) out.push(m[1]!.toLowerCase().replace(/^www\./, ""));
  return out;
}

export type ContentIssue =
  | { code: "starts_with_test"; message: string }
  | { code: "url_shortener"; message: string }
  | { code: "discount_wording"; message: string }
  | { code: "medical_claim"; message: string }
  | { code: "names_treatment"; message: string };

export interface ContentCheckOptions {
  kind: "reminder" | "recall" | "marketing" | "feedback";
  nameTreatmentsAllowed: boolean;
  vertical?: "dental" | "vet" | "aesthetic" | "other";
  sensitiveTerms?: string[];   // clinic-specific words; the send pipeline adds the clinic's service categories for human clinics
}

// Human treatments are health data under the DPA, so they stay off lock screens by default.
// Stems match plurals and Taglish forms ("brace" matches "braces", "pasta" = filling, "bunot" = extraction).
// Pet care (vaccines, deworming) is not human health data and is useful in a reminder, so vets
// only block euthanasia wording by default.
const DEFAULT_SENSITIVE: Record<"human" | "vet", string[]> = {
  human: ["extraction", "root canal", "rct", "botox", "filler", "brace", "denture", "implant", "whitening",
    "gum disease", "laser", "filling", "pasta", "bunot", "pustiso", "retainer", "aligner"],
  vet: ["euthan"],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function checkContent(body: string, opts: ContentCheckOptions): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (/^\s*test/i.test(body)) {
    issues.push({ code: "starts_with_test", message: "Semaphore silently drops texts that begin with TEST." });
  }
  for (const host of hostnames(body)) {
    if (SHORTENERS.has(host)) issues.push({ code: "url_shortener", message: `${host} links are blocked by Smart.` });
  }
  if (opts.kind === "marketing") {
    for (const re of DISCOUNT_WORDS) {
      if (re.test(body)) issues.push({ code: "discount_wording", message: `"${body.match(re)?.[0]}" reads as a sales promotion (DTI permit). Core marketing is announcements only.` });
    }
  }
  for (const re of CLAIM_WORDS) {
    if (re.test(body)) issues.push({ code: "medical_claim", message: `"${body.match(re)?.[0]}" is a results claim.` });
  }
  if (!opts.nameTreatmentsAllowed) {
    const terms = [...DEFAULT_SENSITIVE[opts.vertical === "vet" ? "vet" : "human"], ...(opts.sensitiveTerms ?? [])];
    for (const t of new Set(terms.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
      if (new RegExp(`\\b${escapeRe(t)}`, "i").test(body)) {
        issues.push({ code: "names_treatment", message: `"${t}" names a treatment; default texts must not (lock-screen privacy).` });
      }
    }
  }
  return issues;
}
