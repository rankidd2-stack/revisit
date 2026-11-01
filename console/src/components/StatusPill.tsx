export type Status = "due" | "scheduled" | "sent" | "booked" | "paused" | "opted_out" | "failed";

const LABEL: Record<Status, string> = {
  due: "Due", scheduled: "Scheduled", sent: "Approved", booked: "Booked", paused: "Paused", opted_out: "Opted out", failed: "Failed",
};

/** Every status shows a word as well as a color. */
export function StatusPill({ status, label }: { status: Status; label?: string }) {
  return <span className={`pill pill-${status} label`}>{label ?? LABEL[status]}</span>;
}
