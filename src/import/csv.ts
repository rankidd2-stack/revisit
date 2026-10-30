import { normalizePhMobile } from "./phone.js";

/** RFC 4180-style CSV parser: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export type TargetField = "full_name" | "mobile" | "email" | "external_ref" | "asset_label" | "species" | "service_category" | "last_visit_on";

/** Header synonyms a clinic spreadsheet is likely to use (English and Filipino). AI mapping replaces this later. */
const SYNONYMS: Record<TargetField, string[]> = {
  full_name: ["name", "full name", "patient", "patient name", "client", "owner", "owner name", "pangalan"],
  mobile: ["mobile", "phone", "cell", "cellphone", "contact", "contact no", "contact number", "cp", "numero"],
  email: ["email", "e-mail", "email address"],
  external_ref: ["id", "patient id", "client id", "record no", "file no"],
  asset_label: ["pet", "pet name", "patient (pet)", "animal"],
  species: ["species", "type", "breed type"],
  service_category: ["service", "procedure", "visit type", "treatment"],
  last_visit_on: ["last visit", "date", "visit date", "last visit date", "date of visit"],
};

export function guessMapping(headers: string[]): Partial<Record<TargetField, number>> {
  const mapping: Partial<Record<TargetField, number>> = {};
  headers.forEach((h, i) => {
    const key = h.toLowerCase().replace(/[.:#]/g, "").replace(/\s+/g, " ").trim();
    for (const [field, names] of Object.entries(SYNONYMS) as [TargetField, string[]][]) {
      if (mapping[field] === undefined && names.includes(key)) { mapping[field] = i; break; }
    }
  });
  return mapping;
}

/** Accepts YYYY-MM-DD, MM/DD/YYYY (PH default), and Month D, YYYY. Returns YYYY-MM-DD or null. */
export function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; }
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { mo = +m[1]!; d = +m[2]!; y = +m[3]!; }
  else {
    const t = Date.parse(`${s} 00:00:00 UTC`);
    if (Number.isNaN(t)) return null;
    const dt = new Date(t);
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export interface ImportedRow {
  fullName: string;
  mobile: string | null;
  email: string | null;
  externalRef: string | null;
  assetLabel: string | null;
  species: string | null;
  serviceCategory: string | null;
  lastVisitOn: string | null;
}

export interface ImportResult {
  rows: ImportedRow[];
  rejected: { line: number; reason: string }[];
  skippedMuted: number;
  unmappedServices: number;   // service values that matched no clinic category and were dropped
}

export interface ImportOptions {
  /** Muted mobiles (639...) and emails (lowercased). Never re-added by an import. */
  muted: { mobiles: Set<string>; emails: Set<string> };
  /** The clinic's own service categories. Imported service text is mapped onto these or dropped,
   *  so free-text clinical detail ("RCT #14 abscess") never enters the database. */
  serviceCategories: string[];
  mapping?: Partial<Record<TargetField, number>>;
}

function matchCategory(raw: string | undefined, categories: string[]): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return categories.find((c) => c.toLowerCase() === v) ?? null;
}

/**
 * Turns a clinic CSV into clean rows. Muted numbers and emails stay muted: they are counted and
 * skipped, so an old export can never re-add someone who opted out (locked decision 10).
 */
export function importCsv(text: string, opts: ImportOptions): ImportResult {
  const { muted, serviceCategories, mapping } = opts;
  const [header, ...data] = parseCsv(text);
  if (!header) return { rows: [], rejected: [], skippedMuted: 0, unmappedServices: 0 };
  const map = mapping ?? guessMapping(header);
  if (map.full_name === undefined) throw new Error("No name column found; map columns manually.");
  const get = (r: string[], f: TargetField) => (map[f] === undefined ? undefined : r[map[f]!]?.trim() || undefined);

  const out: ImportResult = { rows: [], rejected: [], skippedMuted: 0, unmappedServices: 0 };
  data.forEach((r, i) => {
    const line = i + 2;
    const fullName = get(r, "full_name");
    if (!fullName) { out.rejected.push({ line, reason: "missing name" }); return; }
    const rawMobile = get(r, "mobile");
    const mobile = normalizePhMobile(rawMobile);
    const email = get(r, "email")?.toLowerCase() ?? null;
    if (rawMobile && !mobile && !email) { out.rejected.push({ line, reason: "unusable number" }); return; }
    if (!mobile && !email) { out.rejected.push({ line, reason: "no mobile or email" }); return; }
    if ((mobile && muted.mobiles.has(mobile)) || (email && muted.emails.has(email))) { out.skippedMuted++; return; }
    const rawService = get(r, "service_category");
    const serviceCategory = matchCategory(rawService, serviceCategories);
    if (rawService && !serviceCategory) out.unmappedServices++;
    const rawDate = get(r, "last_visit_on");
    const lastVisitOn = normalizeDate(rawDate);
    if (rawDate && !lastVisitOn) { out.rejected.push({ line, reason: "unreadable date" }); return; }
    out.rows.push({
      fullName, mobile, email,
      externalRef: get(r, "external_ref") ?? null,
      assetLabel: get(r, "asset_label") ?? null,
      species: get(r, "species") ?? null,
      serviceCategory,
      lastVisitOn,
    });
  });
  return out;
}
