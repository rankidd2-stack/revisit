import { addDays } from "./time.js";

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
  stepsAlreadySent: number[];          // offsets already sent for the current cycle
}

export type RecallDecision =
  | { action: "none"; reason: "no_visit" | "booked" | "not_yet" | "sequence_done" }
  | { action: "send"; dueOn: string; stepOffsetDays: number; stepIndex: number };

/**
 * Decides whether a recall step is due today for one asset and service.
 * Only the latest overdue unsent step fires, so a late import never produces a burst of texts.
 */
export function nextRecallStep(input: RecallInput, today: string): RecallDecision {
  const { rule, lastVisitOn, hasUpcomingAppointment, stepsAlreadySent } = input;
  if (!lastVisitOn) return { action: "none", reason: "no_visit" };
  if (hasUpcomingAppointment) return { action: "none", reason: "booked" };

  const dueOn = addDays(lastVisitOn, rule.intervalDays);
  const steps = [...rule.stepOffsetsDays].sort((a, b) => a - b);

  let candidate: { offset: number; index: number } | null = null;
  steps.forEach((offset, index) => {
    if (addDays(dueOn, offset) <= today) candidate = { offset, index };
  });
  if (!candidate) return { action: "none", reason: "not_yet" };

  const { offset, index } = candidate as { offset: number; index: number };
  // Once a later step was sent, earlier ones are skipped for good.
  const maxSent = stepsAlreadySent.length ? Math.max(...stepsAlreadySent) : -Infinity;
  if (stepsAlreadySent.includes(offset) || offset <= maxSent) {
    return { action: "none", reason: index === steps.length - 1 ? "sequence_done" : "not_yet" };
  }
  return { action: "send", dueOn, stepOffsetDays: offset, stepIndex: index };
}
