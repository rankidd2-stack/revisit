export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const SHEET_ID = /^[A-Za-z0-9_-]{20,100}$/;
const MAX_BYTES = 5_000_000;

/** Pulls a Google Sheet the clinic shared as "anyone with the link can view" as CSV. */
export function sheetCsvUrl(sheetId: string, gid = "0"): string {
  if (!SHEET_ID.test(sheetId)) throw new Error("bad_sheet_id");
  if (!/^[0-9]{1,12}$/.test(gid)) throw new Error("bad_sheet_tab");
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

/** Accepts a pasted sheet link or a bare id; returns the id or null. */
export function sheetIdFromLink(input: string): string | null {
  const m = input.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  const id = m ? m[1]! : input.trim();
  return SHEET_ID.test(id) ? id : null;
}

/**
 * The fetcher is injected so tests never touch the network. Error messages are fixed codes;
 * a private sheet (redirect to a sign-in page) comes back as HTML and is reported as such.
 */
export async function fetchSheetCsv(fetcher: Fetcher, sheetId: string, gid = "0"): Promise<string> {
  const res = await fetcher(sheetCsvUrl(sheetId, gid));
  if (!res.ok) throw new Error(`sheet_http_${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("sheet_too_large");
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error("sheet_not_shared");
  return text;
}
