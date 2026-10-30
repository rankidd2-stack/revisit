/**
 * Normalizes Philippine mobile numbers to 639XXXXXXXXX.
 * Accepts 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX, with spaces, dashes or dots.
 * Returns null for landlines and anything else.
 */
export function normalizePhMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;
  let local: string;
  if (digits.startsWith("63") && digits.length === 12) local = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) local = digits.slice(1);
  else if (digits.length === 10) local = digits;
  else return null;
  return local.startsWith("9") ? `63${local}` : null;
}
