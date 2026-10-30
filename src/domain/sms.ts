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
    .replace(/₱\s?/g, "P")
    .replace(/％/g, "%")
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

const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "s.id", "tiny.cc", "rebrand.ly", "t.ly", "buff.ly", "bitly.com", "bit.do", "shorturl.asia", "lnkd.in",
  "t.me", "j.mp", "qrco.de", "g.page", "forms.gle", "goo.su", "v.gd", "shorte.st", "adf.ly"]);
/** True if the host or any parent domain is a known shortener (maps.app.goo.gl -> goo.gl). */
function isShortener(host: string): boolean {
  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) if (SHORTENERS.has(parts.slice(i).join("."))) return true;
  return false;
}
const DISCOUNT_WORDS = [
  /%\s*off/i, /\bsale\b/i, /\bpromo\b/i, /\bdiscount/i, /\bfree with\b/i, /\bbuy\s*1\b/i, /\bless\s+\d/i,
  /\bcodes?\b/i, /\bvouchers?\b/i, /\brewards?\b/i, /\bpoints\b/i, /\bstamps?\b/i, /\braffle/i, /\bcashback\b/i,
  /(?:p|php|₱)\s?\d[\d,]*\s*off/i, /\bbawas\b/i, /\blibre\s+(?:ang|na|sa)\b/i,
  // purchase-linked freebies, contests and bundles (a free event with no purchase is fine)
  /\b(?:with|for) every\b/i, /\bsa bawat\b/i, /\bgiveaways?\b/i, /\bfreebies?\b/i, /\bprizes?\b/i, /\bwin\b/i,
  /\bcontests?\b/i, /\bbuy\s*(?:1|one)\b/i, /\btake\s*(?:1|one)\b/i, /\bhalf[- ]?price\b/i,
  /\bsave\s*(?:p|php|₱)?\s?\d/i, /\bbundles?\b/i, /%\s*less\b/i, /\bfree gift\b/i,
];
const CLAIM_WORDS = [
  /\bpainless\b/i, /\bpain[- ]free\b/i, /\bno pain\b/i, /\bwalang sakit\b/i, /\bguarantee/i, /\bcure[sd]?\b/i,
  /100\s*%/i, /\bpermanent results?\b/i, /\bbefore\s*(?:-|&|\/|and)\s*after\b/i, /\binstant results?\b/i, /\b(?:totally|completely|100%) safe\b/i,
  /\b(?:hindi|di) masakit\b/i, /\bgarantisado\b/i, /\bsigurado(?:ng)? resulta\b/i, /\brisk[- ]free\b/i,
  /\bno side effects?\b/i, /\bsafe and effective\b/i,
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
  /** Routine visit words may be named. Off unless the caller turns it on; never on for a text about someone else. */
  allowVisitWords?: boolean;
  /**
   * The text treatment words are matched in, when it differs from `body`: the send pipeline passes the
   * approved template with the patient's, pet's and clinic's names masked, so a name ("Stephanie",
   * "Psych Wellness Center") never blocks a text and only the approved wording is judged.
   */
  treatmentText?: string;
}

// Human treatments are health data under the DPA, so they stay off lock screens by default.
// English stems match from a word start ("brace" matches "braces"); stems of 3 letters or fewer
// ("rct", "sti") match as whole words so they never hit ordinary words. Filipino stems match anywhere in
// a word, because Tagalog affixes and infixes wrap the root: magpabunot, pinapastahan, nagpapustiso.
// Pet care (vaccines, deworming) is not human health data and is useful in a reminder, so vets
// only block euthanasia wording by default.
const DEFAULT_SENSITIVE: Record<"human" | "vet", string[]> = {
  human: ["extraction", "root canal", "rct", "botox", "filler", "brace", "denture", "implant", "whitening",
    "gum disease", "laser", "filling", "retainer", "aligner", "ortho", "veneer", "crown", "cavit", "scaling", "wisdom tooth", "surger",
    "x-ray", "xray", "periodont",
    // Sensitive health care a GP, OB or other human clinic might put before an allowed visit word
    // ("STD check-up", "pregnancy consultation"). Sexual, reproductive and mental health first.
    "hiv", "std", "sti", "pregnan", "prenatal", "antenatal", "postnatal", "pap smear", "ob-gyn", "obgyn", "gyne", "obstet",
    "ivf", "fertility", "contracept", "family planning", "psych", "mental health", "counsel", "rehab", "onco", "cancer", "chemo",
    "tumor", "tumour", "dialysis", "hepatitis", "tuberculosis", "diabet", "ultrasound", "vasectom", "ligation",
    "infertil", "syphil", "gonorr", "herpes", "chlamyd", "abort", "miscarr", "menopaus", "buntis", "tuli", "depress", "anxiety",
    "autis", "therap", "hypertens", "kidney", "renal", "cardi", "urolog", "biops", "mammo", "breast", "hormone", "transgender",
    "drug test", "circumcis", "addict"],
  vet: ["euthan"],
};
const FILIPINO_ROOTS = ["pasta", "bunot", "pustiso"];
// Default words that only ever match whole (plurals included), because as a word start they hit ordinary text ("hearing aids").
const DEFAULT_WHOLE_WORDS = ["aids", "tb", "ob", "hpv", "pcos", "adhd"];

// Routine visit words allowed in default texts for every human clinic (Patrick, 2026-10-30): they
// say nothing a clinic's sender name doesn't already say. English words only. A clinic category made
// only of these words, generic qualifiers and "and" ("Dental check-up", "Cleaning and check-up") is
// not treated as a treatment name. Anything more ("Deep cleaning") still blocks, and the default
// treatment list still applies.
export const ALLOWED_VISIT_WORDS = ["cleaning", "check-up", "consultation"] as const;
// Short forms ("consult", "check", "clean") are the same three words as clinics write them.
const ROUTINE_WORDS = new Set(["cleaning", "cleanings", "clean", "checkup", "checkups", "check", "checks",
  "consultation", "consultations", "consult", "consults"]);
const QUALIFIERS = new Set(["dental", "teeth", "tooth", "general", "routine", "regular", "annual"]);

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

// Blank characters Unicode counts as letters or symbols, not format characters (Hangul fillers, braille blank).
const BLANK_LETTERS = /[\u115f\u1160\u3164\uffa0\u2800]/gu;

/** Lowercase, accents and width folded (é -> e, full-width letters -> ASCII), invisible characters dropped. */
function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{Cf}/gu, "").replace(BLANK_LETTERS, "").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Text as the treatment matcher sees it: only letters, digits and single spaces, with
 * check-up/checkup/check up spelled one way. `spaced` turns every other character into a space, so
 * "deep-cleaning" and a line break between the words both read "deep cleaning". `joined` drops
 * punctuation instead, so "pre-natal" reads "prenatal". `solid` (for terms only) also drops spaces,
 * so "deep cleaning" catches "deepcleaning". A word in the text split by a plain space is not rejoined.
 */
type Form = "spaced" | "joined" | "solid";
function forMatching(s: string, mode: Form = "spaced"): string {
  let t = fold(s);
  if (mode === "joined") t = t.replace(/[^\p{L}\p{N}\s]+/gu, "");
  if (mode === "solid") t = t.replace(/[^\p{L}\p{N}]+/gu, "");
  return t.replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/(?<![\p{L}\p{N}])check ?ups?(?![\p{L}\p{N}])/gu, (m) => (m.endsWith("s") ? "checkups" : "checkup"))
    .trim();
}

const wordsOf = (t: string) => t.split(" ").filter(Boolean);

/** True if a clinic term is only routine visit words (with generic qualifiers and "and"), so naming it in a default text is fine. */
export function isAllowedVisitTerm(term: string): boolean {
  const words = wordsOf(forMatching(term));
  return words.some((w) => ROUTINE_WORDS.has(w)) && words.every((w) => ROUTINE_WORDS.has(w) || QUALIFIERS.has(w) || w === "and");
}

// Words that say nothing on their own, so a clinic category word on this list never blocks by itself.
const PLAIN_WORDS = new Set([...ROUTINE_WORDS, ...QUALIFIERS,
  "a", "an", "and", "or", "of", "for", "the", "to", "in", "on", "at", "by", "with", "per", "dr", "dra", "doc", "mr", "ms", "mrs",
  "visit", "visits", "appointment", "appointments", "session", "sessions", "follow", "up", "due", "care", "service", "services",
  "new", "first", "adult", "adults", "kids", "child", "children", "patient", "patients", "family", "clinic", "test", "tests",
  "min", "mins", "minute", "minutes", "hr", "hrs", "hour", "hours", "day", "days", "week", "weeks", "month", "months", "year", "years"]);

const FORMS: readonly Form[] = ["spaced", "joined", "solid"];

interface Matcher { re: RegExp; shown: string; source: string | null }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const START = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";

/** 4 letters or more: from a word start, so "psych" blocks "psychiatry". Shorter: a whole word or its plural, so "sti" never blocks "still". */
function wordPattern(t: string): string {
  return t.replace(/ /g, "").length >= 4 ? START + escapeRe(t) : START + escapeRe(t) + "(?:e?s)?" + END;
}

/**
 * Patterns a default text must not contain.
 *  - Default stems and clinic words follow `wordPattern`; Filipino roots match anywhere in a word.
 *  - A clinic category matches as a whole phrase, and each of its words of 2 letters or more
 *    ("TB", "HIV", "deep") also blocks alone, unless it is a plain word or a number ("30", "2nd").
 *  - With the allowlist on, a category of only routine words blocks nothing and routine words never
 *    block alone. With it off (texts about someone else) they block like any other word.
 */
function treatmentMatchers(human: boolean, clinicTerms: string[], allowVisitWords: boolean): Matcher[] {
  const out = new Map<string, Matcher>();
  const add = (pattern: string, shown: string, source: string | null) => {
    if (!out.has(pattern)) out.set(pattern, { re: new RegExp(pattern, "u"), shown, source });
  };
  for (const stem of DEFAULT_SENSITIVE[human ? "human" : "vet"]) {
    for (const mode of FORMS) {
      const t = forMatching(stem, mode);
      if (t) add(wordPattern(t), stem, null);
    }
  }
  if (human) {
    for (const root of FILIPINO_ROOTS) add(escapeRe(root), root, null);
    for (const w of DEFAULT_WHOLE_WORDS) add(START + escapeRe(w) + "(?:e?s)?" + END, w, null);
  }
  for (const term of clinicTerms) {
    if (typeof term !== "string" || !LETTER_OR_DIGIT.test(term)) continue;
    if (allowVisitWords && isAllowedVisitTerm(term)) continue;
    const label = term.trim().replace(/\s+/g, " ");
    for (const mode of FORMS) {
      const t = forMatching(term, mode);
      if (!t) continue;
      add(wordPattern(t), t, label);
      if (mode === "solid") continue;
      for (const w of wordsOf(t)) {
        if (w.length < 2 || /^\p{N}+(?:st|nd|rd|th)?$/u.test(w)) continue;
        const plain = PLAIN_WORDS.has(w) && !(ROUTINE_WORDS.has(w) && !allowVisitWords);
        if (!plain) add(wordPattern(w), w, label);
      }
    }
  }
  return [...out.values()];
}

export function checkContent(body: string, opts: ContentCheckOptions): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (/^\s*test/i.test(body)) {
    issues.push({ code: "starts_with_test", message: "Semaphore silently drops texts that begin with TEST." });
  }
  for (const host of hostnames(body)) {
    if (isShortener(host)) issues.push({ code: "url_shortener", message: `${host} links are blocked by Smart.` });
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
    const human = opts.vertical !== "vet";
    const judged = opts.treatmentText ?? body;
    const texts = [forMatching(judged, "spaced"), forMatching(judged, "joined")];
    const seen = new Set<string>();
    for (const m of treatmentMatchers(human, opts.sensitiveTerms ?? [], opts.allowVisitWords === true)) {
      if (!texts.some((t) => m.re.test(t))) continue;
      const from = m.source ? ` (from the clinic service "${m.source}")` : "";
      const message = `"${m.shown}"${from} names a treatment; default texts must not (lock-screen privacy).`;
      if (!seen.has(message)) { seen.add(message); issues.push({ code: "names_treatment", message }); }
    }
  }
  return issues;
}
