import { normalizePhMobile } from "./phone.js";

export interface CsvRow { cells: string[]; line: number }

/**
 * RFC 4180-style CSV parser: quoted fields, escaped quotes, CRLF or LF. Each row carries the
 * source line it started on. A quote only opens a quoted field at the start of a field; a stray
 * quote mid-field (Ana "Bing" Cruz) is kept as text, so it can never swallow the rows after it.
 * A file that ends inside a quoted field is rejected.
 */
export function parseCsvRows(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  const src = text.replace(/^﻿/, "");
  const endRow = () => {
    row.push(field); field = "";
    if (row.some((f) => f.trim() !== "")) rows.push({ cells: row, line: rowStart });
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === "\n") line++;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') {
        // A closing quote must end the field; anything else means a stray opening quote that
        // would merge rows, so reject the file instead of guessing.
        const next = src[i + 1];
        if (next !== undefined && next !== "," && next !== "\n" && next !== "\r") {
          throw new Error(`Malformed quotes on line ${line}; fix the file and import again.`);
        }
        quoted = false;
      }
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") { i++; line++; }
      else if (ch === "\r") line++;
      endRow();
      rowStart = line;
    } else field += ch;
  }
  if (quoted) throw new Error(`Unclosed quote starting on line ${rowStart}; fix the file and import again.`);
  endRow();
  return rows;
}

export function parseCsv(text: string): string[][] {
  return parseCsvRows(text).map((r) => r.cells);
}

export type TargetField = "full_name" | "mobile" | "email" | "external_ref" | "asset_label" | "species" | "service_category" | "last_visit_on";

/** Header synonyms a clinic spreadsheet is likely to use (English and Filipino). AI mapping replaces this later. */
const SYNONYMS: Record<TargetField, string[]> = {
  full_name: ["name", "full name", "patient", "patient name", "client", "client name", "owner", "owner name", "pangalan"],
  mobile: ["mobile", "phone", "cell", "cellphone", "contact", "contact no", "contact number", "cp", "numero"],
  email: ["email", "e-mail", "email address"],
  external_ref: ["id", "patient id", "client id", "record no", "file no"],
  asset_label: ["pet", "pet name", "patient (pet)", "animal"],
  species: ["species", "type", "animal type"],
  service_category: ["service", "procedure", "visit type", "treatment"],
  last_visit_on: ["last visit", "date", "visit date", "last visit date", "date of visit"],
};

const OWNER_HEADERS = ["owner", "owner name", "client", "client name"];
const PATIENT_HEADERS = ["patient", "patient name"];

const clean = (h: string) => h.toLowerCase().replace(/[.:#]/g, "").replace(/\s+/g, " ").trim();

export function guessMapping(headers: string[]): Partial<Record<TargetField, number>> {
  const keys = headers.map(clean);
  const mapping: Partial<Record<TargetField, number>> = {};
  // Vet files: "Patient" is the pet and "Owner"/"Client" is the person who receives texts.
  const owner = keys.findIndex((k) => OWNER_HEADERS.includes(k));
  const patient = keys.findIndex((k) => PATIENT_HEADERS.includes(k));
  if (owner >= 0 && patient >= 0) { mapping.full_name = owner; mapping.asset_label = patient; }
  keys.forEach((key, i) => {
    if (Object.values(mapping).includes(i)) return;
    for (const [field, names] of Object.entries(SYNONYMS) as [TargetField, string[]][]) {
      if (mapping[field] === undefined && names.includes(key)) { mapping[field] = i; break; }
    }
  });
  return mapping;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export interface DateBounds { min: string; max: string }   // inclusive, YYYY-MM-DD

/**
 * Accepts YYYY-MM-DD, MM/DD/YYYY (PH default), "Month D, YYYY" and "D Month YYYY".
 * Rejects impossible dates (no rollover), and anything outside the bounds (future visits,
 * or older than the floor). Returns YYYY-MM-DD or null.
 */
export function normalizeDate(raw: string | undefined, bounds?: DateBounds, order: "MDY" | "DMY" = "MDY"): string | null {
  if (!raw) return null;
  // Spreadsheet exports often add a time ("6/15/2025 0:00" or "2025-06-15T00:00:00"); drop it.
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ")
    .replace(/(?:t| )\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?: ?[ap]\.?m\.?)?z?$/, "");
  let y: number, mo: number, d: number, m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; }
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/))) {
    [mo, d] = order === "DMY" ? [+m[2]!, +m[1]!] : [+m[1]!, +m[2]!];
    y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;   // Excel short dates; visits before 2000 are out of bounds anyway
  }
  else if ((m = s.match(/^([a-z]+)\.? (\d{1,2}),? (\d{4})$/))) { mo = MONTHS.indexOf(m[1]!.slice(0, 3)) + 1; d = +m[2]!; y = +m[3]!; }
  else if ((m = s.match(/^(\d{1,2}) ([a-z]+)\.?,? (\d{4})$/))) { d = +m[1]!; mo = MONTHS.indexOf(m[2]!.slice(0, 3)) + 1; y = +m[3]!; }
  else return null;
  if (mo < 1 || mo > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const iso = dt.toISOString().slice(0, 10);
  if (bounds && (iso < bounds.min || iso > bounds.max)) return null;
  return iso;
}

const SPECIES: [RegExp, "dog" | "cat" | "bird" | "rabbit"][] = [
  [/^(dog|dogs|canine|k9|k-9|puppy|aso|tuta|aspin|askal)$/i, "dog"],
  [/^(cat|cats|feline|kitten|pusa|kuting|puspin)$/i, "cat"],
  [/^(bird|avian|parrot|ibon)$/i, "bird"],
  [/^(rabbit|bunny|kuneho)$/i, "rabbit"],
];
/** Maps clinic wording onto the schema's species list; anything else non-empty becomes "other". */
export function normalizeSpecies(raw: string | undefined): "dog" | "cat" | "bird" | "rabbit" | "other" | null {
  const v = raw?.trim();
  if (!v) return null;
  return SPECIES.find(([re]) => re.test(v))?.[1] ?? "other";
}

/**
 * PH files are usually MM/DD, but some clinic systems export DD/MM. If any slash date in the
 * column has a first part above 12 (and none has a second part above 12), the file is DD/MM.
 */
export function detectDateOrder(values: (string | undefined)[]): "MDY" | "DMY" {
  let dayFirst = false, monthFirst = false;
  for (const v of values) {
    const m = v?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(?:\d{4}|\d{2})\b/);
    if (!m) continue;
    if (+m[1]! > 12) dayFirst = true;
    if (+m[2]! > 12) monthFirst = true;
  }
  return dayFirst && !monthFirst ? "DMY" : "MDY";
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

export interface ImportedRow {
  fullName: string;
  mobile: string | null;
  email: string | null;
  externalRef: string | null;
  assetLabel: string | null;
  /** self = the contact; dependent = a family member sharing the contact's number; pet. */
  assetKind: "self" | "dependent" | "pet";
  species: "dog" | "cat" | "bird" | "rabbit" | "other" | null;
  serviceCategory: string | null;
  lastVisitOn: string | null;
  line: number;
}

export interface ImportResult {
  rows: ImportedRow[];
  rejected: { line: number; reason: string }[];
  skippedMuted: number;
  unmappedServices: number;   // service values that matched no clinic category and were dropped
  mergedDuplicates: number;   // same person and asset twice in one file; latest visit kept
  dependentsGrouped: number;  // rows whose name differed from the number's first holder; filed as dependents
  emailsDropped: number;      // email already belonged to another contact in this file
  unusableMobiles: number;    // mobile present but not a PH mobile; row kept if it has an email
  dateOrder: "MDY" | "DMY";   // shown to the clinic so they can confirm before import
}

export interface ImportOptions {
  /** Muted mobiles (639...) and emails (lowercased). Never re-added by an import. */
  muted: { mobiles: Set<string>; emails: Set<string> };
  /** The clinic's own service categories. Imported service text is mapped onto these or dropped,
   *  so free-text clinical detail ("RCT #14 abscess") never enters the database. */
  serviceCategories: string[];
  /** Visit dates outside these bounds are rejected. Default: 2000-01-01 to today. */
  dateBounds: DateBounds;
  mapping?: Partial<Record<TargetField, number>>;
  /** Aesthetic clinics never group a household under one number (more sensitive services). */
  vertical?: "dental" | "vet" | "aesthetic" | "other";
}

/** Same person despite spacing, case or "Last, First" order. */
function sameName(a: string, b: string): boolean {
  const tokens = (n: string) => n.toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
  return tokens(a) === tokens(b);
}

/** Labels are names only: drop bracketed notes and anything after a dash ("Bantay (on meds) - biter"). */
function cleanLabel(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").split(/\s[-\u2013\u2014]\s/)[0]!.replace(/\s+/g, " ").trim().slice(0, 30);
  return v || null;
}

/** Same person, asset and service twice: keep the latest visit, but never lose a field the other row had. */
function mergeRows(a: ImportedRow, b: ImportedRow): ImportedRow {
  const [newer, older] = (b.lastVisitOn ?? "") > (a.lastVisitOn ?? "") ? [b, a] : [a, b];
  return {
    ...newer,
    email: newer.email ?? older.email,
    externalRef: newer.externalRef ?? older.externalRef,
    species: newer.species ?? older.species,
    line: Math.min(a.line, b.line),
  };
}

function matchCategory(raw: string | undefined, categories: string[]): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return categories.find((c) => c.toLowerCase() === v) ?? null;
}

/**
 * Turns a clinic CSV into clean rows. Muted numbers and emails stay muted: they are counted and
 * skipped, so an old export can never re-add someone who opted out (locked decision 10).
 * Rejection reasons never echo cell content, so they are safe to store and log.
 */
export function importCsv(text: string, opts: ImportOptions): ImportResult {
  const { muted, serviceCategories, mapping, dateBounds } = opts;
  const [header, ...data] = parseCsvRows(text);
  const out: ImportResult = { rows: [], rejected: [], skippedMuted: 0, unmappedServices: 0, mergedDuplicates: 0, dependentsGrouped: 0, emailsDropped: 0, unusableMobiles: 0, dateOrder: "MDY" };
  if (!header) return out;
  const map = mapping ?? guessMapping(header.cells);
  if (map.full_name === undefined) throw new Error("No name column found; map columns manually.");
  const get = (r: string[], f: TargetField) => (map[f] === undefined ? undefined : r[map[f]!]?.trim() || undefined);
  out.dateOrder = detectDateOrder(data.map((d) => get(d.cells, "last_visit_on")));
  const hasPetColumn = map.asset_label !== undefined;

  // One contact per mobile (or email if there is no mobile). In PH a parent's number often covers
  // the whole family: the first name seen holds the number, later names become dependents.
  // Aesthetic clinics don't group: a second name on a number is rejected for the clinic to sort out.
  const holderName = new Map<string, string>();     // contact key -> holder's name
  const emailOwner = new Map<string, string>();     // email -> contact key
  const byKey = new Map<string, ImportedRow>();
  const group = opts.vertical !== "aesthetic";

  for (const { cells: r, line } of data) {
    const fullName = get(r, "full_name");
    if (!fullName) { out.rejected.push({ line, reason: "missing name" }); continue; }
    if (/[\r\n]/.test(fullName)) { out.rejected.push({ line, reason: "name spans several lines" }); continue; }
    const rawMobile = get(r, "mobile");
    const mobile = normalizePhMobile(rawMobile);
    const rawEmail = get(r, "email")?.toLowerCase();
    const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : null;
    if (!mobile && !email) {
      out.rejected.push({ line, reason: rawMobile || rawEmail ? "unusable mobile and email" : "no mobile or email" });
      continue;
    }
    if ((mobile && muted.mobiles.has(mobile)) || (email && muted.emails.has(email))) { out.skippedMuted++; continue; }
    if (rawMobile && !mobile) out.unusableMobiles++;
    const rawService = get(r, "service_category");
    const serviceCategory = matchCategory(rawService, serviceCategories);
    if (rawService && !serviceCategory) out.unmappedServices++;
    const rawDate = get(r, "last_visit_on");
    const lastVisitOn = normalizeDate(rawDate, dateBounds, out.dateOrder);
    if (rawDate && !lastVisitOn) { out.rejected.push({ line, reason: "unreadable or out-of-range date" }); continue; }

    // A mobile row for someone first seen email-only: move that contact onto the mobile.
    if (mobile && email && emailOwner.get(email) === email && !holderName.has(mobile)) {
      rekey(email, mobile);
    }
    const contactKey = mobile ?? emailOwner.get(email!) ?? email!;
    let rowEmail = email;
    if (email) {
      const owner = emailOwner.get(email);
      if (!owner) emailOwner.set(email, contactKey);
      else if (owner !== contactKey) { rowEmail = null; out.emailsDropped++; }
    }
    const holder = holderName.get(contactKey);
    const sameHolder = !holder || sameName(holder, fullName);
    if (!sameHolder && !group) { out.rejected.push({ line, reason: "number already used by another patient" }); continue; }
    if (!holder) holderName.set(contactKey, fullName);
    let assetLabel = cleanLabel(get(r, "asset_label"));
    let assetKind: ImportedRow["assetKind"] = hasPetColumn && assetLabel ? "pet" : "self";
    if (!sameHolder && assetKind === "self") { assetLabel = cleanLabel(fullName); assetKind = "dependent"; out.dependentsGrouped++; }

    const row: ImportedRow = {
      fullName: holder ?? fullName, mobile, email: rowEmail,
      externalRef: get(r, "external_ref") ?? null,
      assetLabel, assetKind,
      species: assetKind === "pet" ? normalizeSpecies(get(r, "species")) : null,
      serviceCategory, lastVisitOn, line,
    };
    const key = `${contactKey}|${(assetLabel ?? "").toLowerCase()}|${serviceCategory ?? ""}`;
    const prev = byKey.get(key);
    if (prev) { out.mergedDuplicates++; byKey.set(key, mergeRows(prev, row)); }
    else byKey.set(key, row);
  }

  function rekey(from: string, to: string) {
    holderName.set(to, holderName.get(from)!);
    holderName.delete(from);
    emailOwner.set(from, to);
    for (const [k, v] of [...byKey]) {
      if (k.startsWith(`${from}|`)) { byKey.delete(k); byKey.set(`${to}${k.slice(from.length)}`, { ...v, mobile: to }); }
    }
  }
  out.rows = [...byKey.values()].sort((a, b) => a.line - b.line);
  return out;
}
