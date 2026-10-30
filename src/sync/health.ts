export interface SyncRun {
  finishedAt: Date | null;
  ok: boolean | null;
}

export type SyncHealth =
  | { healthy: true; lastOkAt: Date }
  | { healthy: false; reason: "never_synced" | "last_run_failed" | "stale" | "clock_skew"; lastOkAt: Date | null };

/**
 * Automated sends pause when the latest sync failed or the last good sync is older than the
 * clinic's threshold (default 72 hours). Locked decision 10.
 */
export function syncHealth(runs: SyncRun[], now: Date, staleAfterHours = 72): SyncHealth {
  const finished = runs.filter((r) => r.finishedAt).sort((a, b) => b.finishedAt!.getTime() - a.finishedAt!.getTime());
  const lastOk = finished.find((r) => r.ok === true);
  if (!finished.length || !lastOk) return { healthy: false, reason: "never_synced", lastOkAt: null };
  // A run "finished" in the future means a wrong clock somewhere; don't trust it as fresh.
  if (finished[0]!.finishedAt!.getTime() > now.getTime() + 10 * 60_000) return { healthy: false, reason: "clock_skew", lastOkAt: lastOk.finishedAt };
  if (finished[0]!.ok !== true) return { healthy: false, reason: "last_run_failed", lastOkAt: lastOk.finishedAt };
  const ageHours = (now.getTime() - lastOk.finishedAt!.getTime()) / 3600_000;
  if (ageHours > staleAfterHours) return { healthy: false, reason: "stale", lastOkAt: lastOk.finishedAt };
  return { healthy: true, lastOkAt: lastOk.finishedAt! };
}
