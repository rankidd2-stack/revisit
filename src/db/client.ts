/**
 * The one thing the app needs from a database driver. node-postgres, a Supabase connection and
 * PGlite (tests) all fit. Values always go in `params`, never into the SQL text.
 */
export interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids arrive from queues and URLs; a malformed one is "not found", not a database error. */
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/**
 * Drivers differ: some return timestamptz as Date, some as text, node-postgres gives a number for
 * infinity. An unreadable time throws: a NaN age or window would make the gate checks pass.
 */
export function asDate(v: Date | string | number): Date {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error("Unreadable timestamp from the database");
  return d;
}
