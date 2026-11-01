import { addDays, daysBetween } from "./time.js";

export interface RecallRule {
  serviceCategory: string;
  intervalDays: number;
  /** Offsets from the due date; default -7 (heads-up), 0 (due), 14 and 60 (win-back). */
  stepOffsetsDays: number[];
}

export interface RecallInput {
  rule: RecallRule;
  lastVisitOn: string | null;          // YYYY-MM-DD, latest visit for this service category
  hasUpcomingAppointment: boolean;     // booked or confirmed, in the future
  stepsAlreadySent: number[];          // offsets already sent for the current cycle (this last visit)
}

/**
 * A step missed by more than this many days is skipped, never sent late. One constant, so the daily
 * queue and the send-time recheck can never disagree (R108, R115).
 */
export const RECALL_GRACE_DAYS = 14;

export type RecallDecision =
  | { action: "none"; reason: "no_visit" | "booked" | "not_yet" | "sequence_done" | "lapsed" }
  | { action: "send"; dueOn: string; stepOffsetDays: number; stepIndex: number };

/**
 * Decides whether a recall step is due today for one asset and service.
 * - Only the latest due, unsent step can fire, so a late import never produces a burst.
 * - A step older than the grace window is skipped. A patient whose whole sequence ended long ago
 *   is "lapsed": they belong in an approved win-back campaign, not an automatic "you're due" text.
 */
export function nextRecallStep(input: RecallInput, today: string): RecallDecision {
  const { rule, lastVisitOn, hasUpcomingAppointment, stepsAlreadySent } = input;
  const grace = RECALL_GRACE_DAYS;
  if (!lastVisitOn) return { action: "none", reason: "no_visit" };
  if (hasUpcomingAppointment) return { action: "none", reason: "booked" };

  const dueOn = addDays(lastVisitOn, rule.intervalDays);
  const steps = [...new Set(rule.stepOffsetsDays)].sort((a, b) => a - b);
  if (!steps.length) return { action: "none", reason: "sequence_done" };

  const lastStepDate = addDays(dueOn, steps[steps.length - 1]!);
  const maxSent = stepsAlreadySent.length ? Math.max(...stepsAlreadySent) : -Infinity;
  if (maxSent >= steps[steps.length - 1]!) return { action: "none", reason: "sequence_done" };
  if (daysBetween(lastStepDate, today) > grace) return { action: "none", reason: "lapsed" };

  let index = -1;
  steps.forEach((offset, i) => { if (addDays(dueOn, offset) <= today) index = i; });
  if (index < 0) return { action: "none", reason: "not_yet" };

  const offset = steps[index]!;
  if (offset <= maxSent) return { action: "none", reason: "not_yet" };
  if (daysBetween(addDays(dueOn, offset), today) > grace) return { action: "none", reason: "not_yet" };
  return { action: "send", dueOn, stepOffsetDays: offset, stepIndex: index };
}
