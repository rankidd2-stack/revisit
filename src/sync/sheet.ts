import { applySync, recordFailedRun, type Db, type SyncOutcome } from "./apply.js";

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const SHEET_ID = /^[A-Za-z0-9_-]{20,100}$/;
const MAX_BYTES = 5_000_000;

/** Pulls a Google Sheet the clinic shared as "anyone with the link can view" as CSV. */
export function sheetCsvUrl(sheetId: string, gid = "0"): string {
  if (!SHEET_ID.test(sheetId)) throw new Error("bad_sheet_id");
  if (!/^[0-9]{1,12}$/.test(gid)) throw new Error("bad_sheet_tab");
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

/** Accepts a pasted sheet link (keeping its tab) or a bare id; returns null if it is neither. */
export function sheetIdFromLink(input: string): { id: string; gid: string } | null {
  const m = input.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  const id = m ? m[1]! : input.trim();
  if (!SHEET_ID.test(id)) return null;
  return { id, gid: input.match(/[#?&]gid=([0-9]{1,12})/)?.[1] ?? "0" };
}

/**
 * The fetcher is injected so tests never touch the network. Error messages are fixed codes;
 * a private sheet (redirect to a sign-in page) comes back as HTML and is reported as such.
 */
export async function fetchSheetCsv(fetcher: Fetcher, sheetId: string, gid = "0"): Promise<string> {
  const res = await fetcher(sheetCsvUrl(sheetId, gid));
  if (!res.ok) throw new Error(`sheet_http_${res.status}`);
  const text = await res.text();
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error("sheet_too_large");
  if (/^[\s\uFEFF]*<(!doctype|html)/i.test(text)) throw new Error("sheet_not_shared");
  return text;
}

/** Fetch then apply. A failed fetch is logged as a failed run so automated sends pause. */
export async function syncSheet(db: Db, clinicId: string, fetcher: Fetcher, sheetId: string, gid = "0", now = new Date()): Promise<SyncOutcome> {
  let text: string;
  try {
    text = await fetchSheetCsv(fetcher, sheetId, gid);
  } catch (e) {
    const code = e instanceof Error && /^[a-z0-9_]{1,64}$/.test(e.message) ? e.message : "sheet_fetch_failed";
    try { await recordFailedRun(db, clinicId, "google_sheet", code); } catch { /* db down: still report the failure */ }
    return { ok: false, runId: "", errorCode: code, contactsAdded: 0, contactsUpdated: 0, contactsSkippedInactive: 0, contactsSkippedMuted: 0, conflicts: 0, visitsAdded: 0, result: null };
  }
  return applySync(db, clinicId, text, "google_sheet", now);
}
